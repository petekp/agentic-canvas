// Store - combines all slices with Zustand middleware
// See: .claude/plans/store-architecture-v0.1.md

import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

// Enable Immer's MapSet plugin for Map/Set support in state
enableMapSet();

import { createCanvasSlice, type CanvasSlice } from "./canvas-slice";
import { createHistorySlice, type HistorySlice } from "./history-slice";
import { createDataSlice, type DataSlice } from "./data-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "./workspace-slice";
import { createChatSlice, type ChatSlice } from "./chat-slice";

// Combined store type
export type AgenticCanvasStore = CanvasSlice & HistorySlice & DataSlice & WorkspaceSlice & ChatSlice;

// Create the store with middleware
export const useStore = create<AgenticCanvasStore>()(
  subscribeWithSelector(
    persist(
      immer((...args) => ({
        ...createCanvasSlice(...args),
        ...createHistorySlice(...args),
        ...createDataSlice(...args),
        ...createWorkspaceSlice(...args),
        ...createChatSlice(...args),
      })),
      {
        name: "agentic-canvas",
        // Only persist canvas components, not transient state
        partialize: (state) => ({
          canvas: {
            grid: state.canvas.grid,
            components: state.canvas.components.map((c) => ({
              ...c,
              // Reset data state - will be re-fetched on load
              dataState: { status: "idle" as const },
            })),
          },
        }),
        // Re-fetch data for all components after rehydration
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.initializeData();
          }
        },
      }
    )
  )
);

// Re-export slices for type access
export type { CanvasSlice, HistorySlice, DataSlice, WorkspaceSlice, ChatSlice };
