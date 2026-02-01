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
  CanvasSnapshot,
} from "@/types";
import { createUserSource } from "@/lib/undo/types";
import type { UndoCanvasCommand } from "@/lib/undo/types";

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

// Extended payload for updating existing views
export interface UpdateViewPayload extends SaveViewPayload {
  viewId?: ViewId; // If provided, updates existing view instead of creating new
}

// Slice interface
export interface WorkspaceSlice {
  workspace: Workspace;
  activeViewId: ViewId | null;
  viewSnapshotHash: string | null; // Hash of active view's snapshot for change detection
  saveView: (payload: UpdateViewPayload) => ViewId;
  loadView: (viewId: ViewId) => CommandResult;
  deleteView: (viewId: ViewId) => void;
  renameView: (viewId: ViewId, name: string) => void;
  duplicateView: (viewId: ViewId) => ViewId | null;
  setActiveView: (viewId: ViewId | null) => void;
  updateSettings: (settings: Partial<WorkspaceSettings>) => void;
  activateTrigger: (triggerId: TriggerId) => void;
  // Computed helper
  hasUnsavedChanges: () => boolean;
}

// Simple hash for change detection (not cryptographic, just for comparison)
function hashCanvas(canvas: Canvas): string {
  return JSON.stringify({
    components: canvas.components.map((c) => ({
      typeId: c.typeId,
      position: c.position,
      size: c.size,
      config: c.config,
    })),
  });
}

// Helper to create a deep copy snapshot of components
function createSnapshot(components: ComponentInstance[]): CanvasSnapshot {
  return { components: structuredClone(components) };
}

// Slice creator
export const createWorkspaceSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  WorkspaceSlice
> = (set, get) => ({
  workspace: initialWorkspace,
  activeViewId: null,
  viewSnapshotHash: null,

  saveView: (payload) => {
    const { name, description, triggerIds, viewId: existingViewId } = payload;
    const now = Date.now();

    // Deep clone current canvas for snapshot
    const snapshot: Canvas = JSON.parse(JSON.stringify(get().canvas));
    const snapshotHash = hashCanvas(snapshot);

    // Update existing view or create new
    if (existingViewId) {
      const existingIndex = get().workspace.views.findIndex((v) => v.id === existingViewId);
      if (existingIndex !== -1) {
        set((state) => {
          state.workspace.views[existingIndex].snapshot = snapshot;
          state.workspace.views[existingIndex].name = name;
          state.workspace.views[existingIndex].description = description;
          state.workspace.views[existingIndex].updatedAt = now;
          state.workspace.updatedAt = now;
          state.viewSnapshotHash = snapshotHash;
        });
        return existingViewId;
      }
    }

    // Create new view
    const viewId = `view_${nanoid(10)}`;
    const view: View = {
      id: viewId,
      name,
      description,
      snapshot,
      triggerIds: triggerIds ?? [],
      createdAt: now,
      updatedAt: now,
    };

    set((state) => {
      state.workspace.views.push(view);
      state.workspace.updatedAt = now;
      state.activeViewId = viewId;
      state.viewSnapshotHash = snapshotHash;
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

    // Capture BEFORE snapshot
    const beforeSnapshot = createSnapshot(get().canvas.components);

    // Capture current state for pinned components
    const currentComponents = get().canvas.components;
    const pinnedComponents = currentComponents.filter((c) => c.meta.pinned);

    // Compute snapshot hash for change detection
    const snapshotHash = hashCanvas(view.snapshot);

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
      state.activeViewId = viewId;
      state.viewSnapshotHash = snapshotHash;
    });

    // Capture AFTER snapshot
    const afterSnapshot = createSnapshot(get().canvas.components);

    // Create undo command
    const command: UndoCanvasCommand = {
      type: "view_load",
      viewId,
      viewName: view.name,
    };

    // Push to undo stack
    get().pushUndo({
      source: createUserSource(),
      description: `Loaded view: ${view.name}`,
      command,
      beforeSnapshot,
      afterSnapshot,
    });

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
      undoId: viewId,
      explanation: `Loaded view: ${view.name}`,
      affectedComponentIds: loadedComponents.map((c) => c.id),
    };
  },

  deleteView: (viewId) => {
    const isActiveView = get().activeViewId === viewId;
    set((state) => {
      state.workspace.views = state.workspace.views.filter((v) => v.id !== viewId);
      state.workspace.updatedAt = Date.now();
      // Clear active view if we deleted it
      if (isActiveView) {
        state.activeViewId = null;
        state.viewSnapshotHash = null;
      }
    });
  },

  renameView: (viewId, name) => {
    set((state) => {
      const view = state.workspace.views.find((v) => v.id === viewId);
      if (view) {
        view.name = name;
        view.updatedAt = Date.now();
        state.workspace.updatedAt = Date.now();
      }
    });
  },

  duplicateView: (viewId) => {
    const view = get().workspace.views.find((v) => v.id === viewId);
    if (!view) return null;

    const newViewId = `view_${nanoid(10)}`;
    const now = Date.now();

    // Generate unique name
    const baseName = view.name;
    const existingNames = get().workspace.views.map((v) => v.name);
    let newName = `${baseName} (Copy)`;
    let counter = 2;
    while (existingNames.includes(newName)) {
      newName = `${baseName} (${counter})`;
      counter++;
    }

    const newView: View = {
      id: newViewId,
      name: newName,
      description: view.description,
      snapshot: JSON.parse(JSON.stringify(view.snapshot)),
      triggerIds: [],
      createdAt: now,
      updatedAt: now,
    };

    set((state) => {
      state.workspace.views.push(newView);
      state.workspace.updatedAt = now;
    });

    return newViewId;
  },

  setActiveView: (viewId) => {
    if (viewId === null) {
      set((state) => {
        state.activeViewId = null;
        state.viewSnapshotHash = null;
      });
      return;
    }

    const view = get().workspace.views.find((v) => v.id === viewId);
    if (view) {
      const snapshotHash = hashCanvas(view.snapshot);
      set((state) => {
        state.activeViewId = viewId;
        state.viewSnapshotHash = snapshotHash;
      });
    }
  },

  hasUnsavedChanges: () => {
    const { activeViewId, viewSnapshotHash, canvas } = get();
    if (!activeViewId || !viewSnapshotHash) {
      // No active view means any components on canvas are "unsaved"
      return canvas.components.length > 0;
    }
    // Compare current canvas hash with stored snapshot hash
    const currentHash = hashCanvas(canvas);
    return currentHash !== viewSnapshotHash;
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
