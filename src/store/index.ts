// Store - combines all slices with Zustand middleware
// See: .claude/plans/store-architecture-v0.1.md

import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

// Enable Immer's MapSet plugin for Map/Set support in state
enableMapSet();

import { createCanvasSlice, type CanvasSlice } from "./canvas-slice";
import { createDataSlice, type DataSlice } from "./data-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "./workspace-slice";
import { createChatSlice, type ChatSlice } from "./chat-slice";
import { createUndoSlice, type UndoSlice } from "./undo-slice";
import { createNotificationSlice, type NotificationSlice } from "./notification-slice";

// Combined store type
export type AgenticCanvasStore = CanvasSlice &
  DataSlice &
  WorkspaceSlice &
  ChatSlice &
  UndoSlice &
  NotificationSlice;

// Partialize function extracted for type reference
const partialize = (state: AgenticCanvasStore) => ({
  canvas: {
    grid: state.canvas.grid,
    components: state.canvas.components.map((c) => ({
      ...c,
      // Reset data state - will be re-fetched on load
      dataState: { status: "idle" as const },
    })),
  },
  workspace: {
    spaces: state.workspace.spaces.map((s) => ({
      ...s,
      // Reset data state in snapshots - will be re-fetched on load
      snapshot: {
        ...s.snapshot,
        components: s.snapshot.components.map((c) => ({
          ...c,
          dataState: { status: "idle" as const },
        })),
      },
    })),
    settings: state.workspace.settings,
  },
  activeSpaceId: state.activeSpaceId,
  lastSpaceId: state.lastSpaceId,
});

type PersistedState = ReturnType<typeof partialize>;

// Create the store with middleware
export const useStore = create<AgenticCanvasStore>()(
  subscribeWithSelector(
    persist(
      immer((...args) => ({
        ...createCanvasSlice(...args),
        ...createDataSlice(...args),
        ...createWorkspaceSlice(...args),
        ...createChatSlice(...args),
        ...createUndoSlice(...args),
        ...createNotificationSlice(...args),
      })),
      {
        name: "agentic-canvas",
        version: 2, // Bump version to trigger migration for spaces
        // Persist canvas, workspace (spaces), and navigation state
        partialize,
        // Re-fetch data for all components after rehydration
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.initializeData();
          }
        },
        // Migration from v1 (views) to v2 (spaces)
        migrate: (persistedState: unknown, version: number): PersistedState => {
          if (version < 2) {
            // Clean slate migration - start fresh with new space system
            // Old view data is intentionally not migrated
            // Return empty object - zustand will merge with defaults
            return {} as PersistedState;
          }
          return persistedState as PersistedState;
        },
      }
    )
  )
);

// Re-export slices for type access
export type { CanvasSlice, DataSlice, WorkspaceSlice, ChatSlice, UndoSlice, NotificationSlice };
