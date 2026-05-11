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
import { getRuleEntry, listRulesByTarget } from "@/lib/rules";
import { loadPromptDoc } from "@/lib/prompt-docs";
import type { Canvas, Space, TransformDefinition } from "@/types";
import type { RulePack } from "@/lib/rules/types";

// ============================================================================
// System Prompt Context
// ============================================================================

export interface SystemPromptContext {
  canvas: Canvas;
  activeSpaceName?: string | null;
  recentChanges?: RecentChange[];
  spaces?: Space[];
  transforms?: TransformDefinition[];
  rules?: RulePack;
}

const ASSISTANT_SYSTEM_GUIDELINES = loadPromptDoc(
  "docs/prompts/assistant-system-guidelines.md",
  "## Standard Guidelines\nProvide brief, helpful responses and avoid claiming tool success before it is confirmed."
);

const ASSISTANT_INTEGRATION_NOTES = loadPromptDoc(
  "docs/prompts/assistant-integration-notes.md",
  '- GitHub note: If GitHub token is unavailable, do not add GitHub components. Ask the user to connect GitHub.'
)
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

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

export const generateBriefingSchema = z.object({
  name: z.string().optional().meta({ description: "Space name (default: 'Morning Briefing')" }),
});

export const setPreferenceRulesSchema = z.object({
  patch: z.unknown().meta({
    description:
      "Preference patch JSON (object or string). Must include target and rules matching the rules schema.",
  }),
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
    generate_briefing: {
      description:
        "Set up a guided Morning Briefing space. Use when the user asks for a morning briefing, daily digest, dashboard setup, or asks to be caught up.",
      inputSchema: generateBriefingSchema,
    },
    set_preference_rules: {
      description:
        "Store personalization rules for a data target (mentions, PRs, issues, deployments). Use when the user asks to prioritize, filter, or sort recurring data.",
      inputSchema: setPreferenceRulesSchema,
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
export type GenerateBriefingParams = z.infer<typeof generateBriefingSchema>;
export type SetPreferenceRulesParams = z.infer<typeof setPreferenceRulesSchema>;

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
      const kind = ` [${space.kind}]`;
      return `- ${space.name}${kind}${pinStatus}${createdBy}${activeStatus}: ${space.snapshot.components.length} components`;
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

function formatRulesForPrompt(rules?: RulePack): string {
  const entries = listRulesByTarget(rules);
  if (entries.size === 0) {
    return "No preference rules defined yet.";
  }

  const lines: string[] = [];
  for (const [target, targetRules] of entries.entries()) {
    const descriptions = targetRules.map((rule) => {
      const entry = getRuleEntry(rule.type);
      return entry?.explain(rule) ?? rule.type;
    });
    lines.push(`- ${target}: ${descriptions.join(" | ")}`);
  }

  return lines.join("\n");
}

function formatIntegrationsForPrompt(): string {
  const slackBot = Boolean(process.env.SLACK_BOT_TOKEN);
  const slackUser = Boolean(process.env.SLACK_USER_TOKEN);
  const posthog = Boolean(process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID);
  const vercel = Boolean(process.env.VERCEL_TOKEN);
  const github = Boolean(process.env.GITHUB_TOKEN);

  const availability = (value: boolean) => (value ? "available" : "unavailable");

  const integrationNotes = ASSISTANT_INTEGRATION_NOTES.map((line) =>
    line.startsWith("-") ? line : `- ${line}`
  );

  return [
    "## Integrations",
    `- Slack bot token: ${availability(slackBot)}`,
    `- Slack user token: ${availability(slackUser)}`,
    `- GitHub token: ${availability(github)} (required for all github.* components)`,
    `- PostHog: ${availability(posthog)}`,
    `- Vercel: ${availability(vercel)}`,
    ...integrationNotes,
  ].join("\n");
}

// System prompt generator
export function createSystemPrompt(context: SystemPromptContext): string {
  const { canvas, activeSpaceName, recentChanges, spaces, transforms, rules } = context;
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

  const rulesSection = `\n## Preference Rules\n${formatRulesForPrompt(rules)}\n`;

  const integrationsSection = `\n${formatIntegrationsForPrompt()}\n`;

  return `You are an AI assistant that helps users manage a canvas workspace with GitHub and PostHog analytics widgets. You can add, remove, move, resize, and update components on the canvas.
${activeSpaceSection}${spacesSection}${transformsSection}${rulesSection}${integrationsSection}
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
${ASSISTANT_SYSTEM_GUIDELINES}`;
}
