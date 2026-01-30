// History Slice - manages undo/redo stacks
// See: .claude/plans/store-architecture-v0.1.md

import { StateCreator } from "zustand";
import { nanoid } from "nanoid";
import type { AgenticCanvasStore } from "./index";
import type { HistoryState, UndoEntry, CanvasCommand } from "@/types";

// Initial state
const initialHistory: HistoryState = {
  undoStack: [],
  redoStack: [],
  maxSize: 50,
};

// Slice interface
export interface HistorySlice {
  history: HistoryState;
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
  clearHistory: () => void;
  _pushUndo: (entry: UndoEntry) => void;
  _clearRedo: () => void;
}

// Slice creator
export const createHistorySlice: StateCreator<
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
      const entry = undoStack[undoStack.length - 1];
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
      const entry = redoStack[redoStack.length - 1];
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
      // Trigger data fetch if binding exists (needed for redo)
      if (dataBinding) {
        get().fetchData(componentId, dataBinding);
      }
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
    case "canvas.clear": {
      set((state) => {
        state.canvas.components = command.payload.preservePinned
          ? state.canvas.components.filter((c) => c.meta.pinned)
          : [];
      });
      break;
    }
    case "batch": {
      for (const cmd of command.payload.commands) {
        executeCommandWithoutHistory(get, set, cmd);
      }
      break;
    }
  }
}
