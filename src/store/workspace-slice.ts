// Workspace Slice - manages views, settings, and triggers
// See: .claude/plans/store-architecture-v0.1.md

import { StateCreator } from "zustand";
import { nanoid } from "nanoid";
import type { AgenticCanvasStore } from "./index";
import type {
  Workspace,
  WorkspaceSettings,
  View,
  ViewId,
  TriggerId,
  Canvas,
  ComponentInstance,
  SaveViewPayload,
  CommandResult,
  UndoEntry,
} from "@/types";

// Initial workspace
const initialWorkspace: Workspace = {
  id: `ws_${nanoid(10)}`,
  name: "My Workspace",
  canvas: {
    grid: {
      columns: 12,
      rows: 8,
      gap: 16,
      cellWidth: 0,
      cellHeight: 0,
    },
    components: [],
  },
  threadId: "",
  views: [],
  triggers: [],
  settings: {
    theme: "system",
    voiceEnabled: false,
    defaultRefreshInterval: 60000,
    grid: {
      columns: 12,
      rows: 8,
      gap: 16,
      cellWidth: 0,
      cellHeight: 0,
    },
    proactiveMode: "suggest",
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Slice interface
export interface WorkspaceSlice {
  workspace: Workspace;
  saveView: (payload: SaveViewPayload) => ViewId;
  loadView: (viewId: ViewId) => CommandResult;
  deleteView: (viewId: ViewId) => void;
  updateSettings: (settings: Partial<WorkspaceSettings>) => void;
  activateTrigger: (triggerId: TriggerId) => void;
}

// Slice creator
export const createWorkspaceSlice: StateCreator<
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

    // Capture current state for undo
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
