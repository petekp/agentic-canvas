// Undo System Types - Enhanced undo/redo with observability
// See: .claude/plans/undo-redo-system-v2.md

import { nanoid } from "nanoid";
import type {
  ComponentInstance,
  Position,
  Size,
  DataBinding,
  ViewId,
  View,
  CanvasSnapshot,
} from "@/types";

// ============================================================================
// Branded IDs for type safety
// ============================================================================

declare const UndoIdBrand: unique symbol;
declare const AuditIdBrand: unique symbol;
declare const BatchIdBrand: unique symbol;

export type UndoId = string & { readonly [UndoIdBrand]: never };
export type AuditId = string & { readonly [AuditIdBrand]: never };
export type BatchId = string & { readonly [BatchIdBrand]: never };

export function generateUndoId(): UndoId {
  return `undo_${nanoid(10)}` as UndoId;
}

export function generateAuditId(): AuditId {
  return `audit_${nanoid(10)}` as AuditId;
}

export function generateBatchId(): BatchId {
  return `batch_${nanoid(10)}` as BatchId;
}

// ============================================================================
// Command Sources - Who initiated the change
// ============================================================================

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
  agentType: string;
  taskId: string;
  taskName: string;
  triggeredBy: "schedule" | "event" | "condition" | "user_request";
  batchId?: BatchId;
}

export interface SystemCommandSource {
  type: "system";
  reason: "auto_save" | "migration" | "sync" | "restore" | "rehydrate";
  undoable: boolean;
}

// ============================================================================
// Canvas Commands - All possible mutations to canvas state
// ============================================================================

export type UndoCanvasCommand =
  | { type: "component_add"; component: ComponentInstance }
  | { type: "component_remove"; componentId: string; snapshot: ComponentInstance }
  | { type: "component_move"; componentId: string; from: Position; to: Position }
  | { type: "component_resize"; componentId: string; from: Size; to: Size }
  | {
      type: "component_update_config";
      componentId: string;
      from: Record<string, unknown>;
      to: Record<string, unknown>;
    }
  | {
      type: "component_update_binding";
      componentId: string;
      from: DataBinding | null;
      to: DataBinding | null;
    }
  | { type: "layout_bulk_update"; componentIds: string[]; changes: LayoutChange[] }
  | { type: "view_create"; viewId: string; viewName: string }
  | { type: "view_delete"; viewId: string; viewName: string }
  | { type: "view_rename"; viewId: string; from: string; to: string }
  | { type: "view_switch"; from: string | null; to: string }
  | { type: "view_pin"; viewId: string; viewName: string }
  | { type: "view_unpin"; viewId: string; viewName: string }
  | { type: "canvas_clear"; removedCount: number }
  | { type: "view_load"; viewId: string; viewName: string };

export interface LayoutChange {
  componentId: string;
  from: { position: Position; size: Size };
  to: { position: Position; size: Size };
}

// ============================================================================
// Filesystem Commands - For future agent filesystem access
// ============================================================================

export type FilesystemCommand =
  | { type: "file_create"; path: string; content: string }
  | {
      type: "file_modify";
      path: string;
      previousContent: string;
      newContent: string;
      previousHash: string;
      newHash: string;
    }
  | { type: "file_delete"; path: string; previousContent: string; previousHash: string }
  | { type: "file_move"; fromPath: string; toPath: string }
  | { type: "file_copy"; fromPath: string; toPath: string }
  | { type: "directory_create"; path: string }
  | { type: "directory_delete"; path: string; snapshot: DirectorySnapshot };

export interface DirectorySnapshot {
  path: string;
  files: Array<{ relativePath: string; content: string; hash: string }>;
}

// ============================================================================
// Hybrid Commands - Operations affecting both canvas and filesystem
// ============================================================================

export interface HybridCommand {
  canvas: UndoCanvasCommand[];
  filesystem: FilesystemCommand[];
}

// ============================================================================
// View Context - Which view was active when the change occurred
// ============================================================================

export interface UndoViewContext {
  activeViewId: ViewId | null;
  activeViewName: string;
  affectedViewIds: string[];
  wasViewSpecificOp: boolean;
}

// ============================================================================
// View State Snapshot - for undoing view-level operations
// ============================================================================

export interface ViewStateSnapshot {
  views: View[];
  activeViewId: ViewId | null;
  viewSnapshotHash: string | null;
  workspaceUpdatedAt: number;
}

// ============================================================================
// Retention Hold - For compliance/admin lockdown
// ============================================================================

export interface RetentionHold {
  reason: string;
  holdUntil: number;
  holdBy: string;
}

// ============================================================================
// Filesystem Impact Metadata
// ============================================================================

export interface FilesystemImpact {
  pathsAffected: string[];
  totalBytesChanged: number;
  containsSensitivePaths: boolean;
}

// ============================================================================
// Undo Entry - A single undoable operation in the stack
// ============================================================================

export interface EnhancedUndoEntry {
  // Identity
  id: UndoId;
  auditCorrelationId: AuditId;

  // Timing
  timestamp: number;

  // Attribution
  source: CommandSource;

  // Human-readable description
  description: string;

  // View context
  viewContext: UndoViewContext;

  // Snapshot-based restoration (keeping existing pattern)
  beforeSnapshot: CanvasSnapshot;
  afterSnapshot: CanvasSnapshot;

  // Optional view state snapshots (for undoing view operations)
  beforeViewState?: ViewStateSnapshot;
  afterViewState?: ViewStateSnapshot;

  // The semantic command (for audit/display purposes)
  commandType: "canvas" | "filesystem" | "hybrid";
  command: UndoCanvasCommand | FilesystemCommand | HybridCommand;

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
  filesystemImpact?: FilesystemImpact;
}

// ============================================================================
// Audit Log Types
// ============================================================================

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

export interface AuditLogEntry {
  // Immutable identity
  id: AuditId;
  hash: string;
  previousHash: string;

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

// ============================================================================
// Audit Query Parameters
// ============================================================================

export interface AuditQuery {
  from?: number;
  to?: number;
  userId?: string;
  sourceType?: Array<"user" | "assistant" | "background" | "system">;
  eventType?: AuditEventType[];
  scope?: Array<"canvas" | "filesystem" | "hybrid">;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Active Batch State
// ============================================================================

export interface ActiveBatch {
  id: BatchId;
  source: CommandSource;
  entries: EnhancedUndoEntry[];
  description: string;
  startedAt: number;
}

// ============================================================================
// Helper to create a simple user source
// ============================================================================

export function createUserSource(
  trigger: UserCommandSource["trigger"] = "direct"
): UserCommandSource {
  return { type: "user", trigger };
}

export function createAssistantSource(params: {
  messageId: string;
  toolCallId: string;
  threadId?: string;
  batchId?: BatchId;
  model?: string;
}): AssistantCommandSource {
  return { type: "assistant", ...params };
}

export function createSystemSource(
  reason: SystemCommandSource["reason"],
  undoable = false
): SystemCommandSource {
  return { type: "system", reason, undoable };
}
