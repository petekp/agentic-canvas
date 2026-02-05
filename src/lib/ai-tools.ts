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
import { getDefaultTemplates } from "@/lib/templates";
import type { Canvas, Space, TransformDefinition } from "@/types";

// ============================================================================
// System Prompt Context
// ============================================================================

export interface SystemPromptContext {
  canvas: Canvas;
  activeSpaceName?: string | null;
  recentChanges?: RecentChange[];
  spaces?: Space[];
  transforms?: TransformDefinition[];
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

const stateSchema = z.object({
  focus: z.number().min(0).max(1).optional(),
  energy: z.number().min(0).max(1).optional(),
  stress: z.number().min(0).max(1).optional(),
  time_pressure: z.number().min(0).max(1).optional(),
  interruptibility: z.number().min(0).max(1).optional(),
  mode: z.enum(["execute", "review", "explore", "recover", "monitor"]).optional(),
  ambient_light: z.enum(["low", "normal", "bright"]).optional(),
  noise_level: z.enum(["quiet", "moderate", "loud"]).optional(),
  motion_context: z.enum(["still", "moving"]).optional(),
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

export const generateTemplateSchema = z.object({
  template_id: z.string().optional().meta({ description: "Template ID to force, if known" }),
  category: z.enum(["focus", "review", "explore", "monitor", "recover"]).optional(),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .meta({ description: "Template parameter overrides" }),
  state: stateSchema.optional().meta({ description: "Partial cognitive/perceptual state snapshot" }),
});

// Tool definitions for streamText (inputSchema format)
export function getToolDefinitions() {
  const componentTypes = getAvailableComponentTypes();
  const typeDescriptions = componentTypes
    .map((t) => `"${t.typeId}" (${t.description})`)
    .join(", ");
  const templateDescriptions = getDefaultTemplates()
    .map((t) => `"${t.id}" (${t.name})`)
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
    generate_template: {
      description: `Generate a component set from a template. Available templates: ${templateDescriptions}. Use state to guide selection when template_id is omitted.`,
      inputSchema: generateTemplateSchema,
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
export type GenerateTemplateParams = z.infer<typeof generateTemplateSchema>;

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

// Format spaces for system prompt
function formatSpacesForPrompt(spaces: Space[], activeSpaceName?: string | null): string {
  if (spaces.length === 0) {
    return "No saved spaces.";
  }

  return spaces
    .map((space) => {
      const pinStatus = space.pinned ? " (pinned)" : "";
      const activeStatus = space.name === activeSpaceName ? " **[ACTIVE]**" : "";
      const createdBy = space.createdBy === "assistant" ? " (AI-created)" : "";
      return `- ${space.name}${pinStatus}${createdBy}${activeStatus}: ${space.snapshot.components.length} components`;
    })
    .join("\n");
}

// Format transforms for system prompt
function formatTransformsForPrompt(transforms: TransformDefinition[]): string {
  if (transforms.length === 0) {
    return "No transforms defined yet.";
  }

  return transforms
    .map((t) => {
      const sources = t.compatibleWith.map((c) => `${c.source}/${c.queryType}`).join(", ");
      return `- "${t.name}" (${t.id}): ${t.description} [works with: ${sources}]`;
    })
    .join("\n");
}

function formatIntegrationsForPrompt(): string {
  const slackBot = Boolean(process.env.SLACK_BOT_TOKEN);
  const slackUser = Boolean(process.env.SLACK_USER_TOKEN);
  const posthog = Boolean(process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID);
  const vercel = Boolean(process.env.VERCEL_TOKEN);
  const github = Boolean(process.env.GITHUB_TOKEN);

  const availability = (value: boolean) => (value ? "available" : "unavailable");

  return [
    "## Integrations",
    `- Slack bot token: ${availability(slackBot)}`,
    `- Slack user token: ${availability(slackUser)}`,
    `- GitHub: ${availability(github)}`,
    `- PostHog: ${availability(posthog)}`,
    `- Vercel: ${availability(vercel)}`,
  ].join("\n");
}

// System prompt generator
export function createSystemPrompt(context: SystemPromptContext): string {
  const { canvas, activeSpaceName, recentChanges, spaces, transforms } = context;
  const componentTypes = getAvailableComponentTypes();
  const canvasDescription = describeCanvas(canvas);

  // Build optional sections
  const activeSpaceSection = activeSpaceName
    ? `\n## Active Space\nCurrently viewing: "${activeSpaceName}"\n`
    : "";

  const spacesSection =
    spaces && spaces.length > 0
      ? `\n## All Spaces\n${formatSpacesForPrompt(spaces, activeSpaceName)}\n`
      : "";

  const recentActivitySection =
    recentChanges && recentChanges.length > 0
      ? `\n## Recent Activity\n${formatRecentChangesForPrompt(recentChanges)}\n`
      : "";

  const transformsSection =
    transforms && transforms.length > 0
      ? `\n## Available Transforms\n${formatTransformsForPrompt(transforms)}\n`
      : "";

  const integrationsSection = `\n${formatIntegrationsForPrompt()}\n`;

  return `You are an AI assistant that helps users manage a canvas workspace with GitHub and PostHog analytics widgets. You can add, remove, move, resize, and update components on the canvas.
${activeSpaceSection}${spacesSection}${transformsSection}${integrationsSection}
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

## Space Management Philosophy
- **Spaces are ephemeral by default** - create focused, task-specific spaces proactively
- When a user asks about something (e.g., "What's blocking my release?"), create a dedicated space with relevant components
- Unpinned spaces may be auto-cleaned after 7 days - suggest pinning spaces that seem valuable
- Spaces are lightweight and disposable - don't hesitate to create them
- Clean, organized layouts > cramped dashboards

## Space Management
- Use **create_space** to create new spaces with optional pre-populated components
- Use **switch_space** to navigate between spaces by name or ID
- Use **pin_space** to mark a space as important (won't be auto-cleaned)
- Use **unpin_space** to unpin a space (will be auto-cleaned after 7 days)

## Proactive Guidelines
1. When describing the canvas, include metric values and position context (e.g., "in the top-left")
2. Notice patterns in data (high PR counts, traffic trends, pending reviews) and mention them
3. If asked "what changed recently?", summarize recent activity with who made each change
4. Offer insights based on visible data (e.g., "You have 5 PRs awaiting review")
5. When the user asks about their workspace, be specific about component locations and data
6. **Proactively create spaces** for focused tasks (e.g., "Let me create a Release Blockers space for you")

## Standard Guidelines
1. When adding components, you can omit position/size to use auto-placement
2. Reference components by their IDs when modifying them
3. Use clear_canvas with preserve_pinned=true to keep important components
4. Provide brief, helpful responses explaining what you did
5. If a request is unclear, ask for clarification
6. When a tool fails, do not surface raw error text. Summarize the issue in plain language and propose the next step. Do not add components until the issue is resolved. If you see an error prefixed with \"Action needed:\", follow its instructions.
7. Do not claim a component was added until the tool succeeds. Before tool execution, use tentative language like \"I'll try to add...\" and only confirm after success.
8. Treat tool results with \`success: false\` as failures, even if the tool call completed. Ask for the missing info or propose the next step instead of claiming success.
9. When a tool returns \`action\` or \`missingFields\`, follow that guidance and ask the user for the specific missing inputs.

## Data Transforms

Transforms are reusable filters/transformations that process data from sources. The LLM generates deterministic JavaScript code once, which runs on every data fetch.

### Creating Transforms
Use **create_transform** to create a reusable transform:
- name: Short name (e.g., "My Mentions")
- description: What it does
- code: JavaScript function body that receives 'data' and returns transformed data
- compatible_with: Array of {source, query_type} pairs

### Using Transforms
When adding a component, pass transform_id to apply a stored transform:
\`\`\`
add_component({type_id: "slack.channel-activity", transform_id: "transform_abc123"})
\`\`\`

### Transform Examples
- Filter Slack mentions: \`return data.filter(m => m.mentions?.some(u => u.username === 'pete'))\`
- Only open PRs: \`return data.filter(pr => pr.state === 'open')\`
- Sort by date: \`return [...data].sort((a,b) => new Date(b.created_at) - new Date(a.created_at))\`
- First 5 items: \`return data.slice(0, 5)\`

### When to Use Transforms
- Filter data by keywords, users, or conditions
- Show subsets of data (e.g., only open PRs, only messages from certain users)
- Custom sorting or reshaping

### Transform Reuse
Before creating a new transform, check if an existing one in "Available Transforms" already does what's needed. Transforms can be reused across multiple components.

### Adding Filtered Components
Use **add_filtered_component** to create a component with a filter in one step:
\`\`\`
add_filtered_component({
  type_id: "slack.channel-activity",
  filter_name: "My Filter",
  filter_description: "What the filter does",
  filter_code: "return data.filter(item => /* condition */)",
  config: { /* component-specific config */ }
})
\`\`\`

The tool will validate required config and guide you if something is missing.

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

### Slack Components
- channel-activity: Shows recent messages from a Slack channel (requires SLACK_BOT_TOKEN)
  - config.channelId or config.channelName (e.g., "general" or "#engineering")
  - config.limit: Number of messages (default 20)
  - config.includeThreadReplies: true to include thread replies (useful when mentions live in threads)
  - config.threadRepliesLimit: Max replies per thread (default 20)
  - Each message includes \`mentions\` metadata: [{ userId, username, displayName }]
- mentions: Shows messages where the user was @mentioned (requires **User OAuth token xoxp-**)
  - Bot tokens cannot use Slack's search API.
  - If only a bot token is available, use **channel-activity + a transform** and prefer filtering via the \`mentions\` array (fallback to \`text\` if needed).
  - config.limit: Number of mentions (default 10)
  - config.userId: (optional) show mentions for a specific user (use lookup_slack_user if you only have a handle)
- thread-watch: Monitors a specific thread for replies (requires SLACK_BOT_TOKEN)
  - config.channelId or config.channelName: Channel containing the thread
  - config.threadTs: Timestamp of the parent message (e.g., "1234567890.123456")
  - If you see a not_in_channel error, do not ask for channel ID. Ask the user to invite the Slack app to that channel or choose a channel where the app is already present.

### Slack Tools
- lookup_slack_user: Resolve a name/handle to Slack users (requires users:read scope)
  - Use when you need a user's handle/ID to build a mention filter.
  - If multiple matches, ask the user which one is correct.

### Slack Usage Examples
- "Show messages from #general" → channel-activity with channelName: "general"
- "Show my mentions (no user token)" → use add_filtered_component with type_id "slack.channel-activity" and a mentions filter. Omit channel config so the tool UI can prompt the user with a channel OptionList (includes "All available channels").
- If the user hasn't specified a channel, ask them to pick from the available Slack channels surfaced by the tools (via the OptionList UI).
- "Show my mentions (unknown user)" → do not try to resolve "@me" via lookup_slack_user; ask the user to pick themselves from the Slack user list. Only use lookup_slack_user when the user provides a specific handle/name and you need to disambiguate.
- "Filter messages" → use add_filtered_component with filter_code
- "Watch this thread: [thread link]" → Extract channel and thread_ts from Slack link

### Vercel Components (require VERCEL_TOKEN)
- deployments: Shows recent deployments with status badges (READY/BUILDING/ERROR)
  - config.limit: Number of deployments to show (default 10)
  - Shows commit info, target (production/preview), and timestamps
- project-status: Compact tile showing project health
  - Displays framework, production status, and preview URL
  - Good for at-a-glance project monitoring

### Vercel Usage Examples
- "Show my Vercel deployments" → deployments component
- "What's my project status?" → project-status component
- "Show the last 5 deployments" → deployments with limit: 5

When the user asks for specific metrics, configure the component appropriately.`;
}
