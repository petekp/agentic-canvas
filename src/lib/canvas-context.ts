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
 */
function summarizeComponent(component: ComponentInstance): ComponentSummary {
  const typeMeta = TYPE_METADATA[component.typeId] ?? { name: component.typeId, category: "utility" as const };

  // Build summary based on component state
  let summary = `${typeMeta.name} at column ${component.position.col}, row ${component.position.row}`;
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

/**
 * Creates workspace context (simplified for v0.1)
 */
function createWorkspaceContext(canvas: Canvas): WorkspaceContext {
  return {
    id: "default",
    name: "Default Workspace",
    activeViewId: null,
    savedViews: [],
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
export function serializeCanvasContext(canvas: Canvas): CanvasContext {
  return {
    components: canvas.components.map(summarizeComponent),
    temporal: createTemporalContext(),
    workspace: createWorkspaceContext(canvas),
    budget: createContextBudget(canvas.components.length),
  };
}

/**
 * Creates a concise text description of the canvas for system prompt
 */
export function describeCanvas(canvas: Canvas): string {
  if (canvas.components.length === 0) {
    return "The canvas is empty.";
  }

  const lines: string[] = [
    `Canvas has ${canvas.components.length} component(s) on a ${canvas.grid.columns}x${canvas.grid.rows} grid:`,
  ];

  for (const component of canvas.components) {
    const summary = summarizeComponent(component);
    lines.push(`- [${component.id}] ${summary.summary}`);
    if (summary.highlights.length > 0) {
      lines.push(`  Highlights: ${summary.highlights.join(", ")}`);
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
