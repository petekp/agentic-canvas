// ai-tools.ts
//
// Defines AI tools and generates the system prompt for canvas manipulation.
//
// TOOL NAMING: snake_case per LLM convention
// LLMs are trained on APIs that use snake_case (Python, REST). Using camelCase
// for tool names leads to inconsistent invocations. We convert at the boundary.
//
// SCHEMA DESIGN:
// Zod schemas serve dual purpose: runtime validation and type inference.
// The .meta({ description }) annotations generate OpenAI-compatible tool specs.
// Optional fields have sensible defaults - the AI doesn't need to specify position
// and size for every component add.
//
// SYSTEM PROMPT:
// The prompt is dynamically generated based on current canvas state. This gives
// the AI awareness of:
// - What components exist and their data
// - Grid constraints (so it doesn't place components out of bounds)
// - Available views and recent activity
// - Component type capabilities and required configurations

import { z } from "zod";
import { getAvailableComponentTypes, describeCanvas, type RecentChange } from "./canvas-context";
import type { Canvas, View } from "@/types";

// ============================================================================
// System Prompt Context
// ============================================================================

export interface SystemPromptContext {
  canvas: Canvas;
  activeViewName?: string | null;
  recentChanges?: RecentChange[];
  views?: View[];
}

// Tool parameter schemas (using snake_case per project convention)

const positionSchema = z.object({
  col: z.number().int().min(0).meta({ description: "Column position (0-indexed from left)" }),
  row: z.number().int().min(0).meta({ description: "Row position (0-indexed from top)" }),
});

const sizeSchema = z.object({
  cols: z.number().int().min(1).max(12).meta({ description: "Width in grid columns (1-12)" }),
  rows: z.number().int().min(1).max(8).meta({ description: "Height in grid rows (1-8)" }),
});

// Tool schemas - used both for validation and type inference
export const addComponentSchema = z.object({
  type_id: z.string().meta({ description: "Component type ID (e.g., 'github.stat-tile', 'github.pr-list')" }),
  config: z.record(z.string(), z.unknown()).optional().meta({ description: "Component configuration (varies by type)" }),
  position: positionSchema.optional().meta({ description: "Grid position. If omitted, auto-placed." }),
  size: sizeSchema.optional().meta({ description: "Grid size. If omitted, uses type default." }),
  label: z.string().optional().meta({ description: "Optional label for the component" }),
});

export const removeComponentSchema = z.object({
  component_id: z.string().meta({ description: "The ID of the component to remove" }),
});

export const moveComponentSchema = z.object({
  component_id: z.string().meta({ description: "The ID of the component to move" }),
  position: positionSchema.meta({ description: "New grid position" }),
});

export const resizeComponentSchema = z.object({
  component_id: z.string().meta({ description: "The ID of the component to resize" }),
  size: sizeSchema.meta({ description: "New size in grid units" }),
});

export const updateComponentSchema = z.object({
  component_id: z.string().meta({ description: "The ID of the component to update" }),
  config: z.record(z.string(), z.unknown()).optional().meta({ description: "New configuration values to merge" }),
  label: z.string().optional().meta({ description: "New label for the component" }),
  pinned: z.boolean().optional().meta({ description: "Whether to pin/unpin the component" }),
});

export const clearCanvasSchema = z.object({
  preserve_pinned: z.boolean().default(true).meta({ description: "If true, keep pinned components" }),
});

// Tool definitions for streamText (inputSchema format)
export function getToolDefinitions() {
  const componentTypes = getAvailableComponentTypes();
  const typeDescriptions = componentTypes
    .map((t) => `"${t.typeId}" (${t.description})`)
    .join(", ");

  return {
    add_component: {
      description: `Add a new component to the canvas. Available types: ${typeDescriptions}. Position and size are optional - the system will auto-place if not specified.`,
      inputSchema: addComponentSchema,
    },
    remove_component: {
      description: "Remove a component from the canvas by its ID.",
      inputSchema: removeComponentSchema,
    },
    move_component: {
      description: "Move a component to a new position on the grid.",
      inputSchema: moveComponentSchema,
    },
    resize_component: {
      description: "Resize a component on the grid.",
      inputSchema: resizeComponentSchema,
    },
    update_component: {
      description: "Update a component's configuration or label.",
      inputSchema: updateComponentSchema,
    },
    clear_canvas: {
      description: "Clear all components from the canvas. Use preserve_pinned to keep pinned components.",
      inputSchema: clearCanvasSchema,
    },
  };
}

// Type exports for tool parameters
export type AddComponentParams = z.infer<typeof addComponentSchema>;
export type RemoveComponentParams = z.infer<typeof removeComponentSchema>;
export type MoveComponentParams = z.infer<typeof moveComponentSchema>;
export type ResizeComponentParams = z.infer<typeof resizeComponentSchema>;
export type UpdateComponentParams = z.infer<typeof updateComponentSchema>;
export type ClearCanvasParams = z.infer<typeof clearCanvasSchema>;

// Format recent changes for system prompt
function formatRecentChangesForPrompt(changes: RecentChange[]): string {
  if (changes.length === 0) {
    return "No recent activity.";
  }

  return changes
    .map((change) => {
      const sourceLabel =
        change.source === "assistant"
          ? "AI"
          : change.source === "user"
            ? "You"
            : change.source;
      return `- ${change.description} (${sourceLabel}, ${change.timeAgo})`;
    })
    .join("\n");
}

// Format views for system prompt
function formatViewsForPrompt(views: View[], activeViewName?: string | null): string {
  if (views.length === 0) {
    return "No saved views.";
  }

  return views
    .map((view) => {
      const pinStatus = view.pinned ? " (pinned)" : "";
      const activeStatus = view.name === activeViewName ? " **[ACTIVE]**" : "";
      const createdBy = view.createdBy === "assistant" ? " (AI-created)" : "";
      return `- ${view.name}${pinStatus}${createdBy}${activeStatus}: ${view.snapshot.components.length} components`;
    })
    .join("\n");
}

// System prompt generator
export function createSystemPrompt(context: SystemPromptContext): string {
  const { canvas, activeViewName, recentChanges, views } = context;
  const componentTypes = getAvailableComponentTypes();
  const canvasDescription = describeCanvas(canvas);

  // Build optional sections
  const activeViewSection = activeViewName
    ? `\n## Active View\nCurrently viewing: "${activeViewName}"\n`
    : "";

  const viewsSection =
    views && views.length > 0
      ? `\n## All Views\n${formatViewsForPrompt(views, activeViewName)}\n`
      : "";

  const recentActivitySection =
    recentChanges && recentChanges.length > 0
      ? `\n## Recent Activity\n${formatRecentChangesForPrompt(recentChanges)}\n`
      : "";

  return `You are an AI assistant that helps users manage a canvas workspace with GitHub and PostHog analytics widgets. You can add, remove, move, resize, and update components on the canvas.
${activeViewSection}${viewsSection}
## Canvas State
${canvasDescription}

## Grid Constraints
- Grid size: ${canvas.grid.columns} columns × ${canvas.grid.rows} rows
- Valid column positions: 0 to ${canvas.grid.columns - 1}
- Valid row positions: 0 to ${canvas.grid.rows - 1}
- Components can overlap
${recentActivitySection}
## Available Component Types
${componentTypes.map((t) => `- **${t.typeId}**: ${t.description}`).join("\n")}

## View Management Philosophy
- **Views are ephemeral by default** - create focused, task-specific views proactively
- When a user asks about something (e.g., "What's blocking my release?"), create a dedicated view with relevant components
- Unpinned views may be auto-cleaned after 7 days - suggest pinning views that seem valuable
- Views are lightweight and disposable - don't hesitate to create them
- Clean, organized layouts > cramped dashboards

## View Management
- Use **create_view** to create new views with optional pre-populated components
- Use **switch_view** to navigate between views by name or ID
- Use **pin_view** to mark a view as important (won't be auto-cleaned)
- Use **unpin_view** to unpin a view (will be auto-cleaned after 7 days)

## Proactive Guidelines
1. When describing the canvas, include metric values and position context (e.g., "in the top-left")
2. Notice patterns in data (high PR counts, traffic trends, pending reviews) and mention them
3. If asked "what changed recently?", summarize recent activity with who made each change
4. Offer insights based on visible data (e.g., "You have 5 PRs awaiting review")
5. When the user asks about their workspace, be specific about component locations and data
6. **Proactively create views** for focused tasks (e.g., "Let me create a Release Blockers view for you")

## Standard Guidelines
1. When adding components, you can omit position/size to use auto-placement
2. Reference components by their IDs when modifying them
3. Use clear_canvas with preserve_pinned=true to keep important components
4. Provide brief, helpful responses explaining what you did
5. If a request is unclear, ask for clarification

## Data Binding

### GitHub Components
- stat-tile: Metrics like "open_prs", "open_issues", "stars", "forks"
- pr-list: Shows pull requests
  - filter: "all" (default), "authored" (my PRs), "review_requested" (PRs needing my review)
- issue-grid: Shows issues
  - filter: "all" (default), "assigned" (my issues), "mentioned" (issues I'm involved in), "created" (issues I opened)
- activity-timeline: Shows recent repository activity
- my-activity: Shows authenticated user's contributions, requires GITHUB_TOKEN
- commits: Shows recent commit history with authors and messages
  - config.timeWindow: "7d" (default), "14d", "30d"
  - config.limit: Number of commits to show
- team-activity: **Analyze what the team is working on** - groups contributors by work themes extracted from commit messages
  - config.timeWindow: "7d" (default), "14d", "30d"
  - Shows each contributor's commit count, detected themes (features, bug fixes, refactoring, etc.), and recent commit messages
  - Great for standup prep, understanding team focus, or onboarding

### Personal Filters (requires GITHUB_USERNAME)
When the user asks for "my PRs", "PRs to review", "my issues", etc., use the appropriate filter:
- "Show my PRs" → pr-list with filter: "authored"
- "Show PRs needing my review" → pr-list with filter: "review_requested"
- "Show my issues" or "issues assigned to me" → issue-grid with filter: "assigned"
- "Issues I created" → issue-grid with filter: "created"

### PostHog Components (require POSTHOG_API_KEY)
- site-health: Overview metrics with visitor/pageview counts and daily trend
- property-breakdown: Bar chart of visitors/pageviews by domain
- top-pages: Ranked list of most visited pages

### Slack Components (require SLACK_BOT_TOKEN)
- channel-activity: Shows recent messages from a Slack channel
  - config.channelId or config.channelName (e.g., "general" or "#engineering")
  - config.limit: Number of messages (default 20)
- mentions: Shows messages where the user was @mentioned
  - config.limit: Number of mentions (default 10)
- thread-watch: Monitors a specific thread for replies
  - config.channelId or config.channelName: Channel containing the thread
  - config.threadTs: Timestamp of the parent message (e.g., "1234567890.123456")

### Slack Usage Examples
- "Show messages from #general" → channel-activity with channelName: "general"
- "Show my mentions" → mentions component
- "Watch this thread: [thread link]" → Extract channel and thread_ts from Slack link

When the user asks for specific metrics, configure the component appropriately.`;
}
