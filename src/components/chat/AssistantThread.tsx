"use client";

// AssistantThread - main chat thread component using assistant-ui primitives
// Renders messages, tool calls, and composer with auto-scroll

import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react";
import { AuiIf } from "@assistant-ui/store";
import { cn } from "@/lib/utils";
import { SendHorizonal, Square } from "lucide-react";
import {
  AddComponentToolUI,
  RemoveComponentToolUI,
  MoveComponentToolUI,
  ResizeComponentToolUI,
  UpdateComponentToolUI,
  ClearCanvasToolUI,
} from "./tool-uis";

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
        <MessagePrimitive.Content
          components={{
            Text: TextPart,
          }}
        />
      </div>
    </div>
  );
}

// Assistant message component
function AssistantMessage() {
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
        <MessagePrimitive.Content
          components={{
            Text: TextPart,
            tools: {
              by_name: {
                add_component: AddComponentToolUI,
                remove_component: RemoveComponentToolUI,
                move_component: MoveComponentToolUI,
                resize_component: ResizeComponentToolUI,
                update_component: UpdateComponentToolUI,
                clear_canvas: ClearCanvasToolUI,
              },
            },
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

// Composer component with send/cancel buttons
function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 p-3 border-t border-border">
      <ComposerPrimitive.Input
        placeholder="Ask about your canvas..."
        className={cn(
          "flex-1 min-h-10 max-h-32 resize-none rounded-lg border bg-background px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring"
        )}
        autoFocus
      />
      {/* Show cancel button when running */}
      <AuiIf condition={({ thread }) => thread.isRunning}>
        <ComposerPrimitive.Cancel
          className={cn(
            "p-2 rounded-lg shrink-0",
            "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          )}
        >
          <Square className="h-4 w-4" />
        </ComposerPrimitive.Cancel>
      </AuiIf>
      {/* Show send button when idle */}
      <AuiIf condition={({ thread }) => !thread.isRunning}>
        <ComposerPrimitive.Send
          className={cn(
            "p-2 rounded-lg shrink-0",
            "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          )}
        >
          <SendHorizonal className="h-4 w-4" />
        </ComposerPrimitive.Send>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
}

// Loading indicator shown while assistant is generating
function LoadingIndicator() {
  return (
    <AuiIf condition={({ thread }) => thread.isRunning}>
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
    </AuiIf>
  );
}

// Main thread component
export function AssistantThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
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

      {/* Composer */}
      <Composer />
    </ThreadPrimitive.Root>
  );
}
