// canvas-slice.ts
//
// Manages canvas state: components, positions, sizes, and the grid itself.
//
// MUTATION PATTERN:
// Every mutating action follows the same flow:
// 1. Capture beforeSnapshot (for undo)
// 2. Perform mutation via immer draft
// 3. Capture afterSnapshot
// 4. Push to undo stack
// 5. Return CommandResult
//
// This verbosity is intentional - it guarantees every change is undoable.
//
// AUTO-PLACEMENT:
// When position isn't specified, findOpenPosition() scans the grid left-to-right,
// top-to-bottom for the first gap that fits the component. If no space exists,
// it falls back to (0,0) and allows overlap. Users can then drag to reposition.
//
// DATA LIFECYCLE:
// Components start with dataState: { status: "idle" }. After addComponent(),
// if dataBinding exists, we call fetchData() to kick off the data fetch.
// The data slice handles the actual API calls and updates dataState.
//
// See: .claude/plans/store-architecture-v0.1.md

import { StateCreator } from "zustand";
import { nanoid } from "nanoid";
import type { AgenticCanvasStore } from "./index";
import type {
  Canvas,
  GridConfig,
  ComponentInstance,
  ComponentId,
  Position,
  Size,
  CreateComponentPayload,
  UpdateComponentPayload,
  CommandResult,
  CanvasSnapshot,
} from "@/types";
import { createUserSource } from "@/lib/undo/types";
import type { UndoCanvasCommand } from "@/lib/undo/types";

// Initial state
const initialGrid: GridConfig = {
  columns: 12,
  rows: 8,
  gap: 16,
  cellWidth: 0,
  cellHeight: 0,
};

const initialCanvas: Canvas = {
  grid: initialGrid,
  components: [],
};

// Helper to create a deep copy snapshot of components
function createSnapshot(components: ComponentInstance[]): CanvasSnapshot {
  return { components: structuredClone(components) };
}

// Slice interface
export interface CanvasSlice {
  canvas: Canvas;
  selectedComponentId: ComponentId | null;
  addComponent: (payload: CreateComponentPayload) => CommandResult;
  updateComponent: (payload: UpdateComponentPayload) => CommandResult;
  removeComponent: (componentId: ComponentId) => CommandResult;
  moveComponent: (componentId: ComponentId, position: Position) => CommandResult;
  resizeComponent: (componentId: ComponentId, size: Size) => CommandResult;
  clearCanvas: (preservePinned: boolean) => CommandResult;
  setGridDimensions: (cellWidth: number, cellHeight: number) => void;
  selectComponent: (componentId: ComponentId | null) => void;
}

// Slice creator
export const createCanvasSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  CanvasSlice
> = (set, get) => ({
  canvas: initialCanvas,
  selectedComponentId: null,

  addComponent: (payload) => {
    const { typeId, config, dataBinding, position, size, meta } = payload;

    // Capture BEFORE snapshot
    const beforeSnapshot = createSnapshot(get().canvas.components);

    // Default size if not provided
    const finalSize = size ?? { cols: 3, rows: 2 };
    const finalPosition = position ?? findOpenPosition(get().canvas, finalSize);

    // Generate ID
    const componentId = `cmp_${nanoid(10)}`;

    // Create component instance
    const component: ComponentInstance = {
      id: componentId,
      typeId,
      position: finalPosition,
      size: finalSize,
      config,
      dataBinding: dataBinding ?? null,
      dataState: { status: "idle" },
      meta: {
        createdAt: Date.now(),
        createdBy: meta?.createdBy ?? "assistant",
        pinned: meta?.pinned ?? false,
        label: meta?.label,
      },
    };

    // Perform mutation
    set((state) => {
      state.canvas.components.push(component);
    });

    // Capture AFTER snapshot
    const afterSnapshot = createSnapshot(get().canvas.components);

    // Create undo command
    const command: UndoCanvasCommand = {
      type: "component_add",
      component,
    };

    // Push to undo stack (automatically clears redo)
    get().pushUndo({
      source: createUserSource(),
      description: `Added ${typeId}`,
      command,
      beforeSnapshot,
      afterSnapshot,
    });

    // Trigger data fetch if binding exists
    if (dataBinding) {
      get().fetchData(componentId, dataBinding);
    }

    return {
      success: true,
      undoId: componentId,
      explanation: `Added ${typeId} to canvas`,
      affectedComponentIds: [componentId],
    };
  },

  updateComponent: (payload) => {
    const { componentId, config, dataBinding, meta } = payload;

    const component = get().canvas.components.find((c) => c.id === componentId);
    if (!component) {
      return {
        success: false,
        undoId: "",
        explanation: `Component not found: ${componentId}`,
        affectedComponentIds: [],
        error: { code: "COMPONENT_NOT_FOUND", message: "Component not found", componentId },
      };
    }

    // Capture BEFORE snapshot
    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeBinding = component.dataBinding;

    // Perform mutation
    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        if (config) comp.config = { ...comp.config, ...config };
        if (dataBinding !== undefined) comp.dataBinding = dataBinding;
        if (meta) comp.meta = { ...comp.meta, ...meta };
      }
    });

    // Capture AFTER snapshot
    const afterSnapshot = createSnapshot(get().canvas.components);

    // Create undo command
    const command: UndoCanvasCommand = {
      type: "component_update_config",
      componentId,
      from: component.config as Record<string, unknown>,
      to: { ...component.config, ...config } as Record<string, unknown>,
    };

    // Push to undo stack
    get().pushUndo({
      source: createUserSource(),
      description: `Updated component`,
      command,
      beforeSnapshot,
      afterSnapshot,
    });

    // Re-fetch data if binding changed
    if (dataBinding && dataBinding !== beforeBinding) {
      get().fetchData(componentId, dataBinding);
    }

    return {
      success: true,
      undoId: componentId,
      explanation: `Updated component configuration`,
      affectedComponentIds: [componentId],
    };
  },

  removeComponent: (componentId) => {
    const component = get().canvas.components.find((c) => c.id === componentId);
    if (!component) {
      return {
        success: false,
        undoId: "",
        explanation: `Component not found: ${componentId}`,
        affectedComponentIds: [],
        error: { code: "COMPONENT_NOT_FOUND", message: "Component not found", componentId },
      };
    }

    // Capture BEFORE snapshot
    const beforeSnapshot = createSnapshot(get().canvas.components);

    // Perform mutation
    set((state) => {
      state.canvas.components = state.canvas.components.filter((c) => c.id !== componentId);
      // Clear selection if removed component was selected
      if (state.selectedComponentId === componentId) {
        state.selectedComponentId = null;
      }
    });

    // Capture AFTER snapshot
    const afterSnapshot = createSnapshot(get().canvas.components);

    // Create undo command
    const command: UndoCanvasCommand = {
      type: "component_remove",
      componentId,
      snapshot: component,
    };

    // Push to undo stack
    get().pushUndo({
      source: createUserSource(),
      description: `Removed ${component.typeId}`,
      command,
      beforeSnapshot,
      afterSnapshot,
    });

    return {
      success: true,
      undoId: componentId,
      explanation: `Removed component from canvas`,
      affectedComponentIds: [componentId],
    };
  },

  moveComponent: (componentId, position) => {
    const component = get().canvas.components.find((c) => c.id === componentId);
    if (!component) {
      return {
        success: false,
        undoId: "",
        explanation: `Component not found`,
        affectedComponentIds: [],
        error: { code: "COMPONENT_NOT_FOUND", message: "Component not found", componentId },
      };
    }

    const { grid } = get().canvas;
    if (
      position.col < 0 ||
      position.row < 0 ||
      position.col + component.size.cols > grid.columns ||
      position.row + component.size.rows > grid.rows
    ) {
      return {
        success: false,
        undoId: "",
        explanation: `Invalid position: out of bounds`,
        affectedComponentIds: [],
        error: { code: "INVALID_POSITION", message: "Position out of bounds", componentId },
      };
    }

    // Capture BEFORE snapshot
    const beforeSnapshot = createSnapshot(get().canvas.components);
    const fromPosition = { ...component.position };

    // Perform mutation
    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) comp.position = position;
    });

    // Capture AFTER snapshot
    const afterSnapshot = createSnapshot(get().canvas.components);

    // Create undo command
    const command: UndoCanvasCommand = {
      type: "component_move",
      componentId,
      from: fromPosition,
      to: position,
    };

    // Push to undo stack
    get().pushUndo({
      source: createUserSource(),
      description: `Moved component`,
      command,
      beforeSnapshot,
      afterSnapshot,
    });

    return {
      success: true,
      undoId: componentId,
      explanation: `Moved component to (${position.col}, ${position.row})`,
      affectedComponentIds: [componentId],
    };
  },

  resizeComponent: (componentId, size) => {
    const component = get().canvas.components.find((c) => c.id === componentId);
    if (!component) {
      return {
        success: false,
        undoId: "",
        explanation: `Component not found`,
        affectedComponentIds: [],
        error: { code: "COMPONENT_NOT_FOUND", message: "Component not found", componentId },
      };
    }

    const { grid } = get().canvas;
    if (
      component.position.col + size.cols > grid.columns ||
      component.position.row + size.rows > grid.rows
    ) {
      return {
        success: false,
        undoId: "",
        explanation: `Invalid size: extends beyond grid`,
        affectedComponentIds: [],
        error: { code: "INVALID_SIZE", message: "Size extends beyond grid", componentId },
      };
    }

    // Capture BEFORE snapshot
    const beforeSnapshot = createSnapshot(get().canvas.components);
    const fromSize = { ...component.size };

    // Perform mutation
    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) comp.size = size;
    });

    // Capture AFTER snapshot
    const afterSnapshot = createSnapshot(get().canvas.components);

    // Create undo command
    const command: UndoCanvasCommand = {
      type: "component_resize",
      componentId,
      from: fromSize,
      to: size,
    };

    // Push to undo stack
    get().pushUndo({
      source: createUserSource(),
      description: `Resized component`,
      command,
      beforeSnapshot,
      afterSnapshot,
    });

    return {
      success: true,
      undoId: componentId,
      explanation: `Resized component to ${size.cols}x${size.rows}`,
      affectedComponentIds: [componentId],
    };
  },

  clearCanvas: (preservePinned) => {
    const components = get().canvas.components;
    const toRemove = preservePinned
      ? components.filter((c) => !c.meta.pinned)
      : components;

    if (toRemove.length === 0) {
      return {
        success: true,
        undoId: "",
        explanation: "Canvas already empty",
        affectedComponentIds: [],
      };
    }

    // Capture BEFORE snapshot
    const beforeSnapshot = createSnapshot(get().canvas.components);

    // Perform mutation
    set((state) => {
      state.canvas.components = preservePinned
        ? state.canvas.components.filter((c) => c.meta.pinned)
        : [];
    });

    // Capture AFTER snapshot
    const afterSnapshot = createSnapshot(get().canvas.components);

    // Create undo command
    const command: UndoCanvasCommand = {
      type: "canvas_clear",
      removedCount: toRemove.length,
    };

    // Push to undo stack
    get().pushUndo({
      source: createUserSource(),
      description: `Cleared canvas (${toRemove.length} components)`,
      command,
      beforeSnapshot,
      afterSnapshot,
    });

    return {
      success: true,
      undoId: `clear_${Date.now()}`,
      explanation: `Cleared ${toRemove.length} components from canvas`,
      affectedComponentIds: toRemove.map((c) => c.id),
    };
  },

  setGridDimensions: (cellWidth, cellHeight) => {
    set((state) => {
      state.canvas.grid.cellWidth = cellWidth;
      state.canvas.grid.cellHeight = cellHeight;
    });
  },

  selectComponent: (componentId) => {
    set((state) => {
      state.selectedComponentId = componentId;
    });
  },
});

/**
 * Finds the first position where a component of given size fits without overlap.
 *
 * Algorithm: Scans grid left-to-right, top-to-bottom. For each candidate position,
 * checks if all cells required by the component are unoccupied.
 *
 * Time complexity: O(rows × cols × size.rows × size.cols × numComponents)
 * This is fine for our ~20 component limit. For larger grids, we'd want spatial indexing.
 *
 * Returns (0,0) if no space found - allows overlap rather than failing.
 * The UI shows overlapping components, and users can drag to fix.
 */
function findOpenPosition(canvas: Canvas, size: Size): Position {
  const { columns, rows } = canvas.grid;
  const occupied = new Set<string>();

  // Mark occupied cells
  for (const comp of canvas.components) {
    for (let c = comp.position.col; c < comp.position.col + comp.size.cols; c++) {
      for (let r = comp.position.row; r < comp.position.row + comp.size.rows; r++) {
        occupied.add(`${c},${r}`);
      }
    }
  }

  // Find first position where component fits
  for (let row = 0; row <= rows - size.rows; row++) {
    for (let col = 0; col <= columns - size.cols; col++) {
      let fits = true;
      for (let c = col; c < col + size.cols && fits; c++) {
        for (let r = row; r < row + size.rows && fits; r++) {
          if (occupied.has(`${c},${r}`)) fits = false;
        }
      }
      if (fits) return { col, row };
    }
  }

  // Fallback: top-left (may overlap)
  return { col: 0, row: 0 };
}
