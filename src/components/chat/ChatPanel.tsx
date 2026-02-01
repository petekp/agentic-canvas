"use client";

// ChatPanel - main chat sidebar component
// Manages chat state and streams AI responses with tool execution

import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useStore } from "@/store";
import { createToolExecutor } from "@/lib/tool-executor";
import { createAssistantSource } from "@/lib/undo/types";
import { formatRecentChanges } from "@/lib/canvas-context";
import { generateGreeting, formatGreetingMessage } from "@/lib/ai/proactive-greeting";
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

// Quick suggestions for empty canvas
const EMPTY_CANVAS_SUGGESTIONS = [
  "Show my open PRs",
  "Add a PR review queue",
  "Show site analytics",
  "Track open issues",
];

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const executedToolsRef = useRef<Set<string>>(new Set());

  // Get store for tool execution
  const store = useStore();
  const canvas = useStore((s) => s.canvas);

  // Get undo history and view info for AI context
  // Use raw stack to avoid selector returning new array each render
  const undoStack = useStore((s) => s.undoStack);
  const activeViewId = useStore((s) => s.activeViewId);
  const views = useStore((s) => s.workspace.views);

  // Derive recent changes from stack (memoized to prevent recalc)
  const recentChanges = useMemo(() => {
    // Get last 10 entries (most recent first) and format top 5
    const recent = [...undoStack].reverse().slice(0, 10);
    return formatRecentChanges(recent, 5);
  }, [undoStack]);

  // Get active view name
  const activeViewName = useMemo(() => {
    if (!activeViewId) return null;
    const view = views.find((v) => v.id === activeViewId);
    return view?.name ?? null;
  }, [views, activeViewId]);

  // Track if we've shown the proactive greeting
  const [hasGreeted, setHasGreeted] = useState(false);
  const [greetingMessage, setGreetingMessage] = useState<string | null>(null);

  // Memoize tool executor to prevent recreation on every render (rerender-memo)
  const toolExecutor = useMemo(() => createToolExecutor(store), [store]);

  // Use Vercel AI SDK's useChat hook
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  // Keyboard shortcut: Cmd+K to focus chat input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Process tool results and execute them on the store
  // Wraps each AI tool call in a batch for proper undo attribution
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
              // Mark as executed first to prevent duplicate execution
              executedToolsRef.current.add(toolPart.toolCallId);

              // Create assistant source with message context
              const assistantSource = createAssistantSource({
                messageId: msg.id,
                toolCallId: toolPart.toolCallId,
              });

              // Wrap in batch for proper undo attribution
              // All operations from this tool call will be grouped together
              store.startBatch(assistantSource, `AI: ${toolPart.toolName}`);

              try {
                toolExecutor.execute(result.action, result.params);
                store.commitBatch();
              } catch {
                store.abortBatch();
              }
            }
          }
        }
      }
    }
  }, [messages, toolExecutor, store]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Handle sending a message with enhanced context
  const handleSend = useCallback(
    (content: string) => {
      sendMessage(
        { text: content },
        {
          body: {
            canvas,
            recentChanges,
            activeViewName,
          },
        }
      );
    },
    [sendMessage, canvas, recentChanges, activeViewName]
  );

  // Generate proactive greeting on first load with components
  useEffect(() => {
    if (!hasGreeted && canvas.components.length > 0) {
      const greeting = generateGreeting(canvas.components, recentChanges);
      setGreetingMessage(formatGreetingMessage(greeting));
      setHasGreeted(true);
    }
  }, [hasGreeted, canvas.components, recentChanges]);

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

  // Determine what to show in empty state
  const showEmptyCanvasSuggestions = displayMessages.length === 0 && canvas.components.length === 0;
  const showGreeting = displayMessages.length === 0 && greetingMessage && !showEmptyCanvasSuggestions;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Assistant</h2>
          <span className="text-xs text-muted-foreground ml-auto">⌘K</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ask me to manage your canvas
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {/* Empty canvas: show interactive suggestions */}
          {showEmptyCanvasSuggestions && (
            <div className="text-center py-6">
              <p className="text-muted-foreground text-sm mb-4">
                Your canvas is empty. Try one of these:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {EMPTY_CANVAS_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Has components but no messages: show greeting */}
          {showGreeting && (
            <div className="text-muted-foreground text-sm py-4">
              <div className="bg-muted/50 rounded-lg p-3">
                {greetingMessage.split("\n").map((line, i) => (
                  <p key={i} className={line.startsWith("-") ? "ml-2" : line.startsWith("**") ? "font-semibold mt-2" : ""}>
                    {line.replace(/\*\*/g, "")}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {displayMessages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              toolCalls={msg.toolCalls}
            />
          ))}

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
        ref={inputRef}
        onSend={handleSend}
        disabled={isLoading}
        placeholder={
          isLoading ? "Thinking..." : "Ask me to manage your canvas..."
        }
      />
    </div>
  );
}
