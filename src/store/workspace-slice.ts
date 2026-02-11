// Workspace Slice - manages spaces, settings, and triggers
// See: .claude/plans/store-architecture-v0.1.md

import { StateCreator } from "zustand";
import { nanoid } from "nanoid";
import type { AgenticCanvasStore } from "./index";
import type {
  Workspace,
  WorkspaceSettings,
  Space,
  SpaceKind,
  SpaceMeta,
  SpaceId,
  ComponentId,
  TransformId,
  TransformDefinition,
  Canvas,
  ComponentInstance,
  SaveSpacePayload,
  CommandResult,
  CanvasSnapshot,
  MorningBriefTriggerType,
} from "@/types";
import type { Rule, RulePack, RuleTarget } from "@/lib/rules/types";
import { trackClientTelemetry } from "@/lib/telemetry-client";
import { createUserSource } from "@/lib/undo/types";
import type { UndoCanvasCommand, SpaceStateSnapshot } from "@/lib/undo/types";
import {
  createEmptyRulePack,
  getRulesForTarget as getRulesForTargetFromPack,
  setRulesForTarget as setRulesForTargetInPack,
} from "@/lib/rules/pack";
import {
  appendMorningBriefOverride,
  type MorningBriefOverrideInput,
  validateMorningBriefComponentData,
} from "@/lib/morning-brief";
import {
  createDefaultMorningBriefRuntimeState,
  createDefaultMorningBriefTriggers,
  ensureMorningBriefTriggers,
  evaluateMorningBriefTrigger,
  getMorningBriefTriggerByType,
  toMorningBriefTrigger,
  type MorningBriefTriggerRunReason,
} from "@/lib/morning-brief-triggers";
import { getDefaultBinding, getDefaultSize } from "@/lib/canvas-defaults";

const MORNING_BRIEF_SPACE_NAME = "Your Morning Brief";
const initialTimestamp = Date.now();
const morningBriefSpaceId = `space_${nanoid(10)}`;
const defaultSpaceId = `space_${nanoid(10)}`;
const initialGrid = {
  columns: 12,
  rows: 8,
  gap: 12,
  cellWidth: 0,
  cellHeight: 0,
};

interface CreateSpaceInput {
  id: SpaceId;
  name: string;
  description?: string;
  kind: SpaceKind;
  pinned: boolean;
  systemManaged: boolean;
  createdBy: "user" | "assistant";
  snapshot?: Canvas;
  triggerIds?: string[];
  briefingConfig?: Space["briefingConfig"];
  createdAt?: number;
  updatedAt?: number;
  lastVisitedAt?: number;
}

function createSpaceMeta({
  kind,
  pinned,
  systemManaged,
  createdBy,
  createdAt,
  updatedAt,
  lastVisitedAt,
}: Omit<SpaceMeta, "lastVisitedAt"> & { lastVisitedAt?: number }): SpaceMeta {
  return {
    kind,
    pinned,
    systemManaged,
    createdBy,
    createdAt,
    updatedAt,
    lastVisitedAt,
  };
}

function createSpaceRecord(input: CreateSpaceInput): Space {
  const createdAt = input.createdAt ?? initialTimestamp;
  const updatedAt = input.updatedAt ?? createdAt;
  const lastVisitedAt = input.lastVisitedAt ?? updatedAt;
  const meta = createSpaceMeta({
    kind: input.kind,
    pinned: input.pinned,
    systemManaged: input.systemManaged,
    createdBy: input.createdBy,
    createdAt,
    updatedAt,
    lastVisitedAt,
  });

  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    meta,
    description: input.description,
    snapshot: input.snapshot ?? {
      grid: initialGrid,
      components: [],
    },
    triggerIds: input.triggerIds ?? [],
    pinned: meta.pinned,
    createdBy: meta.createdBy,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    lastVisitedAt: meta.lastVisitedAt ?? meta.updatedAt,
    briefingConfig: input.briefingConfig
      ? structuredClone(input.briefingConfig)
      : undefined,
  };
}

function syncLegacySpaceFields(space: Space): void {
  space.kind = space.meta.kind;
  space.pinned = space.meta.pinned;
  space.createdBy = space.meta.createdBy;
  space.createdAt = space.meta.createdAt;
  space.updatedAt = space.meta.updatedAt;
  space.lastVisitedAt = space.meta.lastVisitedAt ?? space.meta.updatedAt;
}

function setSpaceUpdatedAt(space: Space, now: number): void {
  space.updatedAt = now;
  space.meta.updatedAt = now;
  syncLegacySpaceFields(space);
}

function setSpaceLastVisitedAt(space: Space, now: number): void {
  space.lastVisitedAt = now;
  space.meta.lastVisitedAt = now;
  setSpaceUpdatedAt(space, now);
}

function createMorningBriefComponent(createdAt: number): ComponentInstance {
  const binding = getDefaultBinding("system.morning-brief");
  const size = getDefaultSize("system.morning-brief") ?? { cols: 6, rows: 5 };
  return {
    id: `cmp_${nanoid(10)}`,
    typeId: "system.morning-brief",
    position: { col: 0, row: 0 },
    size,
    config: {},
    dataBinding: binding ? structuredClone(binding) : null,
    dataState: { status: "idle" },
    meta: {
      createdAt,
      createdBy: "assistant",
      pinned: true,
      label: "Your Morning Brief",
    },
  };
}

const morningBriefSpace: Space = createSpaceRecord({
  id: morningBriefSpaceId,
  name: MORNING_BRIEF_SPACE_NAME,
  description: "System-managed mission orientation for your day",
  kind: "system.morning_brief",
  pinned: true,
  systemManaged: true,
  createdBy: "assistant",
  snapshot: {
    grid: initialGrid,
    components: [createMorningBriefComponent(initialTimestamp)],
  },
});

const defaultSpace: Space = createSpaceRecord({
  id: defaultSpaceId,
  name: "Scratch",
  description: "Default workspace",
  kind: "ad_hoc",
  pinned: false,
  systemManaged: false,
  createdBy: "user",
  snapshot: {
    grid: initialGrid,
    components: [],
  },
});

// Initial workspace - always starts with a default space
const initialWorkspace: Workspace = {
  id: `ws_${nanoid(10)}`,
  name: "My Workspace",
  canvas: {
    grid: initialGrid,
    components: structuredClone(morningBriefSpace.snapshot.components),
  },
  threadId: "",
  spaces: [morningBriefSpace, defaultSpace],
  triggers: createDefaultMorningBriefTriggers(),
  morningBrief: createDefaultMorningBriefRuntimeState(),
  transforms: new Map(), // Start with no transforms
  rules: createEmptyRulePack(),
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
    autoOpenMorningBrief: true,
  },
  createdAt: initialTimestamp,
  updatedAt: initialTimestamp,
};

// Extended payload for updating existing spaces
export interface UpdateSpacePayload extends SaveSpacePayload {
  spaceId?: SpaceId; // If provided, updates existing space instead of creating new
}

// Options for creating a space
export interface CreateSpaceOptions {
  name?: string;
  createdBy?: "user" | "assistant";
  kind?: SpaceKind;
  pinned?: boolean;
  systemManaged?: boolean;
  switchTo?: boolean;
  briefingConfig?: Space["briefingConfig"];
}

export interface RunMorningBriefTriggerInput {
  type: MorningBriefTriggerType;
  metrics?: {
    riskDeltaPoints?: number;
    blockerCount?: number;
    behaviorDropPercent?: number;
    evidenceAgeMinutes?: number;
  };
  now?: number;
  force?: boolean;
}

export interface RunMorningBriefTriggerResult {
  fired: boolean;
  reason: MorningBriefTriggerRunReason;
  triggerId?: string;
  refreshedComponentId?: ComponentId;
}

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
  // Pin/unpin spaces
  pinSpace: (spaceId: SpaceId) => void;
  unpinSpace: (spaceId: SpaceId) => void;
  setBriefingConfig: (spaceId: SpaceId, config: Space["briefingConfig"]) => void;
  // Get spaces list for AI context
  getSpaces: () => Space[];
  // Computed helper
  hasUnsavedChanges: () => boolean;
  // Transform management
  createTransform: (transform: Omit<TransformDefinition, "id" | "createdAt">) => TransformId;
  deleteTransform: (id: TransformId) => void;
  getTransform: (id: TransformId) => TransformDefinition | undefined;
  getTransforms: () => TransformDefinition[];
  // Rules management
  setRulesForTarget: (target: RuleTarget, rules: Rule[]) => void;
  getRulesForTarget: (target: RuleTarget) => Rule[];
  getRulePack: () => RulePack;
  runMorningBriefTrigger: (
    input: RunMorningBriefTriggerInput
  ) => Promise<RunMorningBriefTriggerResult>;
  markMorningBriefAutoOpened: (now?: number) => void;
  applyMorningBriefOverrideAction: (
    componentId: ComponentId,
    input: MorningBriefOverrideInput
  ) => boolean;

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

function getPinnedComponentSignature(component: ComponentInstance): string {
  return JSON.stringify({
    typeId: component.typeId,
    position: component.position,
    size: component.size,
    config: component.config,
    dataBinding: component.dataBinding,
    createdAt: component.meta.createdAt,
    createdBy: component.meta.createdBy,
    label: component.meta.label,
    template: component.meta.template,
  });
}

function dedupePinnedComponents(components: ComponentInstance[]): ComponentInstance[] {
  const seen = new Set<string>();

  return components.filter((component) => {
    const signature = getPinnedComponentSignature(component);
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

function computeBriefingSinceTimestamp(space: Space, now: number): number {
  const defaultSince = now - 24 * 60 * 60 * 1000;
  if (!space.lastVisitedAt) {
    return defaultSince;
  }
  if (space.createdAt && Math.abs(space.lastVisitedAt - space.createdAt) < 60_000) {
    return defaultSince;
  }
  return space.lastVisitedAt;
}

function createSpaceStateSnapshot(state: AgenticCanvasStore): SpaceStateSnapshot {
  return {
    spaces: structuredClone(state.workspace.spaces),
    activeSpaceId: state.activeSpaceId,
    spaceSnapshotHash: state.spaceSnapshotHash,
    workspaceUpdatedAt: state.workspace.updatedAt,
  };
}

function findActiveMorningBriefComponent(state: AgenticCanvasStore): ComponentInstance | undefined {
  return state.canvas.components.find((component) => component.typeId === "system.morning-brief");
}

function resolveEvidenceAgeFromComponent(component: ComponentInstance | undefined): number | undefined {
  if (!component) return undefined;
  if (component.dataState.status !== "ready" && component.dataState.status !== "stale") {
    return undefined;
  }

  const parsed = validateMorningBriefComponentData(component.dataState.data);
  if (!parsed.valid) {
    return undefined;
  }

  if (parsed.data.current.evidence.length === 0) {
    return undefined;
  }

  return parsed.data.current.evidence.reduce(
    (maxAge, evidence) => Math.max(maxAge, evidence.freshnessMinutes),
    0
  );
}

function syncMorningBriefSnapshotIfActive(state: AgenticCanvasStore): void {
  const activeSpace = state.workspace.spaces.find((space) => space.id === state.activeSpaceId);
  if (!activeSpace || activeSpace.kind !== "system.morning_brief") {
    return;
  }

  activeSpace.snapshot.components = JSON.parse(JSON.stringify(state.canvas.components));
}

// Slice creator
export const createWorkspaceSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  WorkspaceSlice
> = (set, get) => ({
  workspace: initialWorkspace,
  activeSpaceId: morningBriefSpaceId, // Start in Morning Brief space
  lastSpaceId: morningBriefSpaceId,
  spaceSnapshotHash: hashCanvas(morningBriefSpace.snapshot),

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
          const target = state.workspace.spaces[existingIndex];
          target.snapshot = snapshot;
          target.name = name;
          target.description = description;
          setSpaceLastVisitedAt(target, now);
          state.workspace.updatedAt = now;
          state.spaceSnapshotHash = snapshotHash;
        });
        return existingSpaceId;
      }
    }

    // Create new space
    const spaceId = `space_${nanoid(10)}`;
    const space = createSpaceRecord({
      id: spaceId,
      name,
      description,
      kind: "ad_hoc",
      pinned: false,
      systemManaged: false,
      createdBy: "user",
      snapshot,
      triggerIds: triggerIds ?? [],
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    });

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
    const pinnedComponents = dedupePinnedComponents(
      currentComponents.filter((c) => c.meta.pinned)
    );
    const loadedComponentIds: string[] = [];

    // Compute snapshot hash for change detection
    const snapshotHash = hashCanvas(space.snapshot);
    const now = Date.now();
    const briefingSince = space.briefingConfig
      ? computeBriefingSinceTimestamp(space, now)
      : undefined;

    // Load space (preserve pinned components)
    set((state) => {
      const snapshotComponents: ComponentInstance[] = JSON.parse(
        JSON.stringify(space.snapshot.components)
      );

      const snapshotPinned = dedupePinnedComponents(
        snapshotComponents.filter((component) => component.meta.pinned)
      );
      const snapshotNonPinned = snapshotComponents.filter((component) => !component.meta.pinned);
      const currentPinnedSignatures = new Set(pinnedComponents.map(getPinnedComponentSignature));
      const snapshotPinnedToLoad = snapshotPinned.filter(
        (component) => !currentPinnedSignatures.has(getPinnedComponentSignature(component))
      );

      const loadedComponents = [...snapshotPinnedToLoad, ...snapshotNonPinned];
      if (space.kind === "system.morning_brief") {
        const hasMorningBriefComponent = [...pinnedComponents, ...loadedComponents].some(
          (component) => component.typeId === "system.morning-brief"
        );
        if (!hasMorningBriefComponent) {
          loadedComponents.push(createMorningBriefComponent(now));
        }
      }

      // Regenerate IDs to avoid conflicts
      loadedComponents.forEach((c) => {
        c.id = `cmp_${nanoid(10)}`;
        loadedComponentIds.push(c.id);
        c.dataState = { status: "idle" };
        if (
          (c.typeId === "briefing.recommendations" || c.typeId === "system.morning-brief") &&
          c.dataBinding &&
          briefingSince
        ) {
          c.dataBinding.query.params = {
            ...c.dataBinding.query.params,
            since: briefingSince,
          };
          c.config = {
            ...c.config,
            sinceTimestamp: briefingSince,
          };
        }
      });

      state.canvas.components = [...pinnedComponents, ...loadedComponents];
      state.workspace.updatedAt = now;
      state.activeSpaceId = spaceId;
      state.lastSpaceId = spaceId;
      state.spaceSnapshotHash = snapshotHash;

      // Update lastVisitedAt on the space
      const spaceIndex = state.workspace.spaces.findIndex((s) => s.id === spaceId);
      if (spaceIndex !== -1) {
        const target = state.workspace.spaces[spaceIndex];
        setSpaceLastVisitedAt(target, now);
        if (target.briefingConfig && briefingSince) {
          target.briefingConfig = {
            ...target.briefingConfig,
            sinceTimestamp: briefingSince,
          };
        }
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
    const loadedComponentIdSet = new Set(loadedComponentIds);
    const loadedComponents = get().canvas.components.filter((c) =>
      loadedComponentIdSet.has(c.id)
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
    if (space.meta.systemManaged) return;

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
        setSpaceUpdatedAt(target, now);
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

    const duplicatedKind: SpaceKind =
      space.kind === "system.morning_brief" ? "ad_hoc" : space.kind;
    const newSpace = createSpaceRecord({
      id: newSpaceId,
      name: newName,
      description: space.description,
      kind: duplicatedKind,
      pinned: false,
      systemManaged: false,
      createdBy: "user",
      snapshot: JSON.parse(JSON.stringify(space.snapshot)),
      triggerIds: [],
      briefingConfig: space.briefingConfig ? structuredClone(space.briefingConfig) : undefined,
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    });

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
    const {
      name,
      createdBy = "user",
      kind = "ad_hoc",
      pinned = false,
      systemManaged = false,
      switchTo = true,
      briefingConfig,
    } = options;

    if (kind === "system.morning_brief") {
      const existingMorningBrief = get().workspace.spaces.find(
        (space) => space.kind === "system.morning_brief"
      );
      if (existingMorningBrief) {
        if (switchTo) {
          get().setActiveSpace(existingMorningBrief.id);
        }
        return existingMorningBrief.id;
      }
    }

    // Generate unique name if not provided
    const existingNames = get().workspace.spaces.map((s) => s.name);
    const defaultName = kind === "system.morning_brief" ? MORNING_BRIEF_SPACE_NAME : "Untitled";
    let spaceName = name ?? defaultName;
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

    const newSpace = createSpaceRecord({
      id: spaceId,
      name: spaceName,
      description: "",
      kind,
      pinned,
      systemManaged,
      createdBy,
      snapshot: emptySnapshot,
      triggerIds: [],
      briefingConfig: briefingConfig ? structuredClone(briefingConfig) : undefined,
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    });

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
      const briefingSince = space.briefingConfig
        ? computeBriefingSinceTimestamp(space, now)
        : undefined;
      set((state) => {
        state.activeSpaceId = spaceId;
        state.lastSpaceId = spaceId;
        state.spaceSnapshotHash = snapshotHash;
        // Update lastVisitedAt
        const spaceIndex = state.workspace.spaces.findIndex((s) => s.id === spaceId);
        if (spaceIndex !== -1) {
          const target = state.workspace.spaces[spaceIndex];
          setSpaceLastVisitedAt(target, now);
          if (target.briefingConfig && briefingSince) {
            target.briefingConfig = {
              ...target.briefingConfig,
              sinceTimestamp: briefingSince,
            };
          }
        }
      });
    }
  },

  setBriefingConfig: (spaceId, config) => {
    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());
    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (!space) return;

    const now = Date.now();
    set((state) => {
      const target = state.workspace.spaces.find((s) => s.id === spaceId);
      if (target) {
        target.briefingConfig = config ? structuredClone(config) : undefined;
        setSpaceUpdatedAt(target, now);
        state.workspace.updatedAt = now;
      }
    });

    const afterSnapshot = createSnapshot(get().canvas.components);
    const afterSpaceState = createSpaceStateSnapshot(get());

    const command: UndoCanvasCommand = {
      type: "space_update",
      spaceId,
      spaceName: space.name,
    };

    get().pushUndo({
      source: createUserSource(),
      description: `Updated briefing config: ${space.name}`,
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

  pinSpace: (spaceId) => {
    const space = get().workspace.spaces.find((s) => s.id === spaceId);
    if (!space || space.pinned) return;

    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());

    set((state) => {
      const target = state.workspace.spaces.find((s) => s.id === spaceId);
      if (target) {
        const now = Date.now();
        target.meta.pinned = true;
        setSpaceUpdatedAt(target, now);
        state.workspace.updatedAt = now;
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
    if (!space || !space.pinned || space.meta.systemManaged) return;

    const beforeSnapshot = createSnapshot(get().canvas.components);
    const beforeSpaceState = createSpaceStateSnapshot(get());

    set((state) => {
      const target = state.workspace.spaces.find((s) => s.id === spaceId);
      if (target) {
        const now = Date.now();
        target.meta.pinned = false;
        setSpaceUpdatedAt(target, now);
        state.workspace.updatedAt = now;
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

  getSpaces: () => {
    return get().workspace.spaces;
  },

  // Transform management methods
  createTransform: (transform) => {
    const id = `transform_${nanoid(10)}`;
    const now = Date.now();

    set((state) => {
      state.workspace.transforms.set(id, {
        ...transform,
        id,
        createdAt: now,
      });
      state.workspace.updatedAt = now;
    });

    return id;
  },

  deleteTransform: (id) => {
    if (!get().workspace.transforms.has(id)) return;

    set((state) => {
      state.workspace.transforms.delete(id);
      state.workspace.updatedAt = Date.now();
    });
  },

  getTransform: (id) => {
    return get().workspace.transforms.get(id);
  },

  getTransforms: () => {
    return Array.from(get().workspace.transforms.values());
  },

  setRulesForTarget: (target, rules) => {
    const now = Date.now();
    set((state) => {
      state.workspace.rules = setRulesForTargetInPack(state.workspace.rules, target, rules);
      state.workspace.updatedAt = now;
    });
    void trackClientTelemetry({
      source: "store.rules",
      event: "set",
      data: {
        target,
        ruleCount: rules.length,
      },
    });
  },

  getRulesForTarget: (target) => {
    return getRulesForTargetFromPack(get().workspace.rules, target);
  },

  getRulePack: () => {
    return get().workspace.rules;
  },

  runMorningBriefTrigger: async ({ type, metrics = {}, now, force }) => {
    const nowMs = now ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();

    set((state) => {
      state.workspace.triggers = ensureMorningBriefTriggers(state.workspace.triggers);
      if (!state.workspace.morningBrief) {
        state.workspace.morningBrief = createDefaultMorningBriefRuntimeState();
      }
    });

    const triggerEntry = getMorningBriefTriggerByType(get().workspace.triggers, type);
    if (!triggerEntry) {
      return { fired: false, reason: "missing_trigger" };
    }

    const trigger = toMorningBriefTrigger(triggerEntry);
    if (!trigger) {
      return { fired: false, reason: "missing_trigger" };
    }

    const runtime = get().workspace.morningBrief;
    const componentBeforeRefresh = findActiveMorningBriefComponent(get());
    const evidenceAgeMinutes =
      typeof metrics.evidenceAgeMinutes === "number"
        ? metrics.evidenceAgeMinutes
        : resolveEvidenceAgeFromComponent(componentBeforeRefresh);

    const reason = evaluateMorningBriefTrigger({
      trigger,
      runtime,
      signal: {
        ...metrics,
        evidenceAgeMinutes,
      },
      nowMs,
      force,
    });

    if (reason !== "fired") {
      return {
        fired: false,
        reason,
        triggerId: trigger.id,
      };
    }

    set((state) => {
      state.workspace.triggers = state.workspace.triggers.map((existing) =>
        existing.type === type ? { ...existing, lastFiredAt: nowIso } : existing
      );
      state.workspace.updatedAt = nowMs;
    });

    const activeSpace = get().workspace.spaces.find((space) => space.id === get().activeSpaceId);
    if (activeSpace?.kind === "system.morning_brief" && !componentBeforeRefresh) {
      set((state) => {
        const seeded = createMorningBriefComponent(nowMs);
        state.canvas.components.push(seeded);
        syncMorningBriefSnapshotIfActive(state);
      });
    }

    set((state) => {
      for (const [cacheKey, cached] of state.dataCache.entries()) {
        if (cached.binding.source === "briefing" && cached.binding.query.type === "morning_brief") {
          state.dataCache.delete(cacheKey);
        }
      }
    });

    const componentToRefresh = findActiveMorningBriefComponent(get());
    if (!componentToRefresh?.dataBinding) {
      return {
        fired: true,
        reason: "fired",
        triggerId: trigger.id,
      };
    }

    await get().refreshComponent(componentToRefresh.id);

    const refreshedComponent = findActiveMorningBriefComponent(get());
    if (
      refreshedComponent &&
      (refreshedComponent.dataState.status === "ready" ||
        refreshedComponent.dataState.status === "stale")
    ) {
      const parsed = validateMorningBriefComponentData(refreshedComponent.dataState.data);
      set((state) => {
        if (!state.workspace.morningBrief) {
          state.workspace.morningBrief = createDefaultMorningBriefRuntimeState();
        }
        if (parsed.valid && parsed.data.current.confidence === "low") {
          state.workspace.morningBrief.lowConfidenceStreak += 1;
        } else if (parsed.valid) {
          state.workspace.morningBrief.lowConfidenceStreak = 0;
        }

        state.workspace.morningBrief.mode =
          state.workspace.morningBrief.lowConfidenceStreak >= 2
            ? "suggest_only"
            : "active";
        state.workspace.morningBrief.lastRefreshedAt = nowIso;
        state.workspace.updatedAt = nowMs;
      });
    }

    return {
      fired: true,
      reason: "fired",
      triggerId: trigger.id,
      refreshedComponentId: componentToRefresh.id,
    };
  },

  markMorningBriefAutoOpened: (now) => {
    const nowMs = now ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    set((state) => {
      if (!state.workspace.morningBrief) {
        state.workspace.morningBrief = createDefaultMorningBriefRuntimeState();
      }
      state.workspace.morningBrief.lastAutoOpenedAt = nowIso;
      state.workspace.updatedAt = nowMs;
    });
  },

  applyMorningBriefOverrideAction: (componentId, input) => {
    const component = get().canvas.components.find((candidate) => candidate.id === componentId);
    if (!component || component.typeId !== "system.morning-brief") {
      return false;
    }

    if (component.dataState.status !== "ready" && component.dataState.status !== "stale") {
      return false;
    }

    const parsed = validateMorningBriefComponentData(component.dataState.data);
    if (!parsed.valid) {
      return false;
    }

    const updatedData = appendMorningBriefOverride(parsed.data, input);
    const now = Date.now();

    set((state) => {
      const target = state.canvas.components.find((candidate) => candidate.id === componentId);
      if (!target) return;
      target.dataState = {
        status: "ready",
        data: updatedData,
        fetchedAt: now,
      };

      if (!state.workspace.morningBrief) {
        state.workspace.morningBrief = createDefaultMorningBriefRuntimeState();
      }

      if (input.type === "snooze") {
        const payload = input.payload ?? {};
        const minutes =
          typeof payload.durationMinutes === "number" && payload.durationMinutes > 0
            ? payload.durationMinutes
            : typeof payload.minutes === "number" && payload.minutes > 0
              ? payload.minutes
              : 120;
        state.workspace.morningBrief.snoozedUntil = new Date(now + minutes * 60_000).toISOString();
      }

      syncMorningBriefSnapshotIfActive(state);
      state.workspace.updatedAt = now;
    });

    return true;
  },

});
