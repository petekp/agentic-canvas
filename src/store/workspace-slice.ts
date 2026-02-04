// Workspace Slice - manages spaces, settings, and triggers
// See: .claude/plans/store-architecture-v0.1.md

import { StateCreator } from "zustand";
import { nanoid } from "nanoid";
import type { AgenticCanvasStore } from "./index";
import type {
  Workspace,
  WorkspaceSettings,
  Space,
  SpaceId,
  TriggerId,
  Canvas,
  ComponentInstance,
  SaveSpacePayload,
  CommandResult,
  CanvasSnapshot,
} from "@/types";
import { createUserSource } from "@/lib/undo/types";
import type { UndoCanvasCommand, SpaceStateSnapshot } from "@/lib/undo/types";

// Create initial default space
const defaultSpaceId = `space_${nanoid(10)}`;
const initialTimestamp = Date.now();

const defaultSpace: Space = {
  id: defaultSpaceId,
  name: "Scratch",
  description: "Default workspace",
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
  pinned: true, // Pin the default space so it doesn't get cleaned up
  createdBy: "user",
  createdAt: initialTimestamp,
  updatedAt: initialTimestamp,
  lastVisitedAt: initialTimestamp,
};

// Initial workspace - always starts with a default space
const initialWorkspace: Workspace = {
  id: `ws_${nanoid(10)}`,
  name: "My Workspace",
  canvas: {
    grid: {
      columns: 12,
      rows: 8,
      gap: 12,
      cellWidth: 0,
      cellHeight: 0,
    },
    components: [],
  },
  threadId: "",
  spaces: [defaultSpace], // Start with default space
  triggers: [],
  settings: {
    theme: "system",
    voiceEnabled: false,
    defaultRefreshInterval: 60000,
    grid: {
      columns: 12,
      rows: 8,
      gap: 12,
      cellWidth: 0,
      cellHeight: 0,
    },
    proactiveMode: "suggest",
  },
  createdAt: initialTimestamp,
  updatedAt: initialTimestamp,
};

// Extended payload for updating existing spaces
export interface UpdateSpacePayload extends SaveSpacePayload {
  spaceId?: SpaceId; // If provided, updates existing space instead of creating new
}

/** @deprecated Use UpdateSpacePayload instead */
export type UpdateViewPayload = UpdateSpacePayload;

// Options for creating a space
export interface CreateSpaceOptions {
  name?: string;
  createdBy?: "user" | "assistant";
  switchTo?: boolean;
}

/** @deprecated Use CreateSpaceOptions instead */
export type CreateViewOptions = CreateSpaceOptions;

// Slice interface
export interface WorkspaceSlice {
  workspace: Workspace;
  activeSpaceId: SpaceId | null;
  lastSpaceId: SpaceId | null; // For conditional entry - track the last visited space
  spaceSnapshotHash: string | null; // Hash of active space's snapshot for change detection
  saveSpace: (payload: UpdateSpacePayload) => SpaceId;
  loadSpace: (spaceId: SpaceId) => CommandResult;
  deleteSpace: (spaceId: SpaceId) => void;
  renameSpace: (spaceId: SpaceId, name: string) => void;
  duplicateSpace: (spaceId: SpaceId) => SpaceId | null;
  createEmptySpace: (nameOrOptions?: string | CreateSpaceOptions) => SpaceId;
  setActiveSpace: (spaceId: SpaceId | null) => void;
  updateSettings: (settings: Partial<WorkspaceSettings>) => void;
  activateTrigger: (triggerId: TriggerId) => void;
  // Pin/unpin spaces
  pinSpace: (spaceId: SpaceId) => void;
  unpinSpace: (spaceId: SpaceId) => void;
  // Cleanup stale unpinned spaces
  cleanupStaleSpaces: (maxAgeMs?: number) => number;
  // Get spaces list for AI context
  getSpaces: () => Space[];
  // Computed helper
  hasUnsavedChanges: () => boolean;

  // Deprecated method aliases for backwards compatibility
  /** @deprecated Use saveSpace instead */
  saveView: (payload: UpdateSpacePayload) => SpaceId;
  /** @deprecated Use loadSpace instead */
  loadView: (spaceId: SpaceId) => CommandResult;
  /** @deprecated Use deleteSpace instead */
  deleteView: (spaceId: SpaceId) => void;
  /** @deprecated Use renameSpace instead */
  renameView: (spaceId: SpaceId, name: string) => void;
  /** @deprecated Use duplicateSpace instead */
  duplicateView: (spaceId: SpaceId) => SpaceId | null;
  /** @deprecated Use createEmptySpace instead */
  createEmptyView: (nameOrOptions?: string | CreateSpaceOptions) => SpaceId;
  /** @deprecated Use setActiveSpace instead */
  setActiveView: (spaceId: SpaceId | null) => void;
  /** @deprecated Use pinSpace instead */
  pinView: (spaceId: SpaceId) => void;
  /** @deprecated Use unpinSpace instead */
  unpinView: (spaceId: SpaceId) => void;
  /** @deprecated Use cleanupStaleSpaces instead */
  cleanupStaleViews: (maxAgeMs?: number) => number;
  /** @deprecated Use getSpaces instead */
  getViews: () => Space[];
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

function createSpaceStateSnapshot(state: AgenticCanvasStore): SpaceStateSnapshot {
  return {
    spaces: structuredClone(state.workspace.spaces),
    activeSpaceId: state.activeSpaceId,
    spaceSnapshotHash: state.spaceSnapshotHash,
    workspaceUpdatedAt: state.workspace.updatedAt,
  };
}

// Slice creator
export const createWorkspaceSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  WorkspaceSlice
> = (set, get) => ({
  workspace: initialWorkspace,
  activeSpaceId: defaultSpaceId, // Start with default space active
  lastSpaceId: defaultSpaceId, // Track last visited space
  spaceSnapshotHash: hashCanvas(defaultSpace.snapshot), // Initial hash for change detection

  saveSpace: (payload) => {
    const { name, description, triggerIds, spaceId: existingSpaceId } = payload;
    const now = Date.now();

    // Deep clone current canvas for snapshot
    const snapshot: Canvas = JSON.parse(JSON.stringify(get().canvas));
    const snapshotHash = hashCanvas(snapshot);

    // Update existing space or create new
    if (existingSpaceId) {
      const existingIndex = get().workspace.spaces.findIndex((s) => s.id === existingSpaceId);
      if (existingIndex !== -1) {
        set((state) => {
          state.workspace.spaces[existingIndex].snapshot = snapshot;
          state.workspace.spaces[existingIndex].name = name;
          state.workspace.spaces[existingIndex].description = description;
          state.workspace.spaces[existingIndex].updatedAt = now;
          state.workspace.spaces[existingIndex].lastVisitedAt = now;
          state.workspace.updatedAt = now;
          state.spaceSnapshotHash = snapshotHash;
        });
        return existingSpaceId;
      }
    }

    // Create new space
    const spaceId = `space_${nanoid(10)}`;
    const space: Space = {
      id: spaceId,
      name,
      description,
      snapshot,
      triggerIds: triggerIds ?? [],
      pinned: false,
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    };

    set((state) => {
      state.workspace.spaces.push(space);
      state.workspace.updatedAt = now;
      state.activeSpaceId = spaceId;
      state.lastSpaceId = spaceId;
      state.spaceSnapshotHash = snapshotHash;
    });

    return spaceId;
  },

  loadSpace: (spaceId) => {
    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (!space) {
      return {
        success: false,
        undoId: "",
        explanation: `Space not found: ${spaceId}`,
        affectedComponentIds: [],
        error: { code: "VIEW_NOT_FOUND", message: "Space not found" },
      };
    }

    // Capture BEFORE snapshot
    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());

    // Capture current state for pinned components
    const currentComponents = get().canvas.components;
    const pinnedComponents = currentComponents.filter((c) => c.meta.pinned);

    // Compute snapshot hash for change detection
    const snapshotHash = hashCanvas(space.snapshot);
    const now = Date.now();

    // Load space (preserve pinned components)
    set((state) => {
      const loadedComponents: ComponentInstance[] = JSON.parse(
        JSON.stringify(space.snapshot.components)
      );

      // Regenerate IDs to avoid conflicts
      loadedComponents.forEach((c) => {
        c.id = `cmp_${nanoid(10)}`;
        c.dataState = { status: "idle" };
      });

      state.canvas.components = [...pinnedComponents, ...loadedComponents];
      state.workspace.updatedAt = now;
      state.activeSpaceId = spaceId;
      state.lastSpaceId = spaceId;
      state.spaceSnapshotHash = snapshotHash;

      // Update lastVisitedAt on the space
      const spaceIndex = state.workspace.spaces.findIndex((s) => s.id === spaceId);
      if (spaceIndex !== -1) {
        state.workspace.spaces[spaceIndex].lastVisitedAt = now;
      }
    });

    // Capture AFTER snapshot
    const afterSnapshot = createSnapshot(get().canvas.components);
    const afterSpaceState = createSpaceStateSnapshot(get());

    // Create undo command
    const command: UndoCanvasCommand = {
      type: "space_load",
      spaceId,
      spaceName: space.name,
    };

    // Push to undo stack
    get().pushUndo({
      source: createUserSource(),
      description: `Loaded space: ${space.name}`,
      command,
      beforeSnapshot,
      afterSnapshot,
      beforeSpaceState,
      afterSpaceState,
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
      undoId: spaceId,
      explanation: `Loaded space: ${space.name}`,
      affectedComponentIds: loadedComponents.map((c) => c.id),
    };
  },

  deleteSpace: (spaceId) => {
    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (!space) return;

    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());
    const isActiveSpace = get().activeSpaceId === spaceId;

    set((state) => {
      state.workspace.spaces = state.workspace.spaces.filter((s) => s.id !== spaceId);
      state.workspace.updatedAt = Date.now();
      // Clear active space if we deleted it
      if (isActiveSpace) {
        state.activeSpaceId = null;
        state.spaceSnapshotHash = null;
      }
    });

    const afterSnapshot = createSnapshot(get().canvas.components);
    const afterSpaceState = createSpaceStateSnapshot(get());

    const command: UndoCanvasCommand = {
      type: "space_delete",
      spaceId,
      spaceName: space.name,
    };

    get().pushUndo({
      source: createUserSource(),
      description: `Deleted space: ${space.name}`,
      command,
      beforeSnapshot,
      afterSnapshot,
      beforeSpaceState,
      afterSpaceState,
      spaceContext: {
        activeSpaceId: get().activeSpaceId,
        activeSpaceName: get().workspace.spaces.find((s) => s.id === get().activeSpaceId)?.name ?? "Default",
        affectedSpaceIds: [spaceId],
        wasSpaceSpecificOp: true,
      },
    });
  },

  renameSpace: (spaceId, name) => {
    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());
    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (!space) return;

    const from = space.name;
    const now = Date.now();

    set((state) => {
      const target = state.workspace.spaces.find((s) => s.id === spaceId);
      if (target) {
        target.name = name;
        target.updatedAt = now;
        state.workspace.updatedAt = now;
      }
    });

    const afterSnapshot = createSnapshot(get().canvas.components);
    const afterSpaceState = createSpaceStateSnapshot(get());

    const command: UndoCanvasCommand = {
      type: "space_rename",
      spaceId,
      from,
      to: name,
    };

    get().pushUndo({
      source: createUserSource(),
      description: `Renamed space: ${from} → ${name}`,
      command,
      beforeSnapshot,
      afterSnapshot,
      beforeSpaceState,
      afterSpaceState,
      spaceContext: {
        activeSpaceId: get().activeSpaceId,
        activeSpaceName: get().workspace.spaces.find((s) => s.id === get().activeSpaceId)?.name ?? "Default",
        affectedSpaceIds: [spaceId],
        wasSpaceSpecificOp: true,
      },
    });
  },

  duplicateSpace: (spaceId) => {
    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (!space) return null;

    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());

    const newSpaceId = `space_${nanoid(10)}`;
    const now = Date.now();

    // Generate unique name
    const baseName = space.name;
    const existingNames = get().workspace.spaces.map((s) => s.name);
    let newName = `${baseName} (Copy)`;
    let counter = 2;
    while (existingNames.includes(newName)) {
      newName = `${baseName} (${counter})`;
      counter++;
    }

    const newSpace: Space = {
      id: newSpaceId,
      name: newName,
      description: space.description,
      snapshot: JSON.parse(JSON.stringify(space.snapshot)),
      triggerIds: [],
      pinned: false,
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    };

    set((state) => {
      state.workspace.spaces.push(newSpace);
      state.workspace.updatedAt = now;
    });

    const afterSnapshot = createSnapshot(get().canvas.components);
    const afterSpaceState = createSpaceStateSnapshot(get());

    const command: UndoCanvasCommand = {
      type: "space_create",
      spaceId: newSpaceId,
      spaceName: newSpace.name,
    };

    get().pushUndo({
      source: createUserSource(),
      description: `Duplicated space: ${space.name}`,
      command,
      beforeSnapshot,
      afterSnapshot,
      beforeSpaceState,
      afterSpaceState,
      spaceContext: {
        activeSpaceId: get().activeSpaceId,
        activeSpaceName: get().workspace.spaces.find((s) => s.id === get().activeSpaceId)?.name ?? "Default",
        affectedSpaceIds: [newSpaceId],
        wasSpaceSpecificOp: true,
      },
    });

    return newSpaceId;
  },

  createEmptySpace: (nameOrOptions) => {
    const now = Date.now();
    const spaceId = `space_${nanoid(10)}`;
    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());

    // Parse options
    const options: CreateSpaceOptions =
      typeof nameOrOptions === "string"
        ? { name: nameOrOptions }
        : nameOrOptions ?? {};
    const { name, createdBy = "user", switchTo = true } = options;

    // Generate unique name if not provided
    const existingNames = get().workspace.spaces.map((s) => s.name);
    let spaceName = name ?? "Untitled";
    let counter = 1;
    while (existingNames.includes(spaceName)) {
      spaceName = name ? `${name} ${counter}` : `Untitled ${counter}`;
      counter++;
    }

    // Create empty canvas snapshot
    const emptySnapshot: Canvas = {
      grid: get().canvas.grid,
      components: [],
    };

    const newSpace: Space = {
      id: spaceId,
      name: spaceName,
      description: "",
      snapshot: emptySnapshot,
      triggerIds: [],
      pinned: false,
      createdBy,
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    };

    // Create space, optionally clear canvas and switch to it
    set((state) => {
      state.workspace.spaces.push(newSpace);
      state.workspace.updatedAt = now;
      if (switchTo) {
        state.canvas.components = [];
        state.activeSpaceId = spaceId;
        state.lastSpaceId = spaceId;
        state.spaceSnapshotHash = hashCanvas(emptySnapshot);
      }
    });

    const afterSnapshot = createSnapshot(get().canvas.components);
    const afterSpaceState = createSpaceStateSnapshot(get());

    const command: UndoCanvasCommand = {
      type: "space_create",
      spaceId,
      spaceName: spaceName,
    };

    get().pushUndo({
      source: createUserSource(),
      description: `Created space: ${spaceName}`,
      command,
      beforeSnapshot,
      afterSnapshot,
      beforeSpaceState,
      afterSpaceState,
      spaceContext: {
        activeSpaceId: get().activeSpaceId,
        activeSpaceName: get().workspace.spaces.find((s) => s.id === get().activeSpaceId)?.name ?? "Default",
        affectedSpaceIds: [spaceId],
        wasSpaceSpecificOp: true,
      },
    });

    return spaceId;
  },

  setActiveSpace: (spaceId) => {
    if (spaceId === null) {
      set((state) => {
        state.activeSpaceId = null;
        state.spaceSnapshotHash = null;
      });
      return;
    }

    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (space) {
      const snapshotHash = hashCanvas(space.snapshot);
      const now = Date.now();
      set((state) => {
        state.activeSpaceId = spaceId;
        state.lastSpaceId = spaceId;
        state.spaceSnapshotHash = snapshotHash;
        // Update lastVisitedAt
        const spaceIndex = state.workspace.spaces.findIndex((s) => s.id === spaceId);
        if (spaceIndex !== -1) {
          state.workspace.spaces[spaceIndex].lastVisitedAt = now;
        }
      });
    }
  },

  hasUnsavedChanges: () => {
    const { activeSpaceId, spaceSnapshotHash, canvas } = get();
    if (!activeSpaceId || !spaceSnapshotHash) {
      // No active space means any components on canvas are "unsaved"
      return canvas.components.length > 0;
    }
    // Compare current canvas hash with stored snapshot hash
    const currentHash = hashCanvas(canvas);
    return currentHash !== spaceSnapshotHash;
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
    if (trigger.spaceId) {
      get().loadSpace(trigger.spaceId);
    }
  },

  pinSpace: (spaceId) => {
    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (!space || space.pinned) return;

    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());

    set((state) => {
      const target = state.workspace.spaces.find((s) => s.id === spaceId);
      if (target) {
        target.pinned = true;
        target.updatedAt = Date.now();
        state.workspace.updatedAt = Date.now();
      }
    });

    const afterSnapshot = createSnapshot(get().canvas.components);
    const afterSpaceState = createSpaceStateSnapshot(get());

    const command: UndoCanvasCommand = {
      type: "space_pin",
      spaceId,
      spaceName: space.name,
    };

    get().pushUndo({
      source: createUserSource(),
      description: `Pinned space: ${space.name}`,
      command,
      beforeSnapshot,
      afterSnapshot,
      beforeSpaceState,
      afterSpaceState,
      spaceContext: {
        activeSpaceId: get().activeSpaceId,
        activeSpaceName: get().workspace.spaces.find((s) => s.id === get().activeSpaceId)?.name ?? "Default",
        affectedSpaceIds: [spaceId],
        wasSpaceSpecificOp: true,
      },
    });
  },

  unpinSpace: (spaceId) => {
    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (!space || !space.pinned) return;

    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());

    set((state) => {
      const target = state.workspace.spaces.find((s) => s.id === spaceId);
      if (target) {
        target.pinned = false;
        target.updatedAt = Date.now();
        state.workspace.updatedAt = Date.now();
      }
    });

    const afterSnapshot = createSnapshot(get().canvas.components);
    const afterSpaceState = createSpaceStateSnapshot(get());

    const command: UndoCanvasCommand = {
      type: "space_unpin",
      spaceId,
      spaceName: space.name,
    };

    get().pushUndo({
      source: createUserSource(),
      description: `Unpinned space: ${space.name}`,
      command,
      beforeSnapshot,
      afterSnapshot,
      beforeSpaceState,
      afterSpaceState,
      spaceContext: {
        activeSpaceId: get().activeSpaceId,
        activeSpaceName: get().workspace.spaces.find((s) => s.id === get().activeSpaceId)?.name ?? "Default",
        affectedSpaceIds: [spaceId],
        wasSpaceSpecificOp: true,
      },
    });
  },

  cleanupStaleSpaces: (maxAgeMs = 7 * 24 * 60 * 60 * 1000) => {
    const now = Date.now();
    const activeSpaceId = get().activeSpaceId;
    let cleanedCount = 0;

    set((state) => {
      const spacesToKeep = state.workspace.spaces.filter((space) => {
        // Keep pinned spaces
        if (space.pinned) return true;
        // Keep active space
        if (space.id === activeSpaceId) return true;
        // Keep spaces newer than maxAge
        if (now - space.createdAt < maxAgeMs) return true;
        // Remove stale unpinned spaces
        cleanedCount++;
        return false;
      });

      state.workspace.spaces = spacesToKeep;
      if (cleanedCount > 0) {
        state.workspace.updatedAt = now;
      }
    });

    return cleanedCount;
  },

  getSpaces: () => {
    return get().workspace.spaces;
  },

  // Deprecated method aliases - delegate to new methods
  saveView: function (payload) {
    return this.saveSpace(payload);
  },
  loadView: function (spaceId) {
    return this.loadSpace(spaceId);
  },
  deleteView: function (spaceId) {
    return this.deleteSpace(spaceId);
  },
  renameView: function (spaceId, name) {
    return this.renameSpace(spaceId, name);
  },
  duplicateView: function (spaceId) {
    return this.duplicateSpace(spaceId);
  },
  createEmptyView: function (nameOrOptions) {
    return this.createEmptySpace(nameOrOptions);
  },
  setActiveView: function (spaceId) {
    return this.setActiveSpace(spaceId);
  },
  pinView: function (spaceId) {
    return this.pinSpace(spaceId);
  },
  unpinView: function (spaceId) {
    return this.unpinSpace(spaceId);
  },
  cleanupStaleViews: function (maxAgeMs) {
    return this.cleanupStaleSpaces(maxAgeMs);
  },
  getViews: function () {
    return this.getSpaces();
  },
});
