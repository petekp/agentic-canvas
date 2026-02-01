// policies.ts
//
// Policy engine for controlling undo behavior.
//
// WHY POLICIES: Enterprises need compliance controls over undo. Examples:
// - Legal hold: Prevent undoing changes during litigation discovery
// - Audit trail: Block undo after 24h so changes are "on the record"
// - Source control: Prevent users from undoing AI decisions (or vice versa)
// - Size limits: Flag batch operations affecting many files for review
//
// EVALUATION FLOW:
// 1. Check if policy is enabled and applies to this entry (scope matching)
// 2. Evaluate the rule against the entry (time-based, path-based, etc.)
// 3. If triggered, apply enforcement: block, flag, or log_only
//
// Policies are additive - multiple policies can apply to one entry.
// If ANY policy blocks, the operation is blocked.
//
// See: .claude/plans/undo-redo-system-v2.md

import type { EnhancedUndoEntry, PolicyCheckResult } from "./types";

// ============================================================================
// Policy Types
// ============================================================================

export interface UndoPolicy {
  id: string;
  name: string;
  enabled: boolean;

  // Scope - which operations this policy applies to
  scope: {
    users?: string[];
    teams?: string[];
    agentTypes?: string[];
    commandTypes?: ("canvas" | "filesystem" | "hybrid")[];
    sourceTypes?: ("user" | "assistant" | "background" | "system")[];
  };

  // Rule - what condition triggers the policy
  rule: UndoPolicyRule;

  // Enforcement - what happens when policy is triggered
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
  | { type: "retention_hold"; entryIds: string[] }
  | { type: "block_source_type"; sourceTypes: ("assistant" | "background" | "system")[] }
  | { type: "max_components_per_batch"; count: number };

export interface NotificationConfig {
  channels: ("console" | "callback")[];
  callback?: (violation: PolicyViolation) => void;
}

export interface PolicyViolation {
  policy: UndoPolicy;
  entry: EnhancedUndoEntry;
  timestamp: number;
  details: string;
}

export interface PolicyContext {
  currentTime: number;
  userId: string;
  teamId?: string;
}

// ============================================================================
// Policy Evaluation
// ============================================================================

/**
 * Evaluate all policies against an undo entry
 */
export function evaluatePolicies(
  entry: EnhancedUndoEntry,
  policies: UndoPolicy[],
  context: PolicyContext
): PolicyCheckResult[] {
  const results: PolicyCheckResult[] = [];

  for (const policy of policies) {
    if (!policy.enabled) continue;

    // Check if policy applies to this entry
    if (!policyAppliesToEntry(policy, entry, context)) continue;

    // Evaluate the rule
    const ruleResult = evaluateRule(policy.rule, entry, context);

    if (ruleResult.triggered) {
      results.push({
        policyId: policy.id,
        policyName: policy.name,
        result: policy.enforcement === "block" ? "blocked" : "flagged",
        details: ruleResult.reason,
      });

      // Notify if configured
      if (policy.notifyOnViolation) {
        notifyViolation(policy, entry, ruleResult.reason);
      }
    } else {
      results.push({
        policyId: policy.id,
        policyName: policy.name,
        result: "allowed",
      });
    }
  }

  return results;
}

/**
 * Check if an entry can be undone based on policies
 */
export function canUndoEntry(
  entry: EnhancedUndoEntry,
  policies: UndoPolicy[],
  context: PolicyContext
): { allowed: boolean; reason?: string } {
  // Check retention hold first
  if (entry.retentionHold) {
    if (entry.retentionHold.holdUntil > context.currentTime) {
      return {
        allowed: false,
        reason: `Retention hold: ${entry.retentionHold.reason} (until ${new Date(entry.retentionHold.holdUntil).toISOString()})`,
      };
    }
  }

  // Check if entry was explicitly marked as non-undoable
  if (!entry.canUndo) {
    return {
      allowed: false,
      reason: entry.undoBlockedReason ?? "Operation marked as non-undoable",
    };
  }

  // Evaluate policies
  const results = evaluatePolicies(entry, policies, context);
  const blocked = results.find((r) => r.result === "blocked");

  if (blocked) {
    return {
      allowed: false,
      reason: blocked.details ?? `Blocked by policy: ${blocked.policyName}`,
    };
  }

  return { allowed: true };
}

// ============================================================================
// Policy Matching
//
// Scope matching determines IF a policy should be evaluated for an entry.
// This is different from rule evaluation (whether the policy is triggered).
//
// Empty scope arrays mean "apply to all" - the most common case.
// Non-empty arrays are allowlists: policy only applies if entry matches.
// ============================================================================

function policyAppliesToEntry(
  policy: UndoPolicy,
  entry: EnhancedUndoEntry,
  context: PolicyContext
): boolean {
  const { scope } = policy;

  // Check user scope
  if (scope.users && scope.users.length > 0) {
    if (!scope.users.includes(context.userId)) return false;
  }

  // Check team scope
  if (scope.teams && scope.teams.length > 0) {
    if (!context.teamId || !scope.teams.includes(context.teamId)) return false;
  }

  // Check command type scope
  if (scope.commandTypes && scope.commandTypes.length > 0) {
    if (!scope.commandTypes.includes(entry.commandType)) return false;
  }

  // Check source type scope
  if (scope.sourceTypes && scope.sourceTypes.length > 0) {
    if (!scope.sourceTypes.includes(entry.source.type)) return false;
  }

  // Check agent type scope (only for background sources)
  if (scope.agentTypes && scope.agentTypes.length > 0) {
    if (entry.source.type !== "background") return false;
    if (!scope.agentTypes.includes(entry.source.agentType)) return false;
  }

  return true;
}

// ============================================================================
// Rule Evaluation
//
// Rules define WHEN a policy should trigger. Each rule type checks a different
// condition. Some rules (path_requires_approval, require_reason_for_undo) are
// UI-layer concerns and return not-triggered here - they're handled by prompts.
// ============================================================================

interface RuleResult {
  triggered: boolean;
  reason: string;
}

/**
 * Evaluates a single policy rule against an undo entry.
 *
 * Returns { triggered: true, reason: "..." } if the rule condition is met.
 * The reason is human-readable and shown to users when undo is blocked.
 */
function evaluateRule(
  rule: UndoPolicyRule,
  entry: EnhancedUndoEntry,
  context: PolicyContext
): RuleResult {
  switch (rule.type) {
    case "block_undo_after": {
      const hoursSinceEntry = (context.currentTime - entry.timestamp) / (1000 * 60 * 60);
      if (hoursSinceEntry > rule.hours) {
        return {
          triggered: true,
          reason: `Cannot undo after ${rule.hours} hours (entry is ${Math.round(hoursSinceEntry)} hours old)`,
        };
      }
      return { triggered: false, reason: "" };
    }

    case "retention_hold": {
      if (rule.entryIds.includes(entry.id)) {
        return {
          triggered: true,
          reason: "Entry is under retention hold",
        };
      }
      return { triggered: false, reason: "" };
    }

    case "block_source_type": {
      if (rule.sourceTypes.includes(entry.source.type as "assistant" | "background" | "system")) {
        return {
          triggered: true,
          reason: `Undo blocked for source type: ${entry.source.type}`,
        };
      }
      return { triggered: false, reason: "" };
    }

    case "path_forbidden": {
      if (entry.commandType !== "filesystem" && entry.commandType !== "hybrid") {
        return { triggered: false, reason: "" };
      }
      const paths = entry.filesystemImpact?.pathsAffected ?? [];
      for (const path of paths) {
        for (const pattern of rule.patterns) {
          if (pathMatchesPattern(path, pattern)) {
            return {
              triggered: true,
              reason: `Path "${path}" matches forbidden pattern "${pattern}"`,
            };
          }
        }
      }
      return { triggered: false, reason: "" };
    }

    case "max_files_per_batch": {
      const fileCount = entry.filesystemImpact?.pathsAffected.length ?? 0;
      if (fileCount > rule.count) {
        return {
          triggered: true,
          reason: `Batch affects ${fileCount} files (max: ${rule.count})`,
        };
      }
      return { triggered: false, reason: "" };
    }

    case "max_bytes_per_batch": {
      const bytesChanged = entry.filesystemImpact?.totalBytesChanged ?? 0;
      if (bytesChanged > rule.bytes) {
        return {
          triggered: true,
          reason: `Batch changes ${bytesChanged} bytes (max: ${rule.bytes})`,
        };
      }
      return { triggered: false, reason: "" };
    }

    case "max_components_per_batch": {
      const componentCount = entry.afterSnapshot.components.length - entry.beforeSnapshot.components.length;
      if (Math.abs(componentCount) > rule.count) {
        return {
          triggered: true,
          reason: `Batch affects ${Math.abs(componentCount)} components (max: ${rule.count})`,
        };
      }
      return { triggered: false, reason: "" };
    }

    case "require_reason_for_undo":
    case "path_requires_approval":
      // These are handled at the UI layer, not in automatic evaluation
      return { triggered: false, reason: "" };

    default:
      return { triggered: false, reason: "" };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function pathMatchesPattern(path: string, pattern: string): boolean {
  // Simple glob-like matching
  const regexPattern = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

function notifyViolation(policy: UndoPolicy, entry: EnhancedUndoEntry, details: string): void {
  const config = policy.notifyOnViolation;
  if (!config) return;

  const violation: PolicyViolation = {
    policy,
    entry,
    timestamp: Date.now(),
    details,
  };

  for (const channel of config.channels) {
    if (channel === "console") {
      console.warn(`[Undo Policy Violation] ${policy.name}: ${details}`);
    } else if (channel === "callback" && config.callback) {
      try {
        config.callback(violation);
      } catch (error) {
        console.error("Policy notification callback failed:", error);
      }
    }
  }
}

// ============================================================================
// Default Policies
// ============================================================================

export const defaultPolicies: UndoPolicy[] = [
  {
    id: "block-undo-after-24h",
    name: "Block undo after 24 hours",
    enabled: false, // Disabled by default
    scope: {},
    rule: { type: "block_undo_after", hours: 24 },
    enforcement: "block",
  },
  {
    id: "flag-large-batches",
    name: "Flag large batches",
    enabled: false,
    scope: { commandTypes: ["canvas"] },
    rule: { type: "max_components_per_batch", count: 10 },
    enforcement: "flag",
  },
];
