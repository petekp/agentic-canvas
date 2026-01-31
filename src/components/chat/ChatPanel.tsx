"use client";

// ChatPanel - main chat sidebar component
// Manages chat state and streams AI responses with tool execution

import { useCallback, useRef, useEffect, useMemo } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useStore } from "@/store";
import { createToolExecutor } from "@/lib/tool-executor";
import type { ToolCall } from "@/store/chat-slice";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Square, MessageSquare } from "lucide-react";

// Hoist static loading dots JSX (rendering-hoist-jsx)
const LoadingDots = (
  <>
    <span
      className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
      style={{ animationDelay: "0ms" }}
    />
    <span
      className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
      style={{ animationDelay: "150ms" }}
    />
    <span
      className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
      style={{ animationDelay: "300ms" }}
    />
  </>
);

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

export function ChatPanel() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const executedToolsRef = useRef<Set<string>>(new Set());

  // Get store for tool execution
  const store = useStore();
  const canvas = useStore((s) => s.canvas);

  // Memoize tool executor to prevent recreation on every render (rerender-memo)
  const toolExecutor = useMemo(() => createToolExecutor(store), [store]);

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

  // Memoize message conversion to prevent unnecessary recalculation (rerender-memo)
  const displayMessages = useMemo(
    () =>
      messages.map((msg) => {
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
      }),
    [messages]
  );

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Assistant</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ask me to manage your canvas
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {displayMessages.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
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
              <div className="bg-muted rounded-lg px-3 py-2">
                <div className="flex gap-1.5 items-center">
                  {LoadingDots}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stop()}
                    className="ml-2 h-auto py-0.5 px-1.5 text-xs text-destructive hover:text-destructive"
                  >
                    <Square className="h-3 w-3 mr-1" />
                    Stop
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {status === "error" && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-3 py-2 text-sm mb-3">
              An error occurred. Please try again.
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <Separator />

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
