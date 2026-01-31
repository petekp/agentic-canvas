// AI Tools - Vercel AI SDK tool definitions
// Defines the tools that the AI can use to manipulate the canvas

import { z } from "zod";
import { getAvailableComponentTypes, describeCanvas } from "./canvas-context";
import type { Canvas } from "@/types";

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

// System prompt generator
export function createSystemPrompt(canvas: Canvas): string {
  const componentTypes = getAvailableComponentTypes();
  const canvasDescription = describeCanvas(canvas);

  return `You are an AI assistant that helps users manage a canvas workspace with GitHub and PostHog analytics widgets. You can add, remove, move, resize, and update components on the canvas.

## Canvas State
${canvasDescription}

## Grid Constraints
- Grid size: ${canvas.grid.columns} columns × ${canvas.grid.rows} rows
- Valid column positions: 0 to ${canvas.grid.columns - 1}
- Valid row positions: 0 to ${canvas.grid.rows - 1}
- Components can overlap

## Available Component Types
${componentTypes.map((t) => `- **${t.typeId}**: ${t.description}`).join("\n")}

## Guidelines
1. When adding components, you can omit position/size to use auto-placement
2. Reference components by their IDs when modifying them
3. Use clear_canvas with preserve_pinned=true to keep important components
4. Provide brief, helpful responses explaining what you did
5. If a request is unclear, ask for clarification

## Data Binding

### GitHub Components
- stat-tile: "open_prs", "open_issues", "stars", "forks"
- pr-list: Shows pull requests, can filter by state
- issue-grid: Shows issues, can filter by state/labels
- activity-timeline: Shows recent repository activity
- my-activity: Shows authenticated user's contributions, requires GITHUB_TOKEN

### PostHog Components (require POSTHOG_API_KEY)
- site-health: Overview metrics with visitor/pageview counts and daily trend
- property-breakdown: Bar chart of visitors/pageviews by domain
- top-pages: Ranked list of most visited pages

When the user asks for specific metrics, configure the component appropriately.`;
}
