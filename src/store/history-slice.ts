// History Slice - manages undo/redo stacks with snapshot-based restoration
// See: .claude/plans/store-architecture-v0.1.md

import { StateCreator } from "zustand";
import type { AgenticCanvasStore } from "./index";
import type { HistoryState, UndoEntry } from "@/types";

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
        // Navigate to the view where this action was performed
        const currentViewId = get().activeViewId;
        if (entry.viewContext !== currentViewId && entry.viewContext !== null) {
          set((state) => {
            state.activeViewId = entry.viewContext;
          });
        }

        // Restore beforeSnapshot - this is the state before the action was taken
        set((state) => {
          state.canvas.components = structuredClone(entry.beforeSnapshot.components);
        });

        // Reset data state to idle for components with bindings to trigger fresh fetches
        const componentsWithBindings = get().canvas.components.filter((c) => c.dataBinding);
        for (const comp of componentsWithBindings) {
          get().fetchData(comp.id, comp.dataBinding!);
        }

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
        // Navigate to the view where this action was performed
        const currentViewId = get().activeViewId;
        if (entry.viewContext !== currentViewId && entry.viewContext !== null) {
          set((state) => {
            state.activeViewId = entry.viewContext;
          });
        }

        // Restore afterSnapshot - this is the state after the action was taken
        set((state) => {
          state.canvas.components = structuredClone(entry.afterSnapshot.components);
        });

        // Reset data state to idle for components with bindings to trigger fresh fetches
        const componentsWithBindings = get().canvas.components.filter((c) => c.dataBinding);
        for (const comp of componentsWithBindings) {
          get().fetchData(comp.id, comp.dataBinding!);
        }

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
