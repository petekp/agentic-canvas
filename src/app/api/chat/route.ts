// chat/route.ts
//
// Streaming chat API that bridges the frontend to OpenAI with tool support.
//
// ARCHITECTURE: Frontend tool execution
// Tools are defined on the client (via assistant-ui's makeAssistantTool) and
// forwarded to this route. The server converts them to AI SDK format, but
// actual execution happens client-side when tool calls stream back.
//
// This pattern keeps canvas mutations in the browser where Zustand lives,
// avoiding complex server→client state sync.
//
// MESSAGE NORMALIZATION:
// AI SDK v6 expects messages with a `parts` array, but legacy formats use
// `content` strings. normalizeMessages() bridges this gap, letting us accept
// messages from various sources (saved conversations, older clients).
//
// SYSTEM PROMPT COMPOSITION:
// 1. Optional frontend system message (from AssistantChatTransport)
// 2. Dynamic prompt with current canvas state and available tools
// The canvas description gives the AI spatial awareness and data context.
//
// STEP LIMIT:
// We cap at 3 steps (stopWhen: stepCountIs(3)) to prevent runaway tool loops.
// Most interactions need 1-2 steps; 3 handles complex multi-tool scenarios.

import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, type UIMessage, stepCountIs } from "ai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { createSystemPrompt } from "@/lib/ai-tools";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Request body type (for reference)
// messages: UIMessage[] - Chat messages
// system?: string - System message from AssistantChatTransport
// tools?: unknown - Frontend tool definitions from client
// canvas: Canvas - Current canvas state
// recentChanges?: RecentChange[] - Recent canvas changes
// activeViewName?: string | null - Currently active view name
// views?: View[] - Available views

/**
 * Normalizes incoming messages to AI SDK v6's parts-based format.
 *
 * Handles three legacy formats:
 * 1. { content: "string" } → { parts: [{ type: "text", text: "string" }] }
 * 2. { content: [{ type: "text", text: "..." }] } → { parts: [...] }
 * 3. { parts: [...] } → unchanged (already v6 format)
 *
 * WHY: assistant-ui internally converts between formats during serialization.
 * Saved conversations or older API clients might send legacy formats.
 * Without normalization, convertToModelMessages() throws cryptic errors.
 */
function normalizeMessages(messages: unknown[]): UIMessage[] {
  return messages.map((msg: unknown) => {
    const m = msg as Record<string, unknown>;
    const id = (m.id as string) ?? `msg_${Date.now()}`;
    const role = (m.role as "user" | "assistant" | "system") ?? "user";

    // If message already has parts, use as-is
    if (Array.isArray(m.parts) && m.parts.length > 0) {
      return { id, role, parts: m.parts, metadata: m.metadata } as unknown as UIMessage;
    }

    // Convert legacy content string to parts array
    if (typeof m.content === "string") {
      return {
        id,
        role,
        parts: [{ type: "text" as const, text: m.content }],
        metadata: m.metadata,
      } as unknown as UIMessage;
    }

    // Convert legacy content array (assistant-ui internal format) to parts
    if (Array.isArray(m.content)) {
      const parts = m.content.map((c: unknown) => {
        const part = c as Record<string, unknown>;
        if (part.type === "text" && typeof part.text === "string") {
          return { type: "text" as const, text: part.text };
        }
        return part;
      });
      return { id, role, parts, metadata: m.metadata } as unknown as UIMessage;
    }

    // Fallback: return with empty parts
    return { id, role, parts: [], metadata: m.metadata } as unknown as UIMessage;
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages: rawMessages, system, tools, canvas, recentChanges, activeViewName, views } = body;

    // Normalize messages to ensure parts array format (handles legacy content format)
    const messages = normalizeMessages(rawMessages ?? []);

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
    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(messages);
    } catch (conversionError) {
      console.error("[Chat API] convertToModelMessages failed:", conversionError);
      console.error("[Chat API] Message that caused error:", JSON.stringify(messages, null, 2));
      throw conversionError;
    }

    // Use model directly
    const model = openai("gpt-4o");

    // Stream the response with tool support
    // Tools are defined on the client via makeAssistantTool and forwarded here
    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      // Convert frontend tools to AI SDK format
      // These tools execute on the client, not the server
      tools: frontendTools(tools),
      // Limit to 3 steps to prevent tool call loops
      stopWhen: stepCountIs(3),
    });

    // Return the streaming response with error handling
    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("[Chat API] Stream error:", error);
        return error instanceof Error ? error.message : "Stream error occurred";
      },
    });
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
