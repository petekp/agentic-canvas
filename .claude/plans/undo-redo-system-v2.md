# Implement Enhanced Undo/Redo System with Observability

## Context

We're building an Agentic Canvas - a productivity workspace where AI assistants and background agents can manipulate both canvas state and filesystem. We need a robust undo/redo system that:

1. Supports multiple sources (user, assistant, background agents, system)
2. Batches multi-step AI operations for atomic undo
3. Tracks filesystem changes from agents (future: Anthropic Agent SDK)
4. Maintains a separate immutable audit log for admin observability
5. Supports policies that can block or flag certain undo operations
6. Follows Figma's model: global timeline with view context metadata

## Architecture Overview

User/Agent Action │ ├──────────────────────┐ ▼ ▼ ┌──────────────┐ ┌─────────────────┐ │ Undo Stack │ │ Audit Log │ │ (ephemeral) │ │ (immutable) │ │ Per-user │ │ Team-wide │ └──────────────┘ └─────────────────┘ │ │ ▼ ▼ User Undo Admin Dashboard Cmd+Z / Cmd+Shift+Z Compliance Export

## Phase 1: Core Types & Command Protocol

### File: `src/lib/undo/types.ts`

Create comprehensive type definitions:

```typescript
// Unique IDs
export type UndoId = string & { readonly brand: unique symbol };
export type AuditId = string & { readonly brand: unique symbol };
export type BatchId = string & { readonly brand: unique symbol };

export function generateUndoId(): UndoId;
export function generateAuditId(): AuditId;
export function generateBatchId(): BatchId;

// === Command Sources ===
// Who initiated the change - critical for attribution and policies

export type CommandSource =
  | UserCommandSource
  | AssistantCommandSource
  | BackgroundCommandSource
  | SystemCommandSource;

export interface UserCommandSource {
  type: "user";
  trigger: "direct" | "keyboard" | "drag" | "menu" | "context_menu";
}

export interface AssistantCommandSource {
  type: "assistant";
  threadId?: string;
  messageId: string;
  toolCallId: string;
  batchId?: BatchId;
  model?: string;
}

export interface BackgroundCommandSource {
  type: "background";
  agentId: string;
  agentType: string;       // e.g., "code-writer", "analyzer"
  taskId: string;
  taskName: string;
  triggeredBy: "schedule" | "event" | "condition" | "user_request";
  batchId?: BatchId;
}

export interface SystemCommandSource {
  type: "system";
  reason: "auto_save" | "migration" | "sync" | "restore" | "rehydrate";
  undoable: boolean;       // System ops usually not undoable
}

// === Canvas Commands ===
// All possible mutations to canvas state

export type CanvasCommand =
  | { type: "component_add"; component: CanvasComponent }
  | { type: "component_remove"; componentId: string; snapshot: CanvasComponent }
  | { type: "component_move"; componentId: string; from: Position; to: Position }
  | { type: "component_resize"; componentId: string; from: Size; to: Size }
  | { type: "component_update_config"; componentId: string; from: unknown; to: unknown }
  | { type: "component_update_binding"; componentId: string; from: DataBinding | null; to: DataBinding | null }
  | { type: "layout_bulk_update"; from: LayoutItem[]; to: LayoutItem[] }
  | { type: "view_create"; view: CanvasView }
  | { type: "view_delete"; viewId: string; snapshot: CanvasView }
  | { type: "view_rename"; viewId: string; from: string; to: string }
  | { type: "view_switch"; from: string; to: string };  // Not undoable, just tracked

// === Filesystem Commands ===
// For future agent filesystem access

export type FilesystemCommand =
  | { type: "file_create"; path: string; content: string }
  | { type: "file_modify"; path: string; previousContent: string; newContent: string; previousHash: string; newHash: string }
  | { type: "file_delete"; path: string; previousContent: string; previousHash: string }
  | { type: "file_move"; fromPath: string; toPath: string }
  | { type: "file_copy"; fromPath: string; toPath: string }
  | { type: "directory_create"; path: string }
  | { type: "directory_delete"; path: string; snapshot: DirectorySnapshot };

export interface DirectorySnapshot {
  path: string;
  files: Array<{ relativePath: string; content: string; hash: string }>;
}

// === Hybrid Commands ===
// When an operation affects both canvas and filesystem

export interface HybridCommand {
  canvas: CanvasCommand[];
  filesystem: FilesystemCommand[];
}

// === View Context ===
// Which view was active when the change occurred

export interface UndoViewContext {
  activeViewId: string;
  activeViewName: string;
  affectedViewIds: string[];    // Some ops affect multiple views
  wasViewSpecificOp: boolean;   // e.g., rename only affects that view
}

// === Undo Entry ===
// A single undoable operation in the stack

export interface UndoEntry {
  // Identity
  id: UndoId;
  auditCorrelationId: AuditId;  // Links to immutable audit record

  // Timing
  timestamp: number;

  // Attribution
  source: CommandSource;

  // Human-readable description
  description: string;

  // View context
  viewContext: UndoViewContext;

  // The actual commands
  commandType: "canvas" | "filesystem" | "hybrid";
  forward: CanvasCommand | FilesystemCommand | HybridCommand;
  inverse: CanvasCommand | FilesystemCommand | HybridCommand;

  // Batch support - multiple entries can form one logical operation
  batchId?: BatchId;
  batchIndex?: number;
  batchSize?: number;

  // Observability & Compliance
  visibility: "user" | "team";
  canUndo: boolean;
  undoBlockedReason?: string;
  retentionHold?: RetentionHold;

  // Filesystem-specific metadata
  filesystemImpact?: {
    pathsAffected: string[];
    totalBytesChanged: number;
    containsSensitivePaths: boolean;
  };
}

export interface RetentionHold {
  reason: string;
  holdUntil: number;
  holdBy: string;
}

// === Audit Log Entry ===
// Immutable record for compliance

export interface AuditLogEntry {
  // Immutable identity
  id: AuditId;
  hash: string;              // SHA-256 of entry content
  previousHash: string;      // Chain for tamper detection

  // Timing
  timestamp: number;

  // Who
  userId: string;
  userEmail?: string;
  teamId?: string;

  // Source (denormalized from CommandSource for querying)
  sourceType: "user" | "assistant" | "background" | "system";
  agentId?: string;
  agentType?: string;
  taskId?: string;

  // What happened
  eventType: AuditEventType;
  scope: "canvas" | "filesystem" | "hybrid";
  description: string;

  // Detailed changes
  canvasChanges?: CanvasChangeRecord[];
  filesystemChanges?: FilesystemChangeRecord[];

  // Policy evaluation
  policyChecks: PolicyCheckResult[];

  // If this is an undo/redo event
  undoMetadata?: {
    originalEntryId: AuditId;
    originalTimestamp: number;
    originalSource: CommandSource;
    reason?: string;
  };

  // Retention
  retentionPolicy: string;
  expiresAt?: number;
}

export type AuditEventType =
  | "operation_performed"
  | "operation_undone"
  | "operation_redone"
  | "operation_blocked"
  | "batch_started"
  | "batch_completed"
  | "batch_failed"
  | "policy_violation";

export interface CanvasChangeRecord {
  componentId: string;
  componentType: string;
  changeType: "add" | "remove" | "modify" | "move" | "resize";
}

export interface FilesystemChangeRecord {
  path: string;
  operation: "create" | "modify" | "delete" | "move" | "copy";
  beforeHash?: string;
  afterHash?: string;
  sizeChange: number;
}

export interface PolicyCheckResult {
  policyId: string;
  policyName: string;
  result: "allowed" | "blocked" | "flagged";
  details?: string;
}
File: src/lib/undo/policies.ts
Define the policy engine:
export interface UndoPolicy {
  id: string;
  name: string;
  enabled: boolean;

  // Scope
  scope: {
    users?: string[];
    teams?: string[];
    agentTypes?: string[];
    commandTypes?: ("canvas" | "filesystem" | "hybrid")[];
  };

  // Rule
  rule: UndoPolicyRule;

  // Enforcement
  enforcement: "block" | "flag" | "log_only";

  // Notifications
  notifyOnViolation?: NotificationConfig;
}

export type UndoPolicyRule =
  | { type: "path_forbidden"; patterns: string[] }
  | { type: "path_requires_approval"; patterns: string[] }
  | { type: "max_files_per_batch"; count: number }
  | { type: "max_bytes_per_batch"; bytes: number }
  | { type: "block_undo_after"; hours: number }
  | { type: "require_reason_for_undo"; scope: "filesystem" | "all" }
  | { type: "retention_hold"; entryIds: string[] };

export interface NotificationConfig {
  channels: ("console" | "callback")[];
  callback?: (violation: PolicyViolation) => void;
}

export interface PolicyViolation {
  policy: UndoPolicy;
  entry: UndoEntry;
  timestamp: number;
  details: string;
}

// Policy evaluation function
export function evaluatePolicies(
  entry: UndoEntry,
  policies: UndoPolicy[],
  context: { currentTime: number; userId: string; teamId?: string }
): PolicyCheckResult[];

// Check if undo is allowed
export function canUndoEntry(
  entry: UndoEntry,
  policies: UndoPolicy[],
  context: { currentTime: number; userId: string }
): { allowed: boolean; reason?: string };
Phase 2: Undo Stack Implementation
File: src/store/undo-slice.ts
Implement the Zustand slice for undo/redo:
import { StateCreator } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface UndoState {
  // Stacks
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // Configuration
  maxUndoEntries: number;  // Default: 100

  // Batch tracking
  activeBatch: {
    id: BatchId;
    source: CommandSource;
    entries: UndoEntry[];
    description: string;
  } | null;

  // Policies
  policies: UndoPolicy[];
}

export interface UndoActions {
  // Core operations
  pushUndo: (entry: Omit<UndoEntry, "id" | "auditCorrelationId" | "timestamp" | "canUndo">) => UndoEntry;
  undo: () => UndoEntry | null;
  redo: () => UndoEntry | null;

  // Batch operations
  startBatch: (source: CommandSource, description: string) => BatchId;
  addToBatch: (command: CanvasCommand | FilesystemCommand) => void;
  commitBatch: () => UndoEntry | null;  // Returns combined entry
  abortBatch: () => void;

  // Queries
  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoDescription: () => string | null;
  getRedoDescription: () => string | null;
  getUndoHistory: (limit?: number) => UndoEntry[];

  // For specific sources
  getEntriesBySource: (sourceType: CommandSource["type"]) => UndoEntry[];
  getEntriesByBatch: (batchId: BatchId) => UndoEntry[];

  // Policy management
  setPolicies: (policies: UndoPolicy[]) => void;
  addPolicy: (policy: UndoPolicy) => void;
  removePolicy: (policyId: string) => void;

  // Admin operations
  placeRetentionHold: (entryId: UndoId, hold: RetentionHold) => void;
  removeRetentionHold: (entryId: UndoId) => void;

  // Cleanup
  clearUndoHistory: () => void;
  pruneOldEntries: (olderThan: number) => void;
}

export type UndoSlice = UndoState & UndoActions;

export const createUndoSlice: StateCreator<
  StoreState,  // Full store state
  [["zustand/immer", never]],
  [],
  UndoSlice
> = (set, get) => ({
  // Initial state
  undoStack: [],
  redoStack: [],
  maxUndoEntries: 100,
  activeBatch: null,
  policies: [],

  // Implement all actions...
});
Key implementation details for pushUndo:
pushUndo: (entryInput) => {
  const state = get();
  const id = generateUndoId();
  const auditCorrelationId = generateAuditId();
  const timestamp = Date.now();

  // Evaluate policies
  const policyResults = evaluatePolicies(
    { ...entryInput, id, auditCorrelationId, timestamp } as UndoEntry,
    state.policies,
    { currentTime: timestamp, userId: state.currentUserId, teamId: state.teamId }
  );

  const blocked = policyResults.find(r => r.result === "blocked");

  const entry: UndoEntry = {
    ...entryInput,
    id,
    auditCorrelationId,
    timestamp,
    canUndo: !blocked,
    undoBlockedReason: blocked?.details,
  };

  set((draft) => {
    // Push to undo stack
    draft.undoStack.push(entry);

    // Clear redo stack (new action invalidates redo)
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
Key implementation for batch operations:
startBatch: (source, description) => {
  const batchId = generateBatchId();
  set((draft) => {
    draft.activeBatch = {
      id: batchId,
      source,
      entries: [],
      description,
    };
  });
  return batchId;
},

commitBatch: () => {
  const state = get();
  if (!state.activeBatch || state.activeBatch.entries.length === 0) {
    set((draft) => { draft.activeBatch = null; });
    return null;
  }

  const { id: batchId, source, entries, description } = state.activeBatch;

  // Combine all commands into one entry
  const combinedEntry: UndoEntry = {
    id: generateUndoId(),
    auditCorrelationId: generateAuditId(),
    timestamp: Date.now(),
    source,
    description,
    viewContext: entries[0].viewContext,  // Use first entry's context
    commandType: determineCommandType(entries),
    forward: combineForwardCommands(entries),
    inverse: combineInverseCommands(entries),  // Reverse order!
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
  });

  return combinedEntry;
},
Phase 3: Audit Log Implementation
File: src/lib/audit/audit-log.ts
import { createHash } from "crypto";

export class AuditLog {
  private entries: AuditLogEntry[] = [];
  private lastHash: string = "genesis";

  // Subscribers for real-time streaming
  private subscribers: Set<(entry: AuditLogEntry) => void> = new Set();

  append(entry: Omit<AuditLogEntry, "hash" | "previousHash">): AuditLogEntry {
    const previousHash = this.lastHash;
    const contentToHash = JSON.stringify({ ...entry, previousHash });
    const hash = createHash("sha256").update(contentToHash).digest("hex");

    const fullEntry: AuditLogEntry = {
      ...entry,
      hash,
      previousHash,
    };

    this.entries.push(fullEntry);
    this.lastHash = hash;

    // Notify subscribers
    this.subscribers.forEach(cb => cb(fullEntry));

    // Persist (implement based on storage backend)
    this.persist(fullEntry);

    return fullEntry;
  }

  // Query methods
  query(params: AuditQuery): AuditLogEntry[] {
    return this.entries.filter(entry => {
      if (params.from && entry.timestamp < params.from) return false;
      if (params.to && entry.timestamp > params.to) return false;
      if (params.userId && entry.userId !== params.userId) return false;
      if (params.sourceType && !params.sourceType.includes(entry.sourceType)) return false;
      if (params.eventType && !params.eventType.includes(entry.eventType)) return false;
      if (params.scope && !params.scope.includes(entry.scope)) return false;
      return true;
    });
  }

  // Verify chain integrity
  verifyIntegrity(): { valid: boolean; brokenAt?: number } {
    let expectedPreviousHash = "genesis";

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      if (entry.previousHash !== expectedPreviousHash) {
        return { valid: false, brokenAt: i };
      }

      const { hash, ...rest } = entry;
      const computedHash = createHash("sha256")
        .update(JSON.stringify({ ...rest, previousHash: entry.previousHash }))
        .digest("hex");

      if (computedHash !== hash) {
        return { valid: false, brokenAt: i };
      }

      expectedPreviousHash = hash;
    }

    return { valid: true };
  }

  // Subscribe to new entries
  subscribe(callback: (entry: AuditLogEntry) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // Export for compliance
  export(format: "json" | "csv", query?: AuditQuery): string {
    const entries = query ? this.query(query) : this.entries;

    if (format === "json") {
      return JSON.stringify(entries, null, 2);
    }

    // CSV export
    const headers = ["timestamp", "userId", "sourceType", "eventType", "scope", "description"];
    const rows = entries.map(e =>
      headers.map(h => JSON.stringify(e[h as keyof AuditLogEntry] ?? "")).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  private persist(entry: AuditLogEntry): void {
    // For now, use localStorage. In production, send to backend.
    const key = `audit_log_${entry.id}`;
    localStorage.setItem(key, JSON.stringify(entry));

    // Also maintain an index
    const index = JSON.parse(localStorage.getItem("audit_log_index") || "[]");
    index.push(entry.id);
    localStorage.setItem("audit_log_index", JSON.stringify(index));
  }
}

// Singleton instance
export const auditLog = new AuditLog();

// Helper to emit from undo system
export function emitToAuditLog(params: {
  id: AuditId;
  eventType: AuditEventType;
  entry: UndoEntry;
  policyChecks: PolicyCheckResult[];
  undoMetadata?: AuditLogEntry["undoMetadata"];
}): void {
  auditLog.append({
    id: params.id,
    timestamp: Date.now(),
    userId: getCurrentUserId(),  // Implement based on your auth
    sourceType: params.entry.source.type,
    agentId: params.entry.source.type === "background" ? params.entry.source.agentId : undefined,
    eventType: params.eventType,
    scope: params.entry.commandType,
    description: params.entry.description,
    policyChecks: params.policyChecks,
    undoMetadata: params.undoMetadata,
    retentionPolicy: "default",
  });
}
Phase 4: Integration with Existing Store
File: src/store/index.ts
Update your root store to integrate the undo slice:
import { createUndoSlice, UndoSlice } from "./undo-slice";

export type StoreState =
  & CanvasSlice
  & WorkspaceSlice
  & DataSlice
  & ChatSlice
  & UndoSlice;  // Add this

export const useStore = create<StoreState>()(
  immer(
    persist(
      (...args) => ({
        ...createCanvasSlice(...args),
        ...createWorkspaceSlice(...args),
        ...createDataSlice(...args),
        ...createChatSlice(...args),
        ...createUndoSlice(...args),  // Add this
      }),
      {
        name: "agentic-canvas",
        partialize: (state) => ({
          // Persist canvas and workspace, NOT undo stack
          canvas: state.canvas,
          workspace: state.workspace,
          // Audit log persists itself separately
        }),
      }
    )
  )
);
File: src/store/canvas-slice.ts
Update canvas operations to go through the undo system:
// Before (direct mutation):
addComponent: (component) => {
  set((draft) => {
    draft.canvas.components.set(component.id, component);
  });
},

// After (through undo system):
addComponent: (component, source: CommandSource = { type: "user", trigger: "direct" }) => {
  const state = get();

  // Create undo entry
  state.pushUndo({
    source,
    description: `Add ${component.type}`,
    viewContext: {
      activeViewId: state.activeViewId,
      activeViewName: state.workspace.views.find(v => v.id === state.activeViewId)?.name ?? "Default",
      affectedViewIds: [state.activeViewId],
      wasViewSpecificOp: false,
    },
    commandType: "canvas",
    forward: { type: "component_add", component },
    inverse: { type: "component_remove", componentId: component.id, snapshot: component },
    visibility: "user",
  });

  // Apply the change
  set((draft) => {
    draft.canvas.components.set(component.id, component);
  });
},
Create a helper for executing commands:
// File: src/lib/undo/execute-command.ts

export function executeCanvasCommand(
  command: CanvasCommand,
  set: SetState,
  get: GetState
): void {
  switch (command.type) {
    case "component_add":
      set((draft) => {
        draft.canvas.components.set(command.component.id, command.component);
      });
      break;

    case "component_remove":
      set((draft) => {
        draft.canvas.components.delete(command.componentId);
      });
      break;

    case "component_move":
      set((draft) => {
        const layout = draft.canvas.layout.find(l => l.i === command.componentId);
        if (layout) {
          layout.x = command.to.x;
          layout.y = command.to.y;
        }
      });
      break;

    // ... implement all command types
  }
}
Then the undo/redo actions use this:
undo: () => {
  const state = get();
  const entry = state.undoStack[state.undoStack.length - 1];

  if (!entry || !entry.canUndo) {
    return null;
  }

  // Execute inverse command
  if (entry.commandType === "canvas") {
    executeCanvasCommand(entry.inverse as CanvasCommand, set, get);
  } else if (entry.commandType === "filesystem") {
    executeFilesystemCommand(entry.inverse as FilesystemCommand);
  } else {
    // Hybrid - execute both
    const hybrid = entry.inverse as HybridCommand;
    hybrid.canvas.forEach(cmd => executeCanvasCommand(cmd, set, get));
    hybrid.filesystem.forEach(cmd => executeFilesystemCommand(cmd));
  }

  // Move to redo stack
  set((draft) => {
    const popped = draft.undoStack.pop()!;
    draft.redoStack.push(popped);
  });

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

  return entry;
},
Phase 5: React Integration
File: src/hooks/useUndo.ts
import { useStore } from "@/store";
import { useShallow } from "zustand/react/shallow";
import { useCallback, useEffect } from "react";

export function useUndo() {
  const {
    undoStack,
    redoStack,
    undo,
    redo,
    canUndo,
    canRedo,
    getUndoDescription,
    getRedoDescription,
    startBatch,
    commitBatch,
    abortBatch,
  } = useStore(
    useShallow((state) => ({
      undoStack: state.undoStack,
      redoStack: state.redoStack,
      undo: state.undo,
      redo: state.redo,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      getUndoDescription: state.getUndoDescription,
      getRedoDescription: state.getRedoDescription,
      startBatch: state.startBatch,
      commitBatch: state.commitBatch,
      abortBatch: state.abortBatch,
    }))
  );

  return {
    // State
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    canUndo: canUndo(),
    canRedo: canRedo(),
    undoDescription: getUndoDescription(),
    redoDescription: getRedoDescription(),

    // Actions
    undo,
    redo,
    startBatch,
    commitBatch,
    abortBatch,
  };
}

// Keyboard shortcuts hook
export function useUndoKeyboardShortcuts() {
  const { undo, redo, canUndo, canRedo } = useUndo();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else {
          if (canUndo) undo();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);
}
File: src/components/UndoRedoControls.tsx
import { useUndo } from "@/hooks/useUndo";
import { Undo2, Redo2 } from "lucide-react";

export function UndoRedoControls() {
  const { canUndo, canRedo, undo, redo, undoDescription, redoDescription } = useUndo();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={undo}
        disabled={!canUndo}
        className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        title={undoDescription ? `Undo: ${undoDescription}` : "Nothing to undo"}
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        title={redoDescription ? `Redo: ${redoDescription}` : "Nothing to redo"}
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}
File: src/components/UndoHistoryPanel.tsx
Optional: A panel showing full undo history (useful for debugging and power users):
import { useStore } from "@/store";
import { formatDistanceToNow } from "date-fns";
import { User, Bot, Clock, Cog } from "lucide-react";

const sourceIcons = {
  user: User,
  assistant: Bot,
  background: Clock,
  system: Cog,
};

export function UndoHistoryPanel() {
  const undoStack = useStore((state) => state.undoStack);

  return (
    <div className="p-4 max-h-96 overflow-y-auto">
      <h3 className="font-medium mb-3">History</h3>
      <div className="space-y-2">
        {[...undoStack].reverse().map((entry, index) => {
          const Icon = sourceIcons[entry.source.type];
          return (
            <div
              key={entry.id}
              className={`flex items-start gap-2 p-2 rounded text-sm ${
                index === 0 ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
            >
              <Icon className="w-4 h-4 mt-0.5 text-gray-500" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{entry.description}</div>
                <div className="text-xs text-gray-500">
                  {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
                  {entry.batchSize && entry.batchSize > 1 && (
                    <span className="ml-2 text-blue-600">
                      ({entry.batchSize} operations)
                    </span>
                  )}
                </div>
              </div>
              {!entry.canUndo && (
                <span className="text-xs text-red-500" title={entry.undoBlockedReason}>
                  Locked
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
Phase 6: Tool Executor Integration
Update your AI tool executor to use batches:
File: src/lib/tool-executor.ts
export async function executeToolCall(
  toolCall: ToolCall,
  context: { threadId: string; messageId: string }
): Promise<ToolResult> {
  const store = useStore.getState();

  // Start a batch for this tool call
  const batchId = store.startBatch(
    {
      type: "assistant",
      threadId: context.threadId,
      messageId: context.messageId,
      toolCallId: toolCall.id,
    },
    `AI: ${toolCall.name}`
  );

  try {
    // Execute the tool - each operation adds to the batch
    const result = await executeToolByName(toolCall.name, toolCall.args);

    // Commit the batch on success
    store.commitBatch();

    return result;
  } catch (error) {
    // Abort batch on failure - no undo entry created
    store.abortBatch();
    throw error;
  }
}
Testing Checklist
1. [ ] Basic undo/redo for user operations (add, remove, move components)
2. [ ] Batch operations from AI tool calls undo as single unit
3. [ ] Keyboard shortcuts (Cmd+Z, Cmd+Shift+Z) work
4. [ ] Undo descriptions are human-readable
5. [ ] Source attribution is correct for all entry types
6. [ ] Audit log entries are created for all operations
7. [ ] Audit log chain integrity verification passes
8. [ ] Policy blocking works (test with a "block after X hours" policy)
9. [ ] Retention holds prevent undo
10. [ ] UndoHistoryPanel displays correctly
Files to Create/Modify
New files:
* src/lib/undo/types.ts
* src/lib/undo/policies.ts
* src/lib/undo/execute-command.ts
* src/lib/audit/audit-log.ts
* src/store/undo-slice.ts
* src/hooks/useUndo.ts
* src/components/UndoRedoControls.tsx
* src/components/UndoHistoryPanel.tsx
Modify:
* src/store/index.ts - Add undo slice
* src/store/canvas-slice.ts - Route through undo system
* src/lib/tool-executor.ts - Add batch support
* src/components/canvas/Canvas.tsx - Add UndoRedoControls and keyboard hook
Start with Phase 1-3, get basic undo/redo working, then add audit logging and policies incrementally.
```
