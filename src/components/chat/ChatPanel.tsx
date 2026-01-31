"use client";

// ChatPanel - main chat sidebar component
// Manages chat state and streams AI responses with tool execution

import { useCallback, useRef, useEffect } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useStore } from "@/store";
import { createToolExecutor } from "@/lib/tool-executor";
import type { ToolCall } from "@/store/chat-slice";

// Helper to extract text from message parts
function getMessageText(parts: UIMessage["parts"]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

// Tool result type from server
interface ToolResult {
  action: string;
  params: Record<string, unknown>;
  success: boolean;
}

// Helper to extract tool invocations from message parts and execute them
function processToolParts(
  parts: UIMessage["parts"],
  toolExecutor: ReturnType<typeof createToolExecutor>
): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  for (const part of parts) {
    if (part.type.startsWith("tool-")) {
      const toolPart = part as {
        type: string;
        toolCallId: string;
        toolName: string;
        input?: unknown;
        output?: unknown;
        state?: string;
      };

      // If there's an output (tool result), execute it on the store
      if (toolPart.output && typeof toolPart.output === "object") {
        const result = toolPart.output as ToolResult;
        if (result.action && result.params) {
          // Execute the action on the store
          toolExecutor.execute(result.action, result.params);
        }
      }

      toolCalls.push({
        id: toolPart.toolCallId,
        name: toolPart.toolName,
        arguments: (toolPart.input as Record<string, unknown>) ?? {},
        result: toolPart.output,
      });
    }
  }

  return toolCalls;
}

export function ChatPanel() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const executedToolsRef = useRef<Set<string>>(new Set());

  // Get store for tool execution
  const store = useStore();
  const canvas = useStore((s) => s.canvas);

  // Create tool executor bound to store
  const toolExecutor = createToolExecutor(store);

  // Use Vercel AI SDK's useChat hook
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  // Process tool results and execute them on the store
  useEffect(() => {
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type.startsWith("tool-")) {
          const toolPart = part as {
            type: string;
            toolCallId: string;
            toolName: string;
            output?: unknown;
            state?: string;
          };

          // Only execute completed tool calls that haven't been executed yet
          // AI SDK v6 uses "output-available" state (not "result")
          if (
            toolPart.output &&
            toolPart.state === "output-available" &&
            !executedToolsRef.current.has(toolPart.toolCallId)
          ) {
            const result = toolPart.output as ToolResult;
            if (result.action && result.params) {
              toolExecutor.execute(result.action, result.params);
              executedToolsRef.current.add(toolPart.toolCallId);
            }
          }
        }
      }
    }
  }, [messages, toolExecutor]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Handle sending a message
  const handleSend = useCallback(
    (content: string) => {
      sendMessage(
        { text: content },
        {
          body: { canvas }, // Include current canvas state
        }
      );
    },
    [sendMessage, canvas]
  );

  // Check if loading
  const isLoading = status === "submitted" || status === "streaming";

  // Convert messages to display format
  const displayMessages = messages.map((msg) => {
    const toolCalls: ToolCall[] = [];

    for (const part of msg.parts) {
      if (part.type.startsWith("tool-")) {
        const toolPart = part as {
          type: string;
          toolCallId: string;
          toolName: string;
          input?: unknown;
          output?: unknown;
        };
        toolCalls.push({
          id: toolPart.toolCallId,
          name: toolPart.toolName,
          arguments: (toolPart.input as Record<string, unknown>) ?? {},
          result: toolPart.output,
        });
      }
    }

    return {
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: getMessageText(msg.parts),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  });

  return (
    <div className="flex flex-col h-full bg-[var(--background)] border-l border-[var(--grid-line)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--grid-line)]">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Assistant
        </h2>
        <p className="text-xs text-[var(--grid-line)] mt-0.5">
          Ask me to manage your canvas
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {displayMessages.length === 0 ? (
          <div className="text-center text-[var(--grid-line)] text-sm py-8">
            <p>No messages yet.</p>
            <p className="mt-1 text-xs">
              Try: &ldquo;Add a stat tile showing open PRs&rdquo;
            </p>
          </div>
        ) : (
          displayMessages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              toolCalls={msg.toolCalls}
            />
          ))
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="bg-[var(--grid-color)] rounded-lg px-3 py-2">
              <div className="flex gap-1 items-center">
                <span
                  className="w-2 h-2 bg-[var(--foreground)] rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-2 h-2 bg-[var(--foreground)] rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 bg-[var(--foreground)] rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
                <button
                  onClick={() => stop()}
                  className="ml-2 text-xs text-red-500 hover:text-red-600"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {status === "error" && (
          <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">
            An error occurred. Please try again.
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isLoading}
        placeholder={
          isLoading ? "Thinking..." : "Ask me to manage your canvas..."
        }
      />
    </div>
  );
}
