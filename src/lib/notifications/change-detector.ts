// Change Detection Engine - detects meaningful changes in data for notifications
// See: Polling + Notifications system plan

import type { ComponentInstance } from "@/types";
import type { Notification, NotificationPriority } from "@/store/notification-slice";

// ============================================================================
// Types
// ============================================================================

export interface DetectedChange {
  type: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  externalUrl?: string;
  externalId?: string;
  dedupeKey: string;
  actions?: Notification["actions"];
  expiresAt?: number;
}

export interface ChangeDetectorContext {
  previousData: unknown;
  currentData: unknown;
  component: ComponentInstance;
}

// ============================================================================
// GitHub Change Detectors
// ============================================================================

interface GitHubPRItem {
  number: number;
  state: string;
  title: string;
  merged?: boolean;
  reviewDecision?: string;
  html_url?: string;
}

interface GitHubIssueItem {
  number: number;
  state: string;
  title: string;
  assignees?: string[];
  html_url?: string;
}

interface ItemsData<T> {
  items?: T[];
}

export function detectGitHubPRChanges(ctx: ChangeDetectorContext): DetectedChange[] {
  const changes: DetectedChange[] = [];

  if (!ctx.previousData || !ctx.currentData) return changes;

  const prev = ctx.previousData as ItemsData<GitHubPRItem>;
  const curr = ctx.currentData as ItemsData<GitHubPRItem>;

  if (!prev.items || !curr.items) return changes;

  const prevMap = new Map(prev.items.map((p) => [p.number, p]));

  for (const pr of curr.items) {
    const prevPR = prevMap.get(pr.number);

    // New PR
    if (!prevPR) {
      changes.push({
        type: "pr_new",
        title: "New PR",
        message: `#${pr.number}: ${pr.title}`,
        priority: "medium",
        externalUrl: pr.html_url,
        externalId: String(pr.number),
        dedupeKey: `pr_new_${pr.number}`,
        actions: pr.html_url
          ? [
              { label: "View", action: { type: "open_url", url: pr.html_url }, variant: "primary" },
              { label: "Dismiss", action: { type: "dismiss" } },
            ]
          : undefined,
      });
      continue;
    }

    // PR merged
    if (!prevPR.merged && pr.merged) {
      changes.push({
        type: "pr_merged",
        title: "PR Merged! 🎉",
        message: `#${pr.number}: ${pr.title}`,
        priority: "high",
        externalUrl: pr.html_url,
        externalId: String(pr.number),
        dedupeKey: `pr_merged_${pr.number}`,
        actions: pr.html_url
          ? [
              { label: "View", action: { type: "open_url", url: pr.html_url } },
              { label: "Dismiss", action: { type: "dismiss" } },
            ]
          : undefined,
      });
    }

    // PR approved
    if (prevPR.reviewDecision !== "APPROVED" && pr.reviewDecision === "APPROVED") {
      changes.push({
        type: "pr_approved",
        title: "PR Approved ✓",
        message: `#${pr.number}: ${pr.title}`,
        priority: "high",
        externalUrl: pr.html_url,
        externalId: String(pr.number),
        dedupeKey: `pr_approved_${pr.number}`,
        actions: pr.html_url
          ? [
              { label: "Merge", action: { type: "open_url", url: pr.html_url }, variant: "primary" },
              { label: "View", action: { type: "open_url", url: pr.html_url } },
            ]
          : undefined,
      });
    }

    // Changes requested
    if (prevPR.reviewDecision !== "CHANGES_REQUESTED" && pr.reviewDecision === "CHANGES_REQUESTED") {
      changes.push({
        type: "pr_changes_requested",
        title: "Changes Requested",
        message: `#${pr.number}: ${pr.title}`,
        priority: "high",
        externalUrl: pr.html_url,
        externalId: String(pr.number),
        dedupeKey: `pr_changes_${pr.number}`,
        actions: pr.html_url
          ? [{ label: "View Feedback", action: { type: "open_url", url: pr.html_url }, variant: "primary" }]
          : undefined,
      });
    }
  }

  return changes;
}

export function detectGitHubIssueChanges(ctx: ChangeDetectorContext): DetectedChange[] {
  const changes: DetectedChange[] = [];

  if (!ctx.previousData || !ctx.currentData) return changes;

  const prev = ctx.previousData as ItemsData<GitHubIssueItem>;
  const curr = ctx.currentData as ItemsData<GitHubIssueItem>;

  if (!prev.items || !curr.items) return changes;

  const prevMap = new Map(prev.items.map((i) => [i.number, i]));

  for (const issue of curr.items) {
    const prevIssue = prevMap.get(issue.number);

    // New issue assigned to user
    if (!prevIssue) {
      changes.push({
        type: "issue_new",
        title: "New Issue",
        message: `#${issue.number}: ${issue.title}`,
        priority: "medium",
        externalUrl: issue.html_url,
        externalId: String(issue.number),
        dedupeKey: `issue_new_${issue.number}`,
        actions: issue.html_url
          ? [{ label: "View", action: { type: "open_url", url: issue.html_url }, variant: "primary" }]
          : undefined,
      });
    }

    // Issue closed
    if (prevIssue?.state === "open" && issue.state === "closed") {
      changes.push({
        type: "issue_closed",
        title: "Issue Closed",
        message: `#${issue.number}: ${issue.title}`,
        priority: "low",
        externalUrl: issue.html_url,
        externalId: String(issue.number),
        dedupeKey: `issue_closed_${issue.number}`,
      });
    }
  }

  return changes;
}

// ============================================================================
// PostHog Change Detectors
// ============================================================================

interface PostHogData {
  uniqueVisitors?: number;
  pageviews?: number;
}

export function detectPostHogChanges(ctx: ChangeDetectorContext): DetectedChange[] {
  const changes: DetectedChange[] = [];

  if (!ctx.previousData || !ctx.currentData) return changes;

  const prev = ctx.previousData as PostHogData;
  const curr = ctx.currentData as PostHogData;

  if (prev.uniqueVisitors && curr.uniqueVisitors) {
    const delta = curr.uniqueVisitors - prev.uniqueVisitors;
    const percentChange = (delta / prev.uniqueVisitors) * 100;
    // Use hourly window for deduplication
    const hourWindow = Math.floor(Date.now() / 3600000);

    // Traffic spike (>20% increase)
    if (percentChange > 20) {
      changes.push({
        type: "traffic_spike",
        title: "Traffic Spike! 📈",
        message: `Visitors up ${Math.round(percentChange)}% (${prev.uniqueVisitors} → ${curr.uniqueVisitors})`,
        priority: "medium",
        dedupeKey: `traffic_spike_${hourWindow}`,
        expiresAt: Date.now() + 3600000, // 1 hour
      });
    }

    // Traffic drop (>20% decrease)
    if (percentChange < -20) {
      changes.push({
        type: "traffic_drop",
        title: "Traffic Drop ⚠️",
        message: `Visitors down ${Math.abs(Math.round(percentChange))}% (${prev.uniqueVisitors} → ${curr.uniqueVisitors})`,
        priority: "high",
        dedupeKey: `traffic_drop_${hourWindow}`,
        expiresAt: Date.now() + 3600000, // 1 hour
        actions: [
          {
            label: "Investigate",
            action: { type: "send_chat", message: "Why did my traffic drop?" },
            variant: "primary",
          },
        ],
      });
    }
  }

  return changes;
}

// ============================================================================
// Main Detector
// ============================================================================

export function detectChanges(ctx: ChangeDetectorContext): DetectedChange[] {
  const { component } = ctx;

  switch (component.typeId) {
    case "github.pr-list":
      return detectGitHubPRChanges(ctx);
    case "github.issue-grid":
      return detectGitHubIssueChanges(ctx);
    case "posthog.site-health":
      return detectPostHogChanges(ctx);
    default:
      return [];
  }
}
