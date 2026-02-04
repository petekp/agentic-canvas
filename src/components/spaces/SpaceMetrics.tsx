"use client";

// SpaceMetrics - Displays metrics summary within a space card
// See: .claude/plans/spaces-navigation-v0.2.md

import type { Space } from "@/types";

interface SpaceMetricsProps {
  space: Space;
}

/**
 * Extract primary metric from space components.
 * Returns a human-readable summary like "5 open PRs" or "3 components".
 */
function extractPrimaryMetric(space: Space): string {
  const components = space.snapshot.components;

  if (components.length === 0) {
    return "Empty";
  }

  // Look for PR list component with loaded data
  const prList = components.find((c) => c.typeId === "github.pr-list");
  if (prList?.dataState.status === "ready" && prList.dataState.data) {
    const data = prList.dataState.data as { items?: { state?: string }[] };
    if (data.items) {
      const openCount = data.items.filter((pr) => pr.state === "open").length;
      if (openCount > 0) {
        return `${openCount} open PR${openCount > 1 ? "s" : ""}`;
      }
    }
  }

  // Look for issue grid with loaded data
  const issueGrid = components.find((c) => c.typeId === "github.issue-grid");
  if (issueGrid?.dataState.status === "ready" && issueGrid.dataState.data) {
    const data = issueGrid.dataState.data as { items?: { state?: string }[] };
    if (data.items) {
      const openCount = data.items.filter((issue) => issue.state === "open").length;
      if (openCount > 0) {
        return `${openCount} open issue${openCount > 1 ? "s" : ""}`;
      }
    }
  }

  // Default to component count
  return `${components.length} component${components.length > 1 ? "s" : ""}`;
}

export function SpaceMetrics({ space }: SpaceMetricsProps) {
  const primaryMetric = extractPrimaryMetric(space);

  return (
    <div className="text-sm text-muted-foreground">
      {primaryMetric}
    </div>
  );
}
