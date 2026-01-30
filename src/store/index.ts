// Store - combines all slices with Zustand middleware
// See: .claude/plans/store-architecture-v0.1.md

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

// Enable Immer's MapSet plugin for Map/Set support in state
enableMapSet();

import { createCanvasSlice, type CanvasSlice } from "./canvas-slice";
import { createHistorySlice, type HistorySlice } from "./history-slice";
import { createDataSlice, type DataSlice } from "./data-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "./workspace-slice";

// Combined store type
export type AgenticCanvasStore = CanvasSlice & HistorySlice & DataSlice & WorkspaceSlice;

// Create the store with middleware
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

// Re-export slices for type access
export type { CanvasSlice, HistorySlice, DataSlice, WorkspaceSlice };
