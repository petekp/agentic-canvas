"use client";

// AssistantThread - main chat thread component using assistant-ui primitives
// Renders messages, tool calls, and composer with auto-scroll

import { useState, useCallback } from "react";
import {
  ThreadPrimitive,
  MessagePrimitive,
  useAssistantState,
  useAssistantApi,
} from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import { SendHorizonal, Square } from "lucide-react";

// Quick suggestions for empty canvas
const EMPTY_CANVAS_SUGGESTIONS = [
  { prompt: "Show my open PRs", label: "Show my open PRs" },
  { prompt: "Add a PR review queue", label: "Add a PR review queue" },
  { prompt: "Show site analytics", label: "Show site analytics" },
  { prompt: "Track open issues", label: "Track open issues" },
];

// Text component for message rendering
function TextPart({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap">{text}</p>;
}

// Empty state with suggestions
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <p className="text-muted-foreground text-sm mb-4">
        Your canvas is empty. Try one of these:
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {EMPTY_CANVAS_SUGGESTIONS.map((suggestion) => (
          <ThreadPrimitive.Suggestion
            key={suggestion.prompt}
            prompt={suggestion.prompt}
            autoSend
            className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-full cursor-pointer transition-colors"
          >
            {suggestion.label}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  );
}

// User message component
function UserMessage() {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
        <MessagePrimitive.Parts
          components={{
            Text: TextPart,
          }}
        />
      </div>
    </div>
  );
}

// Assistant message component
// Text is rendered in a bubble, tool UIs are rendered outside
function AssistantMessage() {
  return (
    <div className="flex flex-col items-start mb-3 gap-2">
      {/* Text content in a bubble */}
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground empty:hidden">
        <MessagePrimitive.Parts
          components={{
            Text: TextPart,
            // Hide tool UIs in this Parts - they'll be rendered separately
            tools: {
              Override: () => null,
            },
          }}
        />
      </div>
      {/* Tool UIs outside the bubble - self-stretch to override items-start */}
      <div className="w-full self-stretch">
        <MessagePrimitive.Parts
          components={{
            // Hide text in this Parts - already rendered above
            Text: () => null,
          }}
        />
      </div>
    </div>
  );
}

// Message wrapper that conditionally renders user or assistant message
function Message() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.If user>
        <UserMessage />
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <AssistantMessage />
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
}

// ============================================================================
// Composer Component
// ============================================================================

/**
 * Chat input composer with send/cancel buttons
 * Shows send when idle, cancel when running
 */
interface AssistantComposerProps {
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
}

export function AssistantComposer({
  onFocus,
  placeholder = "Ask about your canvas...",
  className,
}: AssistantComposerProps) {
  const isRunning = useAssistantState((s) => s.thread.isRunning);
  const api = useAssistantApi();

  // Local state workaround for assistant-ui ComposerPrimitive.Input bug in v0.12.x
  const [localText, setLocalText] = useState("");

  const handleSend = useCallback(() => {
    if (!localText.trim() || isRunning) return;

    const text = localText.trim();

    // Use the assistant API to send the message
    api.thread().append({
      role: "user",
      content: [{ type: "text", text }],
    });
    setLocalText("");
  }, [localText, isRunning, api]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleCancel = useCallback(() => {
    api.thread().cancelRun();
  }, [api]);

  return (
    <div className={cn("flex items-end gap-2 p-3 border-t border-border", className)}>
      <textarea
        placeholder={placeholder}
        data-aui-composer-input
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex-1 min-h-10 max-h-32 resize-none rounded-lg border bg-background px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring"
        )}
        onFocus={onFocus}
      />
      {isRunning ? (
        <button
          type="button"
          onClick={handleCancel}
          className={cn(
            "p-2 rounded-lg shrink-0",
            "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          )}
        >
          <Square className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSend}
          disabled={!localText.trim()}
          className={cn(
            "p-2 rounded-lg shrink-0",
            "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          )}
        >
          <SendHorizonal className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Loading indicator shown while assistant is generating
function LoadingIndicator() {
  const isRunning = useAssistantState((s) => s.thread.isRunning);

  if (!isRunning) return null;

  return (
    <div className="flex justify-start mb-3">
      <div className="bg-muted rounded-lg px-3 py-2">
        <div className="flex gap-1.5 items-center">
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
        </div>
      </div>
    </div>
  );
}

// Main thread component
export function AssistantThreadMessages() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages area with auto-scroll viewport */}
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-3">
        {/* Empty state */}
        <ThreadPrimitive.Empty>
          <EmptyState />
        </ThreadPrimitive.Empty>

        {/* Messages */}
        <ThreadPrimitive.Messages components={{ Message }} />

        {/* Loading indicator */}
        <LoadingIndicator />
      </ThreadPrimitive.Viewport>
    </div>
  );
}

export function AssistantThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <AssistantThreadMessages />
      <AssistantComposer />
    </ThreadPrimitive.Root>
  );
}
