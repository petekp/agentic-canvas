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
// MESSAGE VALIDATION:
// We rely on assistant-ui's AI SDK transport to send canonical v6 UI messages
// and validate route input with AI SDK helpers.
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
import { convertToModelMessages, type UIMessage, validateUIMessages } from "ai";
import { createSystemPrompt } from "@/lib/ai-tools";
import { appendTelemetry } from "@/lib/telemetry";
import {
  resolveChatSessionScope,
  streamWithPiPhase1Adapter,
  toFrontendToolSet,
} from "@/lib/pi-phase1-adapter";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Request body type (for reference)
// messages: UIMessage[] - Chat messages
// system?: string - System message from AssistantChatTransport
// tools?: unknown - Frontend tool definitions from client
// canvas: Canvas - Current canvas state
// recentChanges?: RecentChange[] - Recent canvas changes
// activeSpaceName?: string | null - Currently active space name
// spaces?: Space[] - Available spaces
// workspaceId?: string - Current workspace id
// threadId?: string - Current thread id
// activeSpaceId?: string - Current space id

function extractLastUserText(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const textParts = parts
      .map((part) => {
        if (part && typeof part === "object" && "type" in part && "text" in part) {
          const p = part as { type?: string; text?: string };
          if (p.type === "text" && typeof p.text === "string") {
            return p.text.trim();
          }
        }
        return null;
      })
      .filter((part): part is string => Boolean(part));
    if (textParts.length > 0) {
      return textParts.join("\n").slice(0, 500);
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages: rawMessages,
      system,
      tools,
      canvas,
      recentChanges,
      activeSpaceName,
      spaces,
      transforms,
      rules,
      workspaceId,
      threadId,
      activeSpaceId,
    } = body;

    const messages = await validateUIMessages({
      messages: rawMessages ?? [],
    });
    const lastUserMessage = extractLastUserText(messages);
    const sessionScope = resolveChatSessionScope({
      workspaceId,
      threadId,
      activeSpaceId,
    });

    await appendTelemetry({
      level: "info",
      source: "api.chat",
      event: "request",
      data: {
        messageCount: messages.length,
        lastUserMessage,
        toolCount:
          tools && typeof tools === "object" && !Array.isArray(tools)
            ? Object.keys(tools as Record<string, unknown>).length
            : undefined,
        activeSpaceName,
        workspaceId: sessionScope.workspaceId,
        threadId: sessionScope.threadId,
        spaceId: sessionScope.spaceId,
        sessionId: sessionScope.sessionId,
      },
    });

    // Build dynamic system prompt based on current canvas state and context
    const dynamicSystemPrompt = createSystemPrompt({
      canvas,
      activeSpaceName,
      recentChanges,
      spaces,
      transforms,
      rules,
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

    // Stream response through phase-1 pi adapter.
    // Orchestration stays AI SDK-backed for now, but we normalize pi events
    // and persist filesystem-first session episodes.
    const result = await streamWithPiPhase1Adapter({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: toFrontendToolSet(tools),
      session: sessionScope,
      abortSignal: req.signal,
    });

    // Return the streaming response with error handling
    return result.toUIMessageStreamResponse({
      onError: (error: unknown) => {
        console.error("[Chat API] Stream error:", error);
        void appendTelemetry({
          level: "error",
          source: "api.chat",
          event: "stream_error",
          data: { error: error instanceof Error ? error.message : String(error) },
        });
        return error instanceof Error ? error.message : "Stream error occurred";
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    await appendTelemetry({
      level: "error",
      source: "api.chat",
      event: "error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
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
