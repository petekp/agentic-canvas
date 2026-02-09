// Audit Log - Immutable record for compliance and observability
// See: .claude/plans/undo-redo-system-v2.md

import {
  AuditId,
  AuditLogEntry,
  AuditEventType,
  AuditQuery,
  EnhancedUndoEntry,
  PolicyCheckResult,
  CommandSource,
  generateAuditId,
  CanvasChangeRecord,
} from "../undo/types";
import { detectChanges } from "../undo/execute-command";
import { trackClientTelemetry } from "@/lib/telemetry-client";

// ============================================================================
// Hash Utilities (using Web Crypto API for browser compatibility)
// ============================================================================

// Synchronous hash for immediate use (less secure but fast)
function hashContentSync(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ============================================================================
// Audit Log Class
// ============================================================================

export class AuditLog {
  private entries: AuditLogEntry[] = [];
  private lastHash: string = "genesis";
  private subscribers: Set<(entry: AuditLogEntry) => void> = new Set();
  private initialized: boolean = false;
  private _storageKey = "agentic-canvas-audit-log";
  private indexKey = "agentic-canvas-audit-index";

  constructor() {
    // Defer initialization to avoid SSR issues
    if (typeof window !== "undefined") {
      this.loadFromStorage();
    }
  }

  private loadFromStorage(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const indexJson = localStorage.getItem(this.indexKey);
      if (indexJson) {
        const entryIds: string[] = JSON.parse(indexJson);
        for (const id of entryIds) {
          const entryJson = localStorage.getItem(`audit_log_${id}`);
          if (entryJson) {
            const entry = JSON.parse(entryJson) as AuditLogEntry;
            this.entries.push(entry);
            this.lastHash = entry.hash;
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load audit log from storage:", error);
      void trackClientTelemetry({
        source: "store.audit",
        event: "load_error",
        level: "warn",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  /**
   * Append a new entry to the audit log
   */
  append(
    entry: Omit<AuditLogEntry, "id" | "hash" | "previousHash">
  ): AuditLogEntry {
    const id = generateAuditId();
    const previousHash = this.lastHash;
    const contentToHash = JSON.stringify({ ...entry, id, previousHash });
    const hash = hashContentSync(contentToHash);

    const fullEntry: AuditLogEntry = {
      ...entry,
      id,
      hash,
      previousHash,
    };

    this.entries.push(fullEntry);
    this.lastHash = hash;

    // Notify subscribers
    this.subscribers.forEach((cb) => cb(fullEntry));

    // Persist
    this.persist(fullEntry);

    void trackClientTelemetry({
      source: "store.audit",
      event: "append",
      data: {
        id,
        eventType: fullEntry.eventType,
        sourceType: fullEntry.sourceType,
        scope: fullEntry.scope,
        description: fullEntry.description,
        policyCheckCount: fullEntry.policyChecks?.length ?? 0,
        hasCanvasChanges: Boolean(fullEntry.canvasChanges?.length),
      },
    });

    return fullEntry;
  }

  /**
   * Query audit log entries
   */
  query(params: AuditQuery): AuditLogEntry[] {
    let results = this.entries.filter((entry) => {
      if (params.from && entry.timestamp < params.from) return false;
      if (params.to && entry.timestamp > params.to) return false;
      if (params.userId && entry.userId !== params.userId) return false;
      if (params.sourceType && !params.sourceType.includes(entry.sourceType)) return false;
      if (params.eventType && !params.eventType.includes(entry.eventType)) return false;
      if (params.scope && !params.scope.includes(entry.scope)) return false;
      return true;
    });

    // Apply pagination
    if (params.offset) {
      results = results.slice(params.offset);
    }
    if (params.limit) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  /**
   * Get all entries (for debugging/admin)
   */
  getAll(): AuditLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get entry count
   */
  get length(): number {
    return this.entries.length;
  }

  /**
   * Verify the integrity of the audit log chain
   */
  verifyIntegrity(): { valid: boolean; brokenAt?: number } {
    let expectedPreviousHash = "genesis";

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      if (entry.previousHash !== expectedPreviousHash) {
        return { valid: false, brokenAt: i };
      }

      // Verify hash
      const { hash, ...rest } = entry;
      const computedHash = hashContentSync(
        JSON.stringify({ ...rest, previousHash: entry.previousHash })
      );

      if (computedHash !== hash) {
        return { valid: false, brokenAt: i };
      }

      expectedPreviousHash = hash;
    }

    return { valid: true };
  }

  /**
   * Subscribe to new entries
   */
  subscribe(callback: (entry: AuditLogEntry) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Export audit log for compliance
   */
  export(format: "json" | "csv", query?: AuditQuery): string {
    const entries = query ? this.query(query) : this.entries;

    if (format === "json") {
      return JSON.stringify(entries, null, 2);
    }

    // CSV export
    const headers = [
      "timestamp",
      "id",
      "userId",
      "sourceType",
      "eventType",
      "scope",
      "description",
    ];
    const rows = entries.map((e) =>
      headers
        .map((h) => {
          const value = e[h as keyof AuditLogEntry];
          return JSON.stringify(value ?? "");
        })
        .join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  /**
   * Clear the audit log (admin only, for testing)
   */
  clear(): void {
    // Remove from storage
    for (const entry of this.entries) {
      localStorage.removeItem(`audit_log_${entry.id}`);
    }
    localStorage.removeItem(this.indexKey);

    this.entries = [];
    this.lastHash = "genesis";
  }

  private persist(entry: AuditLogEntry): void {
    if (typeof window === "undefined") return;

    try {
      // Store entry
      localStorage.setItem(`audit_log_${entry.id}`, JSON.stringify(entry));

      // Update index
      const index = JSON.parse(localStorage.getItem(this.indexKey) || "[]");
      index.push(entry.id);
      localStorage.setItem(this.indexKey, JSON.stringify(index));
    } catch (error) {
      // localStorage might be full or unavailable
      console.warn("Failed to persist audit log entry:", error);
      void trackClientTelemetry({
        source: "store.audit",
        event: "persist_error",
        level: "warn",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const auditLog = new AuditLog();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current user ID (placeholder - implement based on your auth system)
 */
function getCurrentUserId(): string {
  // In a real app, this would come from your auth system
  if (typeof window !== "undefined") {
    return localStorage.getItem("userId") ?? "anonymous";
  }
  return "anonymous";
}

/**
 * Emit an entry to the audit log from the undo system
 */
export function emitToAuditLog(params: {
  id: AuditId;
  eventType: AuditEventType;
  entry: EnhancedUndoEntry;
  policyChecks: PolicyCheckResult[];
  undoMetadata?: AuditLogEntry["undoMetadata"];
}): void {
  const { entry, eventType, policyChecks, undoMetadata } = params;

  // Detect canvas changes for the record
  const changes = detectChanges(entry.beforeSnapshot, entry.afterSnapshot);
  const canvasChanges: CanvasChangeRecord[] = [
    ...changes.added.map((c) => ({
      componentId: c.id,
      componentType: c.typeId,
      changeType: "add" as const,
    })),
    ...changes.removed.map((c) => ({
      componentId: c.id,
      componentType: c.typeId,
      changeType: "remove" as const,
    })),
    ...changes.modified.map((c) => ({
      componentId: c.after.id,
      componentType: c.after.typeId,
      changeType: "modify" as const,
    })),
  ];

  auditLog.append({
    timestamp: Date.now(),
    userId: getCurrentUserId(),
    sourceType: entry.source.type,
    agentId: entry.source.type === "background" ? entry.source.agentId : undefined,
    agentType: entry.source.type === "background" ? entry.source.agentType : undefined,
    taskId: entry.source.type === "background" ? entry.source.taskId : undefined,
    eventType,
    scope: entry.commandType,
    description: entry.description,
    canvasChanges: canvasChanges.length > 0 ? canvasChanges : undefined,
    policyChecks,
    undoMetadata,
    retentionPolicy: "default",
  });
}

/**
 * Emit a batch event to the audit log
 */
export function emitBatchEvent(params: {
  eventType: "batch_started" | "batch_completed" | "batch_failed";
  batchId: string;
  description: string;
  source: CommandSource;
  entryCount?: number;
  error?: string;
}): void {
  auditLog.append({
    timestamp: Date.now(),
    userId: getCurrentUserId(),
    sourceType: params.source.type,
    agentId: params.source.type === "background" ? params.source.agentId : undefined,
    eventType: params.eventType,
    scope: "canvas",
    description: `${params.description} (${params.entryCount ?? 0} operations)`,
    policyChecks: [],
    retentionPolicy: "default",
  });
}
