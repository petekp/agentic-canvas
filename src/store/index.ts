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
import {
  createDefaultMorningBriefRuntimeState,
  ensureMorningBriefTriggers,
} from "@/lib/morning-brief-triggers";

const SPACE_KIND_VALUES = new Set([
  "system.morning_brief",
  "mission",
  "project",
  "ad_hoc",
] as const);
const MORNING_BRIEF_SPACE_NAME = "Your Morning Brief";

function inferPersistedSpaceKind(space: Record<string, unknown>): "system.morning_brief" | "ad_hoc" | "mission" | "project" {
  if (
    typeof space.kind === "string" &&
    SPACE_KIND_VALUES.has(space.kind as "system.morning_brief" | "ad_hoc" | "mission" | "project")
  ) {
    return space.kind as "system.morning_brief" | "ad_hoc" | "mission" | "project";
  }
  const name = typeof space.name === "string" ? space.name.toLowerCase() : "";
  if (name.includes("morning brief")) {
    return "system.morning_brief";
  }
  return "ad_hoc";
}

function normalizePersistedSpaces(spaces: unknown): unknown {
  if (!Array.isArray(spaces)) {
    return spaces;
  }

  const normalized = spaces.map((entry) => {
    const space = (entry ?? {}) as Record<string, unknown>;
    const kind = inferPersistedSpaceKind(space);
    const createdAt = typeof space.createdAt === "number" ? space.createdAt : Date.now();
    const updatedAt = typeof space.updatedAt === "number" ? space.updatedAt : createdAt;
    const lastVisitedAt =
      typeof space.lastVisitedAt === "number" ? space.lastVisitedAt : updatedAt;
    const pinned =
      kind === "system.morning_brief"
        ? true
        : typeof space.pinned === "boolean"
          ? space.pinned
          : false;
    const createdBy =
      typeof space.createdBy === "string" && (space.createdBy === "assistant" || space.createdBy === "user")
        ? space.createdBy
        : kind === "system.morning_brief"
          ? "assistant"
          : "user";
    const maybeMeta =
      space.meta && typeof space.meta === "object"
        ? (space.meta as Record<string, unknown>)
        : {};

    const meta = {
      kind,
      pinned,
      systemManaged: kind === "system.morning_brief",
      createdBy,
      createdAt:
        typeof maybeMeta.createdAt === "number" ? maybeMeta.createdAt : createdAt,
      updatedAt:
        typeof maybeMeta.updatedAt === "number" ? maybeMeta.updatedAt : updatedAt,
      lastVisitedAt:
        typeof maybeMeta.lastVisitedAt === "number"
          ? maybeMeta.lastVisitedAt
          : lastVisitedAt,
    };

    return {
      ...space,
      kind,
      pinned,
      createdBy,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      lastVisitedAt: meta.lastVisitedAt,
      meta,
    };
  });

  const hasMorningBrief = normalized.some(
    (space) =>
      typeof space === "object" &&
      space !== null &&
      (space as { kind?: string }).kind === "system.morning_brief"
  );
  if (hasMorningBrief) {
    return normalized;
  }

  const now = Date.now();
  const morningBrief = {
    id: `space_${Math.random().toString(36).slice(2, 12)}`,
    name: MORNING_BRIEF_SPACE_NAME,
    kind: "system.morning_brief",
    meta: {
      kind: "system.morning_brief",
      pinned: true,
      systemManaged: true,
      createdBy: "assistant",
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    },
    description: "System-managed mission orientation for your day",
    snapshot: {
      grid: {
        columns: 12,
        rows: 8,
        gap: 12,
        cellWidth: 0,
        cellHeight: 0,
      },
      components: [],
    },
    triggerIds: [],
    pinned: true,
    createdBy: "assistant",
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    briefingConfig: undefined,
  };

  return [morningBrief, ...normalized];
}

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
    triggers: state.workspace.triggers,
    morningBrief: state.workspace.morningBrief,
    // Serialize transforms Map to array for persistence (handle undefined for backwards compat)
    transforms: state.workspace.transforms
      ? Array.from(state.workspace.transforms.entries())
      : [],
    rules: state.workspace.rules,
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
        version: 7, // v7: Add Morning Brief auto-open setting defaults
        // Persist canvas, workspace (spaces), and navigation state
        partialize,
        // Re-fetch data for all components after rehydration
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Ensure transforms exists (backwards compat) and deserialize array to Map
            if (state.workspace) {
              if (Array.isArray(state.workspace.transforms as unknown)) {
                const transformsArray = state.workspace.transforms as unknown as [string, import("@/types").TransformDefinition][];
                state.workspace.transforms = new Map(transformsArray);
              } else if (!state.workspace.transforms) {
                state.workspace.transforms = new Map();
              }
              if (!state.workspace.rules) {
                state.workspace.rules = { version: "v1" };
              }
              if (
                typeof state.workspace.settings?.autoOpenMorningBrief !== "boolean"
              ) {
                state.workspace.settings = {
                  ...state.workspace.settings,
                  autoOpenMorningBrief: true,
                };
              }
              state.workspace.triggers = ensureMorningBriefTriggers(
                Array.isArray(state.workspace.triggers) ? state.workspace.triggers : []
              );
              state.workspace.morningBrief =
                state.workspace.morningBrief ?? createDefaultMorningBriefRuntimeState();
              state.workspace.spaces = normalizePersistedSpaces(state.workspace.spaces) as typeof state.workspace.spaces;
            }
            state.initializeData();
          }
        },
        // Migration function
        migrate: (persistedState: unknown, version: number): PersistedState => {
          if (version < 2) {
            // Clean slate migration - start fresh with new space system
            // Old view data is intentionally not migrated
            // Return empty object - zustand will merge with defaults
            return {} as PersistedState;
          }

          const state = persistedState as PersistedState;

          // v2 -> v3: Add transforms support
          if (version < 3 && state.workspace) {
            // Initialize transforms as empty array if not present
            if (!state.workspace.transforms) {
              state.workspace.transforms = [];
            }
          }

          // v3 -> v4: Add rules support
          if (version < 4 && state.workspace) {
            if (!state.workspace.rules) {
              state.workspace.rules = { version: "v1" };
            }
          }

          // v4 -> v5: Normalize space kinds/metadata and ensure Morning Brief exists
          if (version < 5 && state.workspace) {
            state.workspace.spaces = normalizePersistedSpaces(state.workspace.spaces) as typeof state.workspace.spaces;
          }

          // v5 -> v6: Ensure Morning Brief trigger/runtime state exists
          if (version < 6 && state.workspace) {
            state.workspace.triggers = ensureMorningBriefTriggers(
              Array.isArray(state.workspace.triggers) ? state.workspace.triggers : []
            );
            state.workspace.morningBrief =
              state.workspace.morningBrief ?? createDefaultMorningBriefRuntimeState();
          }

          // v6 -> v7: Ensure auto-open setting exists
          if (version < 7 && state.workspace) {
            state.workspace.settings = {
              ...state.workspace.settings,
              autoOpenMorningBrief:
                typeof state.workspace.settings?.autoOpenMorningBrief === "boolean"
                  ? state.workspace.settings.autoOpenMorningBrief
                  : true,
            };
          }

          return state;
        },
      }
    )
  )
);

// Re-export slices for type access
export type { CanvasSlice, DataSlice, WorkspaceSlice, ChatSlice, UndoSlice, NotificationSlice };
