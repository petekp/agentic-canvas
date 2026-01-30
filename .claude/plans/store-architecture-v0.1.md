# Agentic Canvas: Zustand Store Architecture

<!--
  store-architecture-v0.1.md

  How state management works. This is the bridge between the type specs
  and actual React code. When implementing, follow this structure closely—
  the slice boundaries and action signatures are intentional.

  Depends on:
  - primitives-spec-v0.1.md — All types (Canvas, ComponentInstance, etc.)
  - component-schemas-v0.1.md — Registry initialization

  Why Zustand?
  - Simpler than Redux for this scope
  - Built-in immer middleware for immutable updates
  - Composable slices without boilerplate
  - subscribeWithSelector for granular subscriptions

  Why this slice structure?
  - Canvas: Component instances and grid config (the "what's on screen")
  - History: Undo/redo stacks (kept separate to avoid circular deps)
  - Data: Fetch cache and loading states (async concerns isolated)
  - Workspace: Views, settings, triggers (persistence concerns)
-->

**Version:** 0.1.0
**Status:** Implementation Ready
**Last Updated:** January 2026

---

## Overview

This document defines the Zustand store architecture for Agentic Canvas. The store is split into logical slices that compose into a single unified store.

**Design principles:**
- **Immutable updates** — All mutations produce new state
- **Command-driven** — UI and AI changes flow through the same command system
- **History-aware** — Every mutation can be undone
- **Selector-optimized** — Granular selectors prevent unnecessary re-renders

### How to Use This Document

**Setting up the store:** Section 1 shows the combined type and creation. Copy this structure.

**Implementing slices:** Sections 2-5 have complete slice implementations. The code is verbose intentionally—it shows the full undo/redo handling pattern.

**Writing selectors:** Section 7 has common selectors. Use `shallow` from zustand for object equality.

**Connecting to React:** Section 9 shows the hooks pattern. `useCanvas()`, `useHistory()`, etc.

**Understanding the command flow:**
1. LLM tool call → `CommandExecutor.execute()`
2. Executor calls slice action (e.g., `addComponent`)
3. Action validates, mutates state, pushes undo entry
4. Returns `CommandResult` with explanation

---

## Table of Contents

1. [Store Structure](#1-store-structure)
2. [Canvas Slice](#2-canvas-slice)
3. [History Slice](#3-history-slice)
4. [Data Slice](#4-data-slice)
5. [Workspace Slice](#5-workspace-slice)
6. [Middleware](#6-middleware)
7. [Selectors](#7-selectors)
8. [Command Executor](#8-command-executor)
9. [React Integration](#9-react-integration)

---

## 1. Store Structure

### 1.1 Combined Store Type

```typescript
import { StateCreator } from "zustand";

// Slice types
interface CanvasSlice {
  canvas: Canvas;
  // Actions
  addComponent: (payload: CreateComponentPayload) => CommandResult;
  updateComponent: (payload: UpdateComponentPayload) => CommandResult;
  removeComponent: (componentId: ComponentId) => CommandResult;
  moveComponent: (componentId: ComponentId, position: Position) => CommandResult;
  resizeComponent: (componentId: ComponentId, size: Size) => CommandResult;
  clearCanvas: (preservePinned: boolean) => CommandResult;
}

interface HistorySlice {
  history: HistoryState;
  // Actions
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
  clearHistory: () => void;
  // Internal (called by middleware)
  _pushUndo: (entry: UndoEntry) => void;
  _clearRedo: () => void;
}

interface DataSlice {
  dataCache: Map<string, CachedData>;
  pendingFetches: Set<string>;
  // Actions
  fetchData: (componentId: ComponentId, binding: DataBinding) => Promise<void>;
  refreshComponent: (componentId: ComponentId) => Promise<void>;
  invalidateCache: (pattern?: string) => void;
  // Internal
  _setCacheEntry: (key: string, data: CachedData) => void;
  _setComponentDataState: (componentId: ComponentId, state: DataLoadingState) => void;
}

interface WorkspaceSlice {
  workspace: Workspace;
  // Actions
  saveView: (payload: SaveViewPayload) => ViewId;
  loadView: (viewId: ViewId) => CommandResult;
  deleteView: (viewId: ViewId) => void;
  updateSettings: (settings: Partial<WorkspaceSettings>) => void;
  // Triggers (v0.1 simplified)
  activateTrigger: (triggerId: TriggerId) => void;
}

// Combined store
type AgenticCanvasStore = CanvasSlice & HistorySlice & DataSlice & WorkspaceSlice;
```

### 1.2 Store Creation

```typescript
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export const useStore = create<AgenticCanvasStore>()(
  subscribeWithSelector(
    immer((...args) => ({
      ...createCanvasSlice(...args),
      ...createHistorySlice(...args),
      ...createDataSlice(...args),
      ...createWorkspaceSlice(...args),
    }))
  )
);
```

---

## 2. Canvas Slice

### 2.1 State Shape

```typescript
interface Canvas {
  grid: GridConfig;
  components: ComponentInstance[];
}

// Initial state
const initialCanvas: Canvas = {
  grid: {
    columns: 12,
    rows: 8,
    gap: 16,
    cellWidth: 0,   // Computed on mount
    cellHeight: 0,  // Computed on mount
  },
  components: [],
};
```

### 2.2 Slice Implementation

```typescript
import { StateCreator } from "zustand";
import { nanoid } from "nanoid";

const createCanvasSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  CanvasSlice
> = (set, get) => ({
  canvas: initialCanvas,

  addComponent: (payload) => {
    const { typeId, config, dataBinding, position, size, meta } = payload;

    // Get component definition for defaults
    const registry = getComponentRegistry();
    const definition = registry.get(typeId);
    if (!definition) {
      return {
        success: false,
        undoId: "",
        explanation: `Unknown component type: ${typeId}`,
        affectedComponentIds: [],
        error: { code: "TYPE_NOT_FOUND", message: `Unknown type: ${typeId}` },
      };
    }

    // Validate config
    const validation = registry.validateConfig(typeId, config);
    if (!validation.valid) {
      return {
        success: false,
        undoId: "",
        explanation: `Invalid configuration: ${validation.errors?.[0]?.message}`,
        affectedComponentIds: [],
        error: { code: "CONFIG_VALIDATION_FAILED", message: validation.errors?.[0]?.message ?? "Invalid config" },
      };
    }

    // Auto-place if position not provided
    const layoutEngine = getLayoutEngine();
    const finalSize = size ?? definition.defaultSize;
    const placement = position
      ? { position, reason: "requested" as const, adjustments: [] }
      : layoutEngine.findPlacement(finalSize, get().canvas);

    // Check for collisions
    if (placement.reason === "best_effort") {
      // Allow but warn
      console.warn("Component placed with potential overlap");
    }

    // Generate ID
    const componentId = `cmp_${nanoid(10)}`;
    const undoId = `undo_${nanoid(10)}`;

    // Create component instance
    const component: ComponentInstance = {
      id: componentId,
      typeId,
      position: placement.position,
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

    // Create undo entry
    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: component.meta.createdBy,
      description: `Added ${definition.name}`,
      forward: { type: "component.create", payload },
      inverse: { type: "component.remove", payload: { componentId } },
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
      explanation: `Added ${definition.name} to canvas`,
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

    // Create undo entry
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
    };

    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        if (config) {
          comp.config = { ...comp.config, ...config };
        }
        if (dataBinding !== undefined) {
          comp.dataBinding = dataBinding;
        }
        if (meta) {
          comp.meta = { ...comp.meta, ...meta };
        }
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
    const registry = getComponentRegistry();
    const definition = registry.get(component.typeId);

    // Create undo entry (full component snapshot for restore)
    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: "assistant",
      description: `Removed ${definition?.name ?? "component"}`,
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
    };

    set((state) => {
      state.canvas.components = state.canvas.components.filter((c) => c.id !== componentId);
    });

    get()._pushUndo(undoEntry);
    get()._clearRedo();

    return {
      success: true,
      undoId,
      explanation: `Removed ${definition?.name ?? "component"} from canvas`,
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

    // Validate position
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
    };

    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        comp.position = position;
      }
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

    // Validate size against component definition
    const registry = getComponentRegistry();
    const definition = registry.get(component.typeId);
    if (definition) {
      if (
        size.cols < definition.minSize.cols ||
        size.rows < definition.minSize.rows ||
        size.cols > definition.maxSize.cols ||
        size.rows > definition.maxSize.rows
      ) {
        return {
          success: false,
          undoId: "",
          explanation: `Invalid size: outside allowed range`,
          affectedComponentIds: [],
          error: { code: "INVALID_SIZE", message: "Size out of allowed range", componentId },
        };
      }
    }

    // Validate bounds
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
    };

    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        comp.size = size;
      }
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

    // Batch undo entry
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
});
```

---

## 3. History Slice

### 3.1 State Shape

```typescript
interface HistoryState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  maxSize: number;
}

const initialHistory: HistoryState = {
  undoStack: [],
  redoStack: [],
  maxSize: 50,
};
```

### 3.2 Slice Implementation

```typescript
const createHistorySlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  HistorySlice
> = (set, get) => ({
  history: initialHistory,

  undo: (steps = 1) => {
    const { undoStack } = get().history;
    const actualSteps = Math.min(steps, undoStack.length);

    for (let i = 0; i < actualSteps; i++) {
      const entry = undoStack[undoStack.length - 1 - i];
      if (entry) {
        // Execute inverse command without recording history
        executeCommandWithoutHistory(get, set, entry.inverse);

        // Move to redo stack
        set((state) => {
          const popped = state.history.undoStack.pop();
          if (popped) {
            state.history.redoStack.push(popped);
          }
        });
      }
    }
  },

  redo: (steps = 1) => {
    const { redoStack } = get().history;
    const actualSteps = Math.min(steps, redoStack.length);

    for (let i = 0; i < actualSteps; i++) {
      const entry = redoStack[redoStack.length - 1 - i];
      if (entry) {
        // Execute forward command without recording history
        executeCommandWithoutHistory(get, set, entry.forward);

        // Move back to undo stack
        set((state) => {
          const popped = state.history.redoStack.pop();
          if (popped) {
            state.history.undoStack.push(popped);
          }
        });
      }
    }
  },

  clearHistory: () => {
    set((state) => {
      state.history.undoStack = [];
      state.history.redoStack = [];
    });
  },

  _pushUndo: (entry) => {
    set((state) => {
      state.history.undoStack.push(entry);
      // Trim to max size
      if (state.history.undoStack.length > state.history.maxSize) {
        state.history.undoStack.shift();
      }
    });
  },

  _clearRedo: () => {
    set((state) => {
      state.history.redoStack = [];
    });
  },
});

// Execute command without recording to history (for undo/redo)
function executeCommandWithoutHistory(
  get: () => AgenticCanvasStore,
  set: (fn: (state: AgenticCanvasStore) => void) => void,
  command: CanvasCommand
) {
  switch (command.type) {
    case "component.create": {
      const { typeId, config, dataBinding, position, size, meta } = command.payload;
      const componentId = `cmp_${nanoid(10)}`;
      set((state) => {
        state.canvas.components.push({
          id: componentId,
          typeId,
          position: position ?? { col: 0, row: 0 },
          size: size ?? { cols: 2, rows: 2 },
          config,
          dataBinding: dataBinding ?? null,
          dataState: { status: "idle" },
          meta: {
            createdAt: Date.now(),
            createdBy: meta?.createdBy ?? "assistant",
            pinned: meta?.pinned ?? false,
            label: meta?.label,
          },
        });
      });
      break;
    }
    case "component.remove": {
      set((state) => {
        state.canvas.components = state.canvas.components.filter(
          (c) => c.id !== command.payload.componentId
        );
      });
      break;
    }
    case "component.update": {
      const { componentId, config, dataBinding, meta } = command.payload;
      set((state) => {
        const comp = state.canvas.components.find((c) => c.id === componentId);
        if (comp) {
          if (config) comp.config = { ...comp.config, ...config };
          if (dataBinding !== undefined) comp.dataBinding = dataBinding;
          if (meta) comp.meta = { ...comp.meta, ...meta };
        }
      });
      break;
    }
    case "component.move": {
      set((state) => {
        const comp = state.canvas.components.find((c) => c.id === command.payload.componentId);
        if (comp) comp.position = command.payload.position;
      });
      break;
    }
    case "component.resize": {
      set((state) => {
        const comp = state.canvas.components.find((c) => c.id === command.payload.componentId);
        if (comp) comp.size = command.payload.size;
      });
      break;
    }
    case "batch": {
      for (const cmd of command.payload.commands) {
        executeCommandWithoutHistory(get, set, cmd);
      }
      break;
    }
    // View operations handled separately
  }
}
```

---

## 4. Data Slice

### 4.1 State Shape

```typescript
interface CachedData {
  data: unknown;
  fetchedAt: number;
  ttl: number;
  binding: DataBinding;
}

interface DataSliceState {
  dataCache: Map<string, CachedData>;
  pendingFetches: Set<string>;
}

const initialDataState: DataSliceState = {
  dataCache: new Map(),
  pendingFetches: new Set(),
};
```

### 4.2 Slice Implementation

```typescript
const createDataSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  DataSlice
> = (set, get) => ({
  dataCache: new Map(),
  pendingFetches: new Set(),

  fetchData: async (componentId, binding) => {
    const cacheKey = generateCacheKey(binding);

    // Check cache
    const cached = get().dataCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < cached.ttl) {
      // Use cached data
      set((state) => {
        const comp = state.canvas.components.find((c) => c.id === componentId);
        if (comp) {
          comp.dataState = { status: "ready", data: cached.data, fetchedAt: cached.fetchedAt };
        }
      });
      return;
    }

    // Check if already fetching
    if (get().pendingFetches.has(cacheKey)) {
      return;
    }

    // Set loading state
    set((state) => {
      state.pendingFetches.add(cacheKey);
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        comp.dataState = { status: "loading", startedAt: Date.now() };
      }
    });

    try {
      // Get data source
      const dataSource = getDataSource(binding.source);
      if (!dataSource) {
        throw new Error(`Unknown data source: ${binding.source}`);
      }

      // Execute query
      const result = await dataSource.execute(binding.query);

      // Update cache and component
      set((state) => {
        state.dataCache.set(cacheKey, {
          data: result.data,
          fetchedAt: Date.now(),
          ttl: result.meta.ttl,
          binding,
        });
        state.pendingFetches.delete(cacheKey);

        const comp = state.canvas.components.find((c) => c.id === componentId);
        if (comp) {
          comp.dataState = { status: "ready", data: result.data, fetchedAt: Date.now() };
        }
      });

      // Schedule refresh if interval set
      if (binding.refreshInterval && binding.refreshInterval > 0) {
        setTimeout(() => {
          const currentComp = get().canvas.components.find((c) => c.id === componentId);
          if (currentComp && currentComp.dataBinding === binding) {
            get().fetchData(componentId, binding);
          }
        }, binding.refreshInterval);
      }
    } catch (error) {
      const dataError: DataError = {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "Unknown error",
        source: binding.source,
        retryable: true,
      };

      set((state) => {
        state.pendingFetches.delete(cacheKey);
        const comp = state.canvas.components.find((c) => c.id === componentId);
        if (comp) {
          comp.dataState = { status: "error", error: dataError, attemptedAt: Date.now() };
        }
      });
    }
  },

  refreshComponent: async (componentId) => {
    const component = get().canvas.components.find((c) => c.id === componentId);
    if (!component?.dataBinding) {
      return;
    }

    // Invalidate cache for this binding
    const cacheKey = generateCacheKey(component.dataBinding);
    set((state) => {
      state.dataCache.delete(cacheKey);
    });

    // Re-fetch
    await get().fetchData(componentId, component.dataBinding);
  },

  invalidateCache: (pattern) => {
    set((state) => {
      if (!pattern) {
        state.dataCache.clear();
      } else {
        const regex = new RegExp(pattern);
        for (const key of state.dataCache.keys()) {
          if (regex.test(key)) {
            state.dataCache.delete(key);
          }
        }
      }
    });
  },

  _setCacheEntry: (key, data) => {
    set((state) => {
      state.dataCache.set(key, data);
    });
  },

  _setComponentDataState: (componentId, dataState) => {
    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        comp.dataState = dataState;
      }
    });
  },
});

// Generate cache key from binding
function generateCacheKey(binding: DataBinding): string {
  return `${binding.source}:${binding.query.type}:${JSON.stringify(binding.query.params)}`;
}
```

---

## 5. Workspace Slice

### 5.1 State Shape

```typescript
// Uses Workspace type from primitives spec

const initialWorkspace: Workspace = {
  id: `ws_${nanoid(10)}`,
  name: "My Workspace",
  canvas: initialCanvas,
  threadId: "",
  views: [],
  triggers: [],
  settings: {
    theme: "system",
    voiceEnabled: false,
    defaultRefreshInterval: 60000,
    grid: initialCanvas.grid,
    proactiveMode: "suggest",
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
```

### 5.2 Slice Implementation

```typescript
const createWorkspaceSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  WorkspaceSlice
> = (set, get) => ({
  workspace: initialWorkspace,

  saveView: (payload) => {
    const viewId = `view_${nanoid(10)}`;
    const { name, description, triggerIds } = payload;

    // Deep clone current canvas for snapshot
    const snapshot: Canvas = JSON.parse(JSON.stringify(get().canvas));

    const view: View = {
      id: viewId,
      name,
      description,
      snapshot,
      triggerIds: triggerIds ?? [],
      createdAt: Date.now(),
    };

    set((state) => {
      state.workspace.views.push(view);
      state.workspace.updatedAt = Date.now();
    });

    return viewId;
  },

  loadView: (viewId) => {
    const view = get().workspace.views.find((v) => v.id === viewId);
    if (!view) {
      return {
        success: false,
        undoId: "",
        explanation: `View not found: ${viewId}`,
        affectedComponentIds: [],
        error: { code: "VIEW_NOT_FOUND", message: "View not found" },
      };
    }

    const undoId = `undo_${nanoid(10)}`;

    // Capture current state for undo (excluding pinned)
    const currentComponents = get().canvas.components;
    const pinnedComponents = currentComponents.filter((c) => c.meta.pinned);
    const nonPinnedComponents = currentComponents.filter((c) => !c.meta.pinned);

    const undoEntry: UndoEntry = {
      id: undoId,
      timestamp: Date.now(),
      source: "assistant",
      description: `Loaded view: ${view.name}`,
      forward: { type: "view.load", payload: { viewId } },
      inverse: {
        type: "batch",
        payload: {
          commands: [
            { type: "canvas.clear", payload: { preservePinned: true } },
            ...nonPinnedComponents.map((c) => ({
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
          ],
          description: "Restore previous canvas state",
        },
      },
    };

    // Load view (preserve pinned components)
    set((state) => {
      // Deep clone snapshot
      const loadedComponents: ComponentInstance[] = JSON.parse(
        JSON.stringify(view.snapshot.components)
      );

      // Regenerate IDs to avoid conflicts
      loadedComponents.forEach((c) => {
        c.id = `cmp_${nanoid(10)}`;
        c.dataState = { status: "idle" };
      });

      state.canvas.components = [...pinnedComponents, ...loadedComponents];
      state.workspace.updatedAt = Date.now();
    });

    get()._pushUndo(undoEntry);
    get()._clearRedo();

    // Trigger data fetches for loaded components
    const loadedComponents = get().canvas.components.filter(
      (c) => !pinnedComponents.some((p) => p.id === c.id)
    );
    for (const comp of loadedComponents) {
      if (comp.dataBinding) {
        get().fetchData(comp.id, comp.dataBinding);
      }
    }

    return {
      success: true,
      undoId,
      explanation: `Loaded view: ${view.name}`,
      affectedComponentIds: loadedComponents.map((c) => c.id),
    };
  },

  deleteView: (viewId) => {
    set((state) => {
      state.workspace.views = state.workspace.views.filter((v) => v.id !== viewId);
      state.workspace.updatedAt = Date.now();
    });
  },

  updateSettings: (settings) => {
    set((state) => {
      state.workspace.settings = { ...state.workspace.settings, ...settings };
      state.workspace.updatedAt = Date.now();
    });
  },

  activateTrigger: (triggerId) => {
    const trigger = get().workspace.triggers.find((t) => t.id === triggerId);
    if (!trigger || !trigger.enabled) {
      return;
    }

    // v0.1: Simple trigger handling
    if (trigger.viewId) {
      get().loadView(trigger.viewId);
    }
  },
});
```

---

## 6. Middleware

### 6.1 Persistence Middleware

```typescript
import { persist, createJSONStorage } from "zustand/middleware";

// Persistence for workspace (excluding volatile data)
const persistConfig = {
  name: "agentic-canvas-workspace",
  storage: createJSONStorage(() => localStorage),
  partialize: (state: AgenticCanvasStore) => ({
    workspace: {
      ...state.workspace,
      // Exclude canvas (loaded from views or fresh)
      canvas: undefined,
    },
  }),
};
```

### 6.2 DevTools Middleware

```typescript
import { devtools } from "zustand/middleware";

// Wrap store with devtools in development
const storeWithDevtools = devtools(
  immer((...args) => ({
    ...createCanvasSlice(...args),
    ...createHistorySlice(...args),
    ...createDataSlice(...args),
    ...createWorkspaceSlice(...args),
  })),
  { name: "AgenticCanvasStore" }
);
```

---

## 7. Selectors

### 7.1 Canvas Selectors

```typescript
// Memoized selectors for performance
import { shallow } from "zustand/shallow";

// Get all components
export const selectComponents = (state: AgenticCanvasStore) => state.canvas.components;

// Get component by ID
export const selectComponent = (id: ComponentId) => (state: AgenticCanvasStore) =>
  state.canvas.components.find((c) => c.id === id);

// Get components by type
export const selectComponentsByType = (typeId: TypeId) => (state: AgenticCanvasStore) =>
  state.canvas.components.filter((c) => c.typeId === typeId);

// Get grid config
export const selectGrid = (state: AgenticCanvasStore) => state.canvas.grid;

// Get pinned components
export const selectPinnedComponents = (state: AgenticCanvasStore) =>
  state.canvas.components.filter((c) => c.meta.pinned);

// Get component count
export const selectComponentCount = (state: AgenticCanvasStore) =>
  state.canvas.components.length;

// Check if canvas is empty
export const selectIsCanvasEmpty = (state: AgenticCanvasStore) =>
  state.canvas.components.length === 0;
```

### 7.2 History Selectors

```typescript
// Can undo?
export const selectCanUndo = (state: AgenticCanvasStore) =>
  state.history.undoStack.length > 0;

// Can redo?
export const selectCanRedo = (state: AgenticCanvasStore) =>
  state.history.redoStack.length > 0;

// Get undo stack length
export const selectUndoCount = (state: AgenticCanvasStore) =>
  state.history.undoStack.length;

// Get last undo description
export const selectLastUndoDescription = (state: AgenticCanvasStore) => {
  const stack = state.history.undoStack;
  return stack.length > 0 ? stack[stack.length - 1].description : null;
};
```

### 7.3 Data Selectors

```typescript
// Is any data loading?
export const selectIsAnyLoading = (state: AgenticCanvasStore) =>
  state.canvas.components.some((c) => c.dataState.status === "loading");

// Get components with errors
export const selectComponentsWithErrors = (state: AgenticCanvasStore) =>
  state.canvas.components.filter((c) => c.dataState.status === "error");

// Is specific component loading?
export const selectIsComponentLoading = (id: ComponentId) => (state: AgenticCanvasStore) => {
  const comp = state.canvas.components.find((c) => c.id === id);
  return comp?.dataState.status === "loading";
};
```

### 7.4 Workspace Selectors

```typescript
// Get views
export const selectViews = (state: AgenticCanvasStore) => state.workspace.views;

// Get view by ID
export const selectView = (id: ViewId) => (state: AgenticCanvasStore) =>
  state.workspace.views.find((v) => v.id === id);

// Get settings
export const selectSettings = (state: AgenticCanvasStore) => state.workspace.settings;

// Get theme
export const selectTheme = (state: AgenticCanvasStore) => state.workspace.settings.theme;
```

---

## 8. Command Executor

Bridge between LLM tools and store actions.

```typescript
// command-executor.ts
import { useStore } from "./store";

export interface CommandExecutor {
  execute(command: CanvasCommand): CommandResult | BatchCommandResult;
  executeBatch(commands: CanvasCommand[], description: string): BatchCommandResult;
}

export function createCommandExecutor(): CommandExecutor {
  const store = useStore.getState();

  return {
    execute(command) {
      switch (command.type) {
        case "component.create":
          return store.addComponent(command.payload);
        case "component.update":
          return store.updateComponent(command.payload);
        case "component.remove":
          return store.removeComponent(command.payload.componentId);
        case "component.move":
          return store.moveComponent(command.payload.componentId, command.payload.position);
        case "component.resize":
          return store.resizeComponent(command.payload.componentId, command.payload.size);
        case "canvas.clear":
          return store.clearCanvas(command.payload.preservePinned);
        case "view.save":
          const viewId = store.saveView(command.payload);
          return {
            success: true,
            undoId: "",
            explanation: `Saved view: ${command.payload.name}`,
            affectedComponentIds: [],
          };
        case "view.load":
          return store.loadView(command.payload.viewId);
        case "view.delete":
          store.deleteView(command.payload.viewId);
          return {
            success: true,
            undoId: "",
            explanation: "Deleted view",
            affectedComponentIds: [],
          };
        case "batch":
          return this.executeBatch(command.payload.commands, command.payload.description);
        default:
          return {
            success: false,
            undoId: "",
            explanation: "Unknown command type",
            affectedComponentIds: [],
            error: { code: "UNKNOWN_COMMAND" as any, message: "Unknown command" },
          };
      }
    },

    executeBatch(commands, description) {
      // Execute all commands, collect results
      const results: CommandResult[] = [];
      const affectedIds: ComponentId[] = [];

      for (const cmd of commands) {
        const result = this.execute(cmd);
        results.push(result as CommandResult);
        affectedIds.push(...(result.affectedComponentIds ?? []));
      }

      const success = results.every((r) => r.success);
      const undoId = results[0]?.undoId ?? "";

      return {
        success,
        undoId,
        explanation: description,
        results,
        affectedComponentIds: affectedIds,
      };
    },
  };
}
```

---

## 9. React Integration

### 9.1 Hooks

```typescript
// hooks/useCanvas.ts
import { useStore } from "../store";
import { shallow } from "zustand/shallow";

export function useCanvas() {
  return useStore(
    (state) => ({
      components: state.canvas.components,
      grid: state.canvas.grid,
      addComponent: state.addComponent,
      removeComponent: state.removeComponent,
      moveComponent: state.moveComponent,
      resizeComponent: state.resizeComponent,
    }),
    shallow
  );
}

export function useComponent(id: ComponentId) {
  return useStore((state) => state.canvas.components.find((c) => c.id === id));
}

export function useHistory() {
  return useStore(
    (state) => ({
      canUndo: state.history.undoStack.length > 0,
      canRedo: state.history.redoStack.length > 0,
      undo: state.undo,
      redo: state.redo,
      undoDescription: state.history.undoStack[state.history.undoStack.length - 1]?.description,
    }),
    shallow
  );
}

export function useViews() {
  return useStore(
    (state) => ({
      views: state.workspace.views,
      saveView: state.saveView,
      loadView: state.loadView,
      deleteView: state.deleteView,
    }),
    shallow
  );
}

export function useComponentData(id: ComponentId) {
  const component = useStore((state) => state.canvas.components.find((c) => c.id === id));
  const refreshComponent = useStore((state) => state.refreshComponent);

  return {
    dataState: component?.dataState ?? { status: "idle" },
    refresh: () => refreshComponent(id),
  };
}
```

### 9.2 Context for Assistant

```typescript
// context/canvas-context.ts
import { useStore } from "../store";
import { CanvasContext, ComponentSummary } from "../types";

export function useCanvasContext(): CanvasContext {
  const state = useStore.getState();
  const registry = getComponentRegistry();

  const components: ComponentSummary[] = state.canvas.components.map((comp) => {
    const definition = registry.get(comp.typeId);
    // Generate summary based on component type and data
    const summary = generateComponentSummary(comp, definition);

    return {
      id: comp.id,
      typeId: comp.typeId,
      typeName: definition?.name ?? comp.typeId,
      category: definition?.category ?? "data",
      position: comp.position,
      size: comp.size,
      summary: summary.summary,
      highlights: summary.highlights,
      actions: definition?.actions.map((a) => a.actionId) ?? [],
      stateStatus: comp.dataState.status,
    };
  });

  return {
    components,
    temporal: getTemporalContext(),
    workspace: {
      id: state.workspace.id,
      name: state.workspace.name,
      activeViewId: null,
      savedViews: state.workspace.views.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        componentCount: v.snapshot.components.length,
      })),
      componentCount: state.canvas.components.length,
      gridUtilization: calculateGridUtilization(state.canvas),
    },
    budget: {
      maxTokens: 4000,
      usedTokens: 0, // Calculated based on context size
      maxComponents: 20,
      summarizationLevel: "full",
    },
  };
}
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | Jan 2026 | Initial store architecture |
