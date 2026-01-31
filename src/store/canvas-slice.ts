// Canvas Slice - manages component instances and grid
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
  UndoEntry,
} from "@/types";

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

    // Default size if not provided
    const finalSize = size ?? { cols: 3, rows: 2 };
    const finalPosition = position ?? findOpenPosition(get().canvas, finalSize);

    // Generate IDs
    const componentId = `cmp_${nanoid(10)}`;
    const undoId = `undo_${nanoid(10)}`;

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

    // Create undo entry (store actual position/size, not original payload)
    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: component.meta.createdBy,
      description: `Added ${typeId}`,
      forward: {
        type: "component.create",
        payload: {
          ...payload,
          position: finalPosition,
          size: finalSize,
        },
      },
      inverse: { type: "component.remove", payload: { componentId } },
      viewContext: get().activeViewId,
    };

    set((state) => {
      state.canvas.components.push(component);
    });

    // Push to history
    get()._pushUndo(undoEntry);
    get()._clearRedo();

    // Trigger data fetch if binding exists
    if (dataBinding) {
      get().fetchData(componentId, dataBinding);
    }

    return {
      success: true,
      undoId,
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

    const undoId = `undo_${nanoid(10)}`;

    // Capture before state for undo
    const beforeConfig = { ...component.config };
    const beforeBinding = component.dataBinding;
    const beforeMeta = { ...component.meta };

    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: "assistant",
      description: `Updated component`,
      forward: { type: "component.update", payload },
      inverse: {
        type: "component.update",
        payload: {
          componentId,
          config: beforeConfig,
          dataBinding: beforeBinding,
          meta: beforeMeta,
        },
      },
      viewContext: get().activeViewId,
    };

    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        if (config) comp.config = { ...comp.config, ...config };
        if (dataBinding !== undefined) comp.dataBinding = dataBinding;
        if (meta) comp.meta = { ...comp.meta, ...meta };
      }
    });

    get()._pushUndo(undoEntry);
    get()._clearRedo();

    // Re-fetch data if binding changed
    if (dataBinding && dataBinding !== beforeBinding) {
      get().fetchData(componentId, dataBinding);
    }

    return {
      success: true,
      undoId,
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

    const undoId = `undo_${nanoid(10)}`;

    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: "assistant",
      description: `Removed ${component.typeId}`,
      forward: { type: "component.remove", payload: { componentId } },
      inverse: {
        type: "component.create",
        payload: {
          typeId: component.typeId,
          config: component.config,
          dataBinding: component.dataBinding ?? undefined,
          position: component.position,
          size: component.size,
          meta: component.meta,
        },
      },
      viewContext: get().activeViewId,
    };

    set((state) => {
      state.canvas.components = state.canvas.components.filter((c) => c.id !== componentId);
      // Clear selection if removed component was selected
      if (state.selectedComponentId === componentId) {
        state.selectedComponentId = null;
      }
    });

    get()._pushUndo(undoEntry);
    get()._clearRedo();

    return {
      success: true,
      undoId,
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

    const undoId = `undo_${nanoid(10)}`;
    const beforePosition = { ...component.position };

    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: "assistant",
      description: `Moved component`,
      forward: { type: "component.move", payload: { componentId, position } },
      inverse: { type: "component.move", payload: { componentId, position: beforePosition } },
      viewContext: get().activeViewId,
    };

    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) comp.position = position;
    });

    get()._pushUndo(undoEntry);
    get()._clearRedo();

    return {
      success: true,
      undoId,
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

    const undoId = `undo_${nanoid(10)}`;
    const beforeSize = { ...component.size };

    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: "assistant",
      description: `Resized component`,
      forward: { type: "component.resize", payload: { componentId, size } },
      inverse: { type: "component.resize", payload: { componentId, size: beforeSize } },
      viewContext: get().activeViewId,
    };

    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) comp.size = size;
    });

    get()._pushUndo(undoEntry);
    get()._clearRedo();

    return {
      success: true,
      undoId,
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

    const undoId = `undo_${nanoid(10)}`;

    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: "assistant",
      description: `Cleared canvas (${toRemove.length} components)`,
      forward: { type: "canvas.clear", payload: { preservePinned } },
      inverse: {
        type: "batch",
        payload: {
          commands: toRemove.map((c) => ({
            type: "component.create" as const,
            payload: {
              typeId: c.typeId,
              config: c.config,
              dataBinding: c.dataBinding ?? undefined,
              position: c.position,
              size: c.size,
              meta: c.meta,
            },
          })),
          description: "Restore cleared components",
        },
      },
      viewContext: get().activeViewId,
    };

    set((state) => {
      state.canvas.components = preservePinned
        ? state.canvas.components.filter((c) => c.meta.pinned)
        : [];
    });

    get()._pushUndo(undoEntry);
    get()._clearRedo();

    return {
      success: true,
      undoId,
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

// Simple auto-placement: find first open position
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
