// Enhanced Undo Slice - Manages undo/redo with source attribution and batching
// See: .claude/plans/undo-redo-system-v2.md

import { StateCreator } from "zustand";
import type { AgenticCanvasStore } from "./index";
import type { CanvasSnapshot, ComponentInstance } from "@/types";
import {
  EnhancedUndoEntry,
  CommandSource,
  UndoViewContext,
  UndoCanvasCommand,
  ActiveBatch,
  BatchId,
  generateUndoId,
  generateAuditId,
  generateBatchId,
  createUserSource,
} from "@/lib/undo/types";
import { UndoPolicy, evaluatePolicies, canUndoEntry, defaultPolicies } from "@/lib/undo/policies";
import { emitToAuditLog, emitBatchEvent } from "@/lib/audit/audit-log";
import { describeCanvasCommand } from "@/lib/undo/execute-command";

// ============================================================================
// Slice State
// ============================================================================

export interface UndoState {
  // Undo/redo stacks
  undoStack: EnhancedUndoEntry[];
  redoStack: EnhancedUndoEntry[];

  // Configuration
  maxUndoEntries: number;

  // Batch tracking
  activeBatch: ActiveBatch | null;

  // Policies
  policies: UndoPolicy[];

  // User context (for policies)
  currentUserId: string;
  teamId?: string;
}

// ============================================================================
// Slice Actions
// ============================================================================

export interface UndoActions {
  // Core operations
  pushUndo: (params: {
    source: CommandSource;
    description: string;
    command: UndoCanvasCommand;
    beforeSnapshot: CanvasSnapshot;
    afterSnapshot: CanvasSnapshot;
    viewContext?: Partial<UndoViewContext>;
  }) => EnhancedUndoEntry;

  undo: (steps?: number) => EnhancedUndoEntry | null;
  redo: (steps?: number) => EnhancedUndoEntry | null;

  // Batch operations
  startBatch: (source: CommandSource, description: string) => BatchId;
  addToBatch: (params: {
    command: UndoCanvasCommand;
    beforeSnapshot: CanvasSnapshot;
    afterSnapshot: CanvasSnapshot;
    description?: string;
  }) => void;
  commitBatch: () => EnhancedUndoEntry | null;
  abortBatch: () => void;

  // Queries
  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoDescription: () => string | null;
  getRedoDescription: () => string | null;
  getUndoHistory: (limit?: number) => EnhancedUndoEntry[];

  // For specific sources
  getEntriesBySource: (sourceType: CommandSource["type"]) => EnhancedUndoEntry[];
  getEntriesByBatch: (batchId: BatchId) => EnhancedUndoEntry[];

  // Policy management
  setPolicies: (policies: UndoPolicy[]) => void;
  addPolicy: (policy: UndoPolicy) => void;
  removePolicy: (policyId: string) => void;

  // Admin operations
  placeRetentionHold: (
    entryId: string,
    hold: { reason: string; holdUntil: number; holdBy: string }
  ) => void;
  removeRetentionHold: (entryId: string) => void;

  // Cleanup
  clearHistory: () => void;
  pruneOldEntries: (olderThan: number) => void;
}

export type UndoSlice = UndoState & UndoActions;

// ============================================================================
// Helper Functions
// ============================================================================

function createSnapshot(components: ComponentInstance[]): CanvasSnapshot {
  return { components: structuredClone(components) };
}

function getDefaultViewContext(get: () => AgenticCanvasStore): UndoViewContext {
  const state = get();
  const activeView = state.workspace.views.find((v) => v.id === state.activeViewId);

  return {
    activeViewId: state.activeViewId,
    activeViewName: activeView?.name ?? "Default",
    affectedViewIds: state.activeViewId ? [state.activeViewId] : [],
    wasViewSpecificOp: false,
  };
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createUndoSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  UndoSlice
> = (set, get) => ({
  // Initial state
  undoStack: [],
  redoStack: [],
  maxUndoEntries: 100,
  activeBatch: null,
  policies: defaultPolicies,
  currentUserId: "anonymous",
  teamId: undefined,

  // ============================================================================
  // Core Operations
  // ============================================================================

  pushUndo: (params) => {
    const state = get();
    const id = generateUndoId();
    const auditCorrelationId = generateAuditId();
    const timestamp = Date.now();

    const viewContext: UndoViewContext = {
      ...getDefaultViewContext(get),
      ...params.viewContext,
    };

    // Create the entry
    const entry: EnhancedUndoEntry = {
      id,
      auditCorrelationId,
      timestamp,
      source: params.source,
      description: params.description,
      viewContext,
      beforeSnapshot: params.beforeSnapshot,
      afterSnapshot: params.afterSnapshot,
      commandType: "canvas",
      command: params.command,
      visibility: "user",
      canUndo: true,
    };

    // Evaluate policies
    const policyResults = evaluatePolicies(entry, state.policies, {
      currentTime: timestamp,
      userId: state.currentUserId,
      teamId: state.teamId,
    });

    const blocked = policyResults.find((r) => r.result === "blocked");
    if (blocked) {
      entry.canUndo = false;
      entry.undoBlockedReason = blocked.details;
    }

    // If we're in a batch, add to batch instead of stack
    if (state.activeBatch) {
      set((draft) => {
        draft.activeBatch!.entries.push(entry);
      });
      return entry;
    }

    // Push to undo stack
    set((draft) => {
      draft.undoStack.push(entry);
      draft.redoStack = [];

      // Prune if over limit
      if (draft.undoStack.length > draft.maxUndoEntries) {
        draft.undoStack.shift();
      }
    });

    // Emit to audit log (async, don't block)
    emitToAuditLog({
      id: auditCorrelationId,
      eventType: "operation_performed",
      entry,
      policyChecks: policyResults,
    });

    return entry;
  },

  undo: (steps = 1) => {
    const state = get();
    let lastEntry: EnhancedUndoEntry | null = null;
    const actualSteps = Math.min(steps, state.undoStack.length);

    for (let i = 0; i < actualSteps; i++) {
      const entry = state.undoStack[state.undoStack.length - 1 - i];
      if (!entry) break;

      // Check if we can undo this entry
      const canUndoResult = canUndoEntry(entry, state.policies, {
        currentTime: Date.now(),
        userId: state.currentUserId,
        teamId: state.teamId,
      });

      if (!canUndoResult.allowed) {
        console.warn(`Cannot undo: ${canUndoResult.reason}`);
        break;
      }

      lastEntry = entry;

      // Navigate to the view where this action was performed
      if (
        entry.viewContext.activeViewId !== state.activeViewId &&
        entry.viewContext.activeViewId !== null
      ) {
        set((draft) => {
          draft.activeViewId = entry.viewContext.activeViewId;
        });
      }

      // Restore beforeSnapshot
      set((draft) => {
        draft.canvas.components = structuredClone(entry.beforeSnapshot.components);
      });

      // Move to redo stack
      set((draft) => {
        const popped = draft.undoStack.pop();
        if (popped) {
          draft.redoStack.push(popped);
        }
      });

      // Re-fetch data for components with bindings
      const componentsWithBindings = get().canvas.components.filter((c) => c.dataBinding);
      for (const comp of componentsWithBindings) {
        get().fetchData(comp.id, comp.dataBinding!);
      }

      // Audit the undo operation
      emitToAuditLog({
        id: generateAuditId(),
        eventType: "operation_undone",
        entry,
        policyChecks: [],
        undoMetadata: {
          originalEntryId: entry.auditCorrelationId,
          originalTimestamp: entry.timestamp,
          originalSource: entry.source,
        },
      });
    }

    return lastEntry;
  },

  redo: (steps = 1) => {
    const state = get();
    let lastEntry: EnhancedUndoEntry | null = null;
    const actualSteps = Math.min(steps, state.redoStack.length);

    for (let i = 0; i < actualSteps; i++) {
      const entry = state.redoStack[state.redoStack.length - 1 - i];
      if (!entry) break;

      lastEntry = entry;

      // Navigate to the view where this action was performed
      if (
        entry.viewContext.activeViewId !== state.activeViewId &&
        entry.viewContext.activeViewId !== null
      ) {
        set((draft) => {
          draft.activeViewId = entry.viewContext.activeViewId;
        });
      }

      // Restore afterSnapshot
      set((draft) => {
        draft.canvas.components = structuredClone(entry.afterSnapshot.components);
      });

      // Move back to undo stack
      set((draft) => {
        const popped = draft.redoStack.pop();
        if (popped) {
          draft.undoStack.push(popped);
        }
      });

      // Re-fetch data for components with bindings
      const componentsWithBindings = get().canvas.components.filter((c) => c.dataBinding);
      for (const comp of componentsWithBindings) {
        get().fetchData(comp.id, comp.dataBinding!);
      }

      // Audit the redo operation
      emitToAuditLog({
        id: generateAuditId(),
        eventType: "operation_redone",
        entry,
        policyChecks: [],
        undoMetadata: {
          originalEntryId: entry.auditCorrelationId,
          originalTimestamp: entry.timestamp,
          originalSource: entry.source,
        },
      });
    }

    return lastEntry;
  },

  // ============================================================================
  // Batch Operations
  // ============================================================================

  startBatch: (source, description) => {
    const batchId = generateBatchId();

    set((draft) => {
      draft.activeBatch = {
        id: batchId,
        source,
        entries: [],
        description,
        startedAt: Date.now(),
      };
    });

    emitBatchEvent({
      eventType: "batch_started",
      batchId,
      description,
      source,
    });

    return batchId;
  },

  addToBatch: (params) => {
    const state = get();
    if (!state.activeBatch) {
      console.warn("No active batch to add to");
      return;
    }

    // Create a mini-entry for the batch
    const description = params.description ?? describeCanvasCommand(params.command);

    state.pushUndo({
      source: state.activeBatch.source,
      description,
      command: params.command,
      beforeSnapshot: params.beforeSnapshot,
      afterSnapshot: params.afterSnapshot,
    });
  },

  commitBatch: () => {
    const state = get();
    if (!state.activeBatch || state.activeBatch.entries.length === 0) {
      set((draft) => {
        draft.activeBatch = null;
      });
      return null;
    }

    const { id: batchId, source, entries, description } = state.activeBatch;

    // Combine all entries into one
    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];

    const combinedEntry: EnhancedUndoEntry = {
      id: generateUndoId(),
      auditCorrelationId: generateAuditId(),
      timestamp: Date.now(),
      source,
      description,
      viewContext: firstEntry.viewContext,
      beforeSnapshot: firstEntry.beforeSnapshot,
      afterSnapshot: lastEntry.afterSnapshot,
      commandType: "canvas",
      command: {
        type: "layout_bulk_update",
        componentIds: entries
          .map((e) => {
            const cmd = e.command as UndoCanvasCommand;
            if ("componentId" in cmd) return cmd.componentId;
            if ("component" in cmd) return cmd.component.id;
            return "";
          })
          .filter(Boolean),
        changes: [],
      },
      batchId,
      batchIndex: 0,
      batchSize: entries.length,
      visibility: "user",
      canUndo: true,
    };

    set((draft) => {
      draft.undoStack.push(combinedEntry);
      draft.redoStack = [];
      draft.activeBatch = null;

      // Prune if over limit
      if (draft.undoStack.length > draft.maxUndoEntries) {
        draft.undoStack.shift();
      }
    });

    emitBatchEvent({
      eventType: "batch_completed",
      batchId,
      description,
      source,
      entryCount: entries.length,
    });

    emitToAuditLog({
      id: combinedEntry.auditCorrelationId,
      eventType: "operation_performed",
      entry: combinedEntry,
      policyChecks: [],
    });

    return combinedEntry;
  },

  abortBatch: () => {
    const state = get();
    if (!state.activeBatch) return;

    const { id: batchId, source, description } = state.activeBatch;

    set((draft) => {
      draft.activeBatch = null;
    });

    emitBatchEvent({
      eventType: "batch_failed",
      batchId,
      description,
      source,
      error: "Batch aborted",
    });
  },

  // ============================================================================
  // Queries
  // ============================================================================

  canUndo: () => {
    const state = get();
    if (state.undoStack.length === 0) return false;

    const entry = state.undoStack[state.undoStack.length - 1];
    const result = canUndoEntry(entry, state.policies, {
      currentTime: Date.now(),
      userId: state.currentUserId,
      teamId: state.teamId,
    });

    return result.allowed;
  },

  canRedo: () => {
    return get().redoStack.length > 0;
  },

  getUndoDescription: () => {
    const state = get();
    if (state.undoStack.length === 0) return null;
    return state.undoStack[state.undoStack.length - 1].description;
  },

  getRedoDescription: () => {
    const state = get();
    if (state.redoStack.length === 0) return null;
    return state.redoStack[state.redoStack.length - 1].description;
  },

  getUndoHistory: (limit) => {
    const stack = get().undoStack;
    const reversed = [...stack].reverse();
    return limit ? reversed.slice(0, limit) : reversed;
  },

  getEntriesBySource: (sourceType) => {
    return get().undoStack.filter((e) => e.source.type === sourceType);
  },

  getEntriesByBatch: (batchId) => {
    return get().undoStack.filter((e) => e.batchId === batchId);
  },

  // ============================================================================
  // Policy Management
  // ============================================================================

  setPolicies: (policies) => {
    set((draft) => {
      draft.policies = policies;
    });
  },

  addPolicy: (policy) => {
    set((draft) => {
      draft.policies.push(policy);
    });
  },

  removePolicy: (policyId) => {
    set((draft) => {
      draft.policies = draft.policies.filter((p) => p.id !== policyId);
    });
  },

  // ============================================================================
  // Admin Operations
  // ============================================================================

  placeRetentionHold: (entryId, hold) => {
    set((draft) => {
      const entry = draft.undoStack.find((e) => e.id === entryId);
      if (entry) {
        entry.retentionHold = hold;
        entry.canUndo = false;
        entry.undoBlockedReason = `Retention hold: ${hold.reason}`;
      }
    });
  },

  removeRetentionHold: (entryId) => {
    set((draft) => {
      const entry = draft.undoStack.find((e) => e.id === entryId);
      if (entry) {
        entry.retentionHold = undefined;
        entry.canUndo = true;
        entry.undoBlockedReason = undefined;
      }
    });
  },

  // ============================================================================
  // Cleanup
  // ============================================================================

  clearHistory: () => {
    set((draft) => {
      draft.undoStack = [];
      draft.redoStack = [];
    });
  },

  pruneOldEntries: (olderThan) => {
    set((draft) => {
      draft.undoStack = draft.undoStack.filter((e) => e.timestamp >= olderThan);
    });
  },
});

// ============================================================================
// Convenience Exports
// ============================================================================

export { createUserSource, createSnapshot };
