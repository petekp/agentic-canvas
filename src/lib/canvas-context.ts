// Canvas Context - serializes canvas state for AI awareness
// Provides the AI with a snapshot of what's on the canvas

import type {
  Canvas,
  ComponentInstance,
  CanvasContext,
  ComponentSummary,
  TemporalContext,
  WorkspaceContext,
  ContextBudget,
  DayOfWeek,
  TimeOfDay,
  GridConfig,
} from "@/types";
import type { EnhancedUndoEntry } from "@/lib/undo/types";

// ============================================================================
// Recent Changes Types
// ============================================================================

export interface RecentChange {
  description: string;
  source: "user" | "assistant" | "background" | "system";
  timeAgo: string;
}

// Position quadrant for spatial awareness
export type PositionQuadrant =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a timestamp into a human-readable "time ago" string
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * Determines the position quadrant of a component on the grid
 */
export function getPositionQuadrant(
  col: number,
  row: number,
  gridCols: number,
  gridRows: number
): PositionQuadrant {
  const midCol = gridCols / 2;
  const midRow = gridRows / 2;

  // Define center zone (middle third of the grid)
  const centerColStart = gridCols / 3;
  const centerColEnd = (gridCols * 2) / 3;
  const centerRowStart = gridRows / 3;
  const centerRowEnd = (gridRows * 2) / 3;

  // Check if in center zone
  if (
    col >= centerColStart &&
    col < centerColEnd &&
    row >= centerRowStart &&
    row < centerRowEnd
  ) {
    return "center";
  }

  // Determine quadrant
  const isLeft = col < midCol;
  const isTop = row < midRow;

  if (isTop && isLeft) return "top-left";
  if (isTop && !isLeft) return "top-right";
  if (!isTop && isLeft) return "bottom-left";
  return "bottom-right";
}

/**
 * Formats undo history entries into recent changes for AI context
 */
export function formatRecentChanges(
  undoHistory: EnhancedUndoEntry[],
  limit = 5
): RecentChange[] {
  return undoHistory.slice(0, limit).map((entry) => ({
    description: entry.description,
    source: entry.source.type,
    timeAgo: formatTimeAgo(entry.timestamp),
  }));
}

// ============================================================================
// Component Type Metadata
// ============================================================================

// Component type metadata for AI context
const TYPE_METADATA: Record<string, { name: string; category: "data" | "metric" | "timeline" | "utility" }> = {
  // GitHub components
  "github.stat-tile": { name: "Stat Tile", category: "metric" },
  "github.pr-list": { name: "PR List", category: "data" },
  "github.issue-grid": { name: "Issue Grid", category: "data" },
  "github.activity-timeline": { name: "Activity Timeline", category: "timeline" },
  "github.my-activity": { name: "My Activity", category: "timeline" },
  // PostHog components
  "posthog.site-health": { name: "Site Health", category: "metric" },
  "posthog.property-breakdown": { name: "Property Breakdown", category: "data" },
  "posthog.top-pages": { name: "Top Pages", category: "data" },
};

/**
 * Creates a summary of a component for AI context
 * Optionally includes position quadrant if grid dimensions are provided
 */
function summarizeComponent(
  component: ComponentInstance,
  gridCols?: number,
  gridRows?: number
): ComponentSummary {
  const typeMeta = TYPE_METADATA[component.typeId] ?? { name: component.typeId, category: "utility" as const };

  // Build summary based on component state
  let positionDesc = `at column ${component.position.col}, row ${component.position.row}`;

  // Add quadrant context if grid dimensions provided
  if (gridCols && gridRows) {
    const quadrant = getPositionQuadrant(
      component.position.col,
      component.position.row,
      gridCols,
      gridRows
    );
    positionDesc = `in the ${quadrant} (col ${component.position.col}, row ${component.position.row})`;
  }

  // Include label for natural language reference
  const labelPart = component.meta?.label ? ` "${component.meta.label}"` : "";
  let summary = `${typeMeta.name}${labelPart} ${positionDesc}`;
  const highlights: string[] = [];

  if (component.dataState.status === "ready" && component.dataState.data) {
    const data = component.dataState.data as Record<string, unknown>;

    if (component.typeId === "github.stat-tile" && data.value !== undefined) {
      summary = `${typeMeta.name} showing "${data.title ?? "metric"}" with value ${data.value}`;
      if (data.trend) highlights.push(`Trend: ${data.trend}`);
    } else if (component.typeId === "github.pr-list" && Array.isArray(data.items)) {
      summary = `${typeMeta.name} showing ${data.items.length} pull requests`;
      const openCount = data.items.filter((pr: { state?: string }) => pr.state === "open").length;
      if (openCount > 0) highlights.push(`${openCount} open PRs`);
    } else if (component.typeId === "github.issue-grid" && Array.isArray(data.items)) {
      summary = `${typeMeta.name} showing ${data.items.length} issues`;
      const openCount = data.items.filter((issue: { state?: string }) => issue.state === "open").length;
      if (openCount > 0) highlights.push(`${openCount} open issues`);
    } else if (component.typeId === "github.activity-timeline" && Array.isArray(data.items)) {
      summary = `${typeMeta.name} showing ${data.items.length} recent activities`;
    } else if (component.typeId === "github.my-activity" && data.stats) {
      const stats = data.stats as { commits?: number; prsOpened?: number; reviews?: number };
      summary = `${typeMeta.name} showing user's contributions`;
      if (stats.commits) highlights.push(`${stats.commits} commits`);
      if (stats.prsOpened) highlights.push(`${stats.prsOpened} PRs opened`);
      if (stats.reviews) highlights.push(`${stats.reviews} reviews`);
    } else if (component.typeId === "posthog.site-health" && data.uniqueVisitors !== undefined) {
      summary = `${typeMeta.name} showing ${data.uniqueVisitors} visitors, ${data.pageviews} pageviews`;
    } else if (component.typeId === "posthog.property-breakdown" && data.properties) {
      const props = data.properties as Array<{ name: string }>;
      summary = `${typeMeta.name} showing ${props.length} properties`;
      if (props[0]) highlights.push(`Top: ${props[0].name}`);
    } else if (component.typeId === "posthog.top-pages" && data.pages) {
      const pages = data.pages as Array<{ path: string }>;
      summary = `${typeMeta.name} showing ${pages.length} top pages`;
    }
  } else if (component.dataState.status === "loading") {
    summary += " (loading data...)";
  } else if (component.dataState.status === "error") {
    summary += " (error loading data)";
  }

  // Add pinned status
  if (component.meta.pinned) {
    highlights.push("Pinned");
  }

  return {
    id: component.id,
    typeId: component.typeId,
    typeName: typeMeta.name,
    category: typeMeta.category,
    position: component.position,
    size: component.size,
    summary,
    highlights,
    actions: ["move", "resize", "refresh", "remove"],
    stateStatus: component.dataState.status,
  };
}

/**
 * Determines the day of week
 */
function getDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[date.getDay()];
}

/**
 * Determines the time of day
 */
function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour < 6) return "night";
  if (hour < 9) return "early_morning";
  if (hour < 12) return "morning";
  if (hour < 14) return "mid_day";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

/**
 * Checks if current time is within work hours (9am-5pm, Mon-Fri)
 */
function isWorkHours(date: Date): boolean {
  const hour = date.getHours();
  const day = date.getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

/**
 * Creates temporal context
 */
function createTemporalContext(): TemporalContext {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dayOfWeek: getDayOfWeek(now),
    timeOfDay: getTimeOfDay(now),
    isWorkHours: isWorkHours(now),
  };
}

/**
 * Calculates grid utilization percentage
 */
function calculateGridUtilization(canvas: Canvas): number {
  const totalCells = canvas.grid.columns * canvas.grid.rows;
  let usedCells = 0;

  for (const component of canvas.components) {
    usedCells += component.size.cols * component.size.rows;
  }

  return Math.min(1, usedCells / totalCells);
}

// Options for workspace context creation
export interface WorkspaceContextOptions {
  activeViewId?: string | null;
  activeViewName?: string;
}

/**
 * Creates workspace context with optional view information
 */
function createWorkspaceContext(
  canvas: Canvas,
  options?: WorkspaceContextOptions
): WorkspaceContext {
  return {
    id: "default",
    name: options?.activeViewName ?? "Default Workspace",
    activeViewId: options?.activeViewId ?? null,
    savedViews: [], // Views are managed by workspace slice
    componentCount: canvas.components.length,
    gridUtilization: calculateGridUtilization(canvas),
  };
}

/**
 * Creates context budget information
 */
function createContextBudget(componentCount: number): ContextBudget {
  return {
    maxTokens: 4000,
    usedTokens: componentCount * 100, // Rough estimate
    maxComponents: 20,
    summarizationLevel: componentCount > 10 ? "condensed" : "full",
  };
}

/**
 * Serializes canvas state for AI context
 * This is the main export that provides AI with canvas awareness
 */
export function serializeCanvasContext(
  canvas: Canvas,
  options?: WorkspaceContextOptions
): CanvasContext {
  const { columns, rows } = canvas.grid;

  return {
    components: canvas.components.map((c) => summarizeComponent(c, columns, rows)),
    temporal: createTemporalContext(),
    workspace: createWorkspaceContext(canvas, options),
    budget: createContextBudget(canvas.components.length),
  };
}

/**
 * Extract detailed data entries from a component for AI context
 */
function extractDataDetails(component: ComponentInstance): string[] {
  if (component.dataState.status !== "ready" || !component.dataState.data) {
    return [];
  }

  const data = component.dataState.data as Record<string, unknown>;
  const details: string[] = [];

  // GitHub components
  if (component.typeId === "github.pr-list" && Array.isArray(data.items)) {
    const prs = data.items as Array<{ title?: string; number?: number; state?: string; author?: string }>;
    for (const pr of prs.slice(0, 5)) {
      details.push(`  - PR #${pr.number}: "${pr.title}" (${pr.state}, by ${pr.author ?? "unknown"})`);
    }
    if (prs.length > 5) details.push(`  ... and ${prs.length - 5} more`);
  } else if (component.typeId === "github.issue-grid" && Array.isArray(data.items)) {
    const issues = data.items as Array<{ title?: string; number?: number; state?: string; labels?: string[] }>;
    for (const issue of issues.slice(0, 5)) {
      const labels = issue.labels?.join(", ") ?? "";
      details.push(`  - Issue #${issue.number}: "${issue.title}" (${issue.state}${labels ? `, ${labels}` : ""})`);
    }
    if (issues.length > 5) details.push(`  ... and ${issues.length - 5} more`);
  } else if (component.typeId === "github.activity-timeline" && Array.isArray(data.items)) {
    const activities = data.items as Array<{ type?: string; description?: string; timestamp?: string }>;
    for (const activity of activities.slice(0, 5)) {
      details.push(`  - ${activity.type}: ${activity.description}`);
    }
    if (activities.length > 5) details.push(`  ... and ${activities.length - 5} more`);
  } else if (component.typeId === "github.my-activity" && data.stats) {
    const stats = data.stats as { commits?: number; prsOpened?: number; reviews?: number };
    const feed = data.recentActivity as Array<{ type?: string; description?: string }> | undefined;
    if (stats.commits) details.push(`  - ${stats.commits} commits`);
    if (stats.prsOpened) details.push(`  - ${stats.prsOpened} PRs opened`);
    if (stats.reviews) details.push(`  - ${stats.reviews} reviews`);
    if (feed) {
      for (const item of feed.slice(0, 3)) {
        details.push(`  - ${item.type}: ${item.description}`);
      }
    }
  }
  // PostHog components
  else if (component.typeId === "posthog.site-health") {
    details.push(`  - Unique visitors: ${data.uniqueVisitors}`);
    details.push(`  - Total pageviews: ${data.pageviews}`);
    if (data.newVisitorRatio !== undefined) {
      details.push(`  - New visitor ratio: ${Math.round((data.newVisitorRatio as number) * 100)}%`);
    }
    const daily = data.daily as Array<{ date: string; visitors: number; pageviews: number }> | undefined;
    if (daily && daily.length > 0) {
      const recent = daily.slice(-3);
      details.push(`  - Recent trend: ${recent.map((d) => `${d.visitors} visitors`).join(" → ")}`);
    }
  } else if (component.typeId === "posthog.property-breakdown" && data.properties) {
    const props = data.properties as Array<{ name: string; value: number; percentage: number }>;
    for (const prop of props.slice(0, 5)) {
      details.push(`  - ${prop.name}: ${prop.value} (${Math.round(prop.percentage * 100)}%)`);
    }
    if (props.length > 5) details.push(`  ... and ${props.length - 5} more`);
  } else if (component.typeId === "posthog.top-pages" && data.pages) {
    const pages = data.pages as Array<{ property: string; path: string; views: number }>;
    for (const page of pages.slice(0, 5)) {
      details.push(`  - ${page.property}${page.path}: ${page.views} views`);
    }
    if (pages.length > 5) details.push(`  ... and ${pages.length - 5} more`);
  }

  return details;
}

/**
 * Creates a concise text description of the canvas for system prompt
 */
export function describeCanvas(canvas: Canvas): string {
  if (canvas.components.length === 0) {
    return "The canvas is empty.";
  }

  const { columns, rows } = canvas.grid;
  const lines: string[] = [
    `Canvas has ${canvas.components.length} component(s) on a ${columns}x${rows} grid:`,
  ];

  for (const component of canvas.components) {
    const summary = summarizeComponent(component, columns, rows);
    const label = component.meta?.label;
    lines.push(`- [${component.id}]${label ? ` "${label}"` : ""}: ${summary.summary}`);
    if (summary.highlights.length > 0) {
      lines.push(`  Highlights: ${summary.highlights.join(", ")}`);
    }
    // Add detailed data entries
    const dataDetails = extractDataDetails(component);
    if (dataDetails.length > 0) {
      lines.push(`  Data:`);
      lines.push(...dataDetails);
    }
  }

  return lines.join("\n");
}

/**
 * Returns available component types for AI tools
 */
export function getAvailableComponentTypes(): { typeId: string; name: string; description: string }[] {
  return [
    {
      typeId: "github.stat-tile",
      name: "Stat Tile",
      description: "Displays a single metric with optional trend indicator (2x2 default)",
    },
    {
      typeId: "github.pr-list",
      name: "PR List",
      description: "Shows a list of pull requests with status indicators (4x3 default)",
    },
    {
      typeId: "github.issue-grid",
      name: "Issue Grid",
      description: "Displays issues in a grid format with labels (4x3 default)",
    },
    {
      typeId: "github.activity-timeline",
      name: "Activity Timeline",
      description: "Shows recent repository activity (3x4 default)",
    },
    {
      typeId: "github.my-activity",
      name: "My Activity",
      description: "Shows your personal contribution summary with stats, sparkline, and activity feed (4x5 default). Requires GitHub token.",
    },
    // PostHog Analytics
    {
      typeId: "posthog.site-health",
      name: "Site Health",
      description: "Overview metrics: visitors, pageviews, daily trend sparkline (4x3 default). Requires PostHog API key.",
    },
    {
      typeId: "posthog.property-breakdown",
      name: "Property Breakdown",
      description: "Bar chart showing visitors or pageviews by property/domain (4x3 default). Requires PostHog API key.",
    },
    {
      typeId: "posthog.top-pages",
      name: "Top Pages",
      description: "Ranked list of most visited pages across all properties (4x4 default). Requires PostHog API key.",
    },
  ];
}

/**
 * Returns grid constraints for AI tools
 */
export function getGridConstraints(grid: GridConfig): { maxCol: number; maxRow: number } {
  return {
    maxCol: grid.columns - 1, // 0-indexed
    maxRow: grid.rows - 1,
  };
}
