// Chat API Route - handles streaming AI responses with tool calling
// Uses Vercel AI SDK with Supermemory middleware for automatic memory

import { openai } from "@ai-sdk/openai";
import { withSupermemory } from "@supermemory/tools/ai-sdk";
import { streamText, convertToModelMessages, type UIMessage, stepCountIs } from "ai";
import { z } from "zod";
import { createSystemPrompt } from "@/lib/ai-tools";
import type { Canvas, View } from "@/types";
import type { RecentChange } from "@/lib/canvas-context";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

interface ChatRequest {
  messages: UIMessage[];
  system?: string; // From AssistantChatTransport (frontend system messages)
  canvas: Canvas;
  recentChanges?: RecentChange[];
  activeViewName?: string | null;
  views?: View[];
}

// Tool parameter schemas
const positionSchema = z.object({
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});

const sizeSchema = z.object({
  cols: z.number().int().min(1).max(12),
  rows: z.number().int().min(1).max(8),
});

export async function POST(req: Request) {
  try {
    const { messages, system, canvas, recentChanges, activeViewName, views }: ChatRequest = await req.json();

    // Extract user ID from session/auth
    // TODO: Wire to your auth system
    const userId = "default_user";

    // Build dynamic system prompt based on current canvas state and context
    const dynamicSystemPrompt = createSystemPrompt({
      canvas,
      activeViewName,
      recentChanges,
      views,
    });

    // Combine any forwarded frontend system messages with our dynamic prompt
    const systemPrompt = system
      ? `${system}\n\n${dynamicSystemPrompt}`
      : dynamicSystemPrompt;

    // Convert UI messages to model messages
    const modelMessages = await convertToModelMessages(messages);

    // Define tools with server-side execute functions
    // These return instructions for the client to execute
    const tools = {
      add_component: {
        description: `Add a new component to the canvas. Available types:
- "github.stat-tile": metric display, requires config.metric (e.g., "open_prs", "closed_issues", "stars")
- "github.pr-list": shows pull requests
- "github.issue-grid": shows issues
- "github.activity-timeline": shows activity feed
Position and size are optional. For stat-tile, always include config with the metric name.`,
        inputSchema: z.object({
          type_id: z.string(),
          config: z.record(z.string(), z.unknown()).optional(),
          position: positionSchema.optional(),
          size: sizeSchema.optional(),
          label: z.string().optional(),
        }),
        execute: async (params: {
          type_id: string;
          config?: Record<string, unknown>;
          position?: { col: number; row: number };
          size?: { cols: number; rows: number };
          label?: string;
        }) => {
          // Return the params - client will execute via store
          return {
            action: "add_component",
            params,
            success: true,
          };
        },
      },
      remove_component: {
        description: "Remove a component from the canvas by its ID.",
        inputSchema: z.object({
          component_id: z.string(),
        }),
        execute: async (params: { component_id: string }) => {
          return {
            action: "remove_component",
            params,
            success: true,
          };
        },
      },
      move_component: {
        description: "Move a component to a new position on the grid.",
        inputSchema: z.object({
          component_id: z.string(),
          position: positionSchema,
        }),
        execute: async (params: { component_id: string; position: { col: number; row: number } }) => {
          return {
            action: "move_component",
            params,
            success: true,
          };
        },
      },
      resize_component: {
        description: "Resize a component on the grid.",
        inputSchema: z.object({
          component_id: z.string(),
          size: sizeSchema,
        }),
        execute: async (params: { component_id: string; size: { cols: number; rows: number } }) => {
          return {
            action: "resize_component",
            params,
            success: true,
          };
        },
      },
      update_component: {
        description: "Update a component's configuration or label.",
        inputSchema: z.object({
          component_id: z.string(),
          config: z.record(z.string(), z.unknown()).optional(),
          label: z.string().optional(),
          pinned: z.boolean().optional(),
        }),
        execute: async (params: {
          component_id: string;
          config?: Record<string, unknown>;
          label?: string;
          pinned?: boolean;
        }) => {
          return {
            action: "update_component",
            params,
            success: true,
          };
        },
      },
      clear_canvas: {
        description: "Clear all components from the canvas. Use preserve_pinned to keep pinned components.",
        inputSchema: z.object({
          preserve_pinned: z.boolean().default(true),
        }),
        execute: async (params: { preserve_pinned: boolean }) => {
          return {
            action: "clear_canvas",
            params,
            success: true,
          };
        },
      },
      create_view: {
        description: "Create a new canvas view/tab. Use for organizing related components into separate workspaces. Views are ephemeral by default - users can pin ones they want to keep.",
        inputSchema: z.object({
          name: z.string().describe("Name for the new view"),
          components: z
            .array(
              z.object({
                type_id: z.string(),
                config: z.record(z.string(), z.unknown()).optional(),
                position: positionSchema.optional(),
                size: sizeSchema.optional(),
                label: z.string().optional(),
              })
            )
            .optional()
            .describe("Components to add to the view"),
          switch_to: z.boolean().default(true).describe("Switch to the new view after creating it"),
        }),
        execute: async (params: {
          name: string;
          components?: Array<{
            type_id: string;
            config?: Record<string, unknown>;
            position?: { col: number; row: number };
            size?: { cols: number; rows: number };
            label?: string;
          }>;
          switch_to: boolean;
        }) => {
          return {
            action: "create_view",
            params,
            success: true,
          };
        },
      },
      switch_view: {
        description: "Switch to an existing view by name or ID.",
        inputSchema: z.object({
          view: z.string().describe("View name or ID to switch to"),
        }),
        execute: async (params: { view: string }) => {
          return {
            action: "switch_view",
            params,
            success: true,
          };
        },
      },
      pin_view: {
        description: "Pin a view to keep it. Unpinned views may be auto-cleaned after 7 days. Use this when the user wants to keep a view.",
        inputSchema: z.object({
          view: z.string().optional().describe("View name or ID to pin. If not specified, pins the current view."),
        }),
        execute: async (params: { view?: string }) => {
          return {
            action: "pin_view",
            params,
            success: true,
          };
        },
      },
      unpin_view: {
        description: "Unpin a view. Unpinned views may be auto-cleaned after 7 days of inactivity.",
        inputSchema: z.object({
          view: z.string().optional().describe("View name or ID to unpin. If not specified, unpins the current view."),
        }),
        execute: async (params: { view?: string }) => {
          return {
            action: "unpin_view",
            params,
            success: true,
          };
        },
      },
    };

    // Wrap the model with Supermemory middleware
    // This automatically injects relevant memories and stores conversations
    const model = withSupermemory(openai("gpt-4o"), userId, {
      apiKey: process.env.SUPERMEMORY_API_KEY,
      mode: "full", // Use both profile and query-based memory retrieval
      addMemory: "always", // Automatically store conversations as memories
      verbose: process.env.NODE_ENV === "development", // Log memory operations in dev
    });

    // Stream the response with tool support
    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5), // Allow multi-step tool use
    });

    // Return the streaming response
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
