"use client";

// ChatPanel - main chat sidebar component
// Uses assistant-ui for chat interface with tool execution

import { useEffect, useMemo, useRef } from "react";
import { useAssistantState, useAssistantApi, useThreadRuntime } from "@assistant-ui/react";
import { useStore } from "@/store";
import { createToolExecutor } from "@/lib/tool-executor";
import { createAssistantSource } from "@/lib/undo/types";
import { AssistantProvider } from "./AssistantProvider";
import { AssistantThread } from "./AssistantThread";
import { MessageSquare } from "lucide-react";

// Tool result type from server
interface ToolResult {
  action: string;
  params: Record<string, unknown>;
  success: boolean;
}

// Tool execution handler - listens for completed tool calls and executes them
function ToolExecutionHandler() {
  const store = useStore();
  const toolExecutor = useMemo(() => createToolExecutor(store), [store]);
  const api = useAssistantApi();
  const executedToolsRef = useRef<Set<string>>(new Set());

  // Subscribe to state changes to detect completed tool calls
  useEffect(() => {
    return api.subscribe(() => {
      const thread = api.thread().getState();
      const messages = thread.messages;

      for (const msg of messages) {
        if (msg.role !== "assistant") continue;

        for (const part of msg.content) {
          if (part.type === "tool-call") {
            const toolCallId = part.toolCallId;

            // Only execute completed tool calls that haven't been executed yet
            if (part.result !== undefined && !executedToolsRef.current.has(toolCallId)) {
              executedToolsRef.current.add(toolCallId);

              const result = part.result as ToolResult;
              if (result.action && result.params) {
                // Create assistant source with message context
                const assistantSource = createAssistantSource({
                  messageId: msg.id,
                  toolCallId,
                });

                // Wrap in batch for proper undo attribution
                store.startBatch(assistantSource, `AI: ${part.toolName}`);

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
    });
  }, [api, store, toolExecutor]);

  return null;
}

// Keyboard shortcut handler for Cmd+K to focus chat
function KeyboardShortcutHandler() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Focus the composer input by querying the DOM
        // assistant-ui ComposerPrimitive.Input renders a textarea
        const input = document.querySelector<HTMLTextAreaElement>(
          '[data-aui-composer-input], [placeholder*="Ask about"]'
        );
        input?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}

// Handler for pending chat messages from notifications
function PendingChatMessageHandler() {
  const threadRuntime = useThreadRuntime();
  const pendingMessage = useStore((state) => state.pendingChatMessage);
  const clearPendingChatMessage = useStore((state) => state.clearPendingChatMessage);

  useEffect(() => {
    if (pendingMessage) {
      // Send the message via the thread composer
      const composer = threadRuntime.composer;
      composer.setText(pendingMessage);
      composer.send();
      clearPendingChatMessage();
    }
  }, [pendingMessage, threadRuntime, clearPendingChatMessage]);

  return null;
}

// Status display for header
function StatusDisplay() {
  const isRunning = useAssistantState((s) => s.thread.isRunning);

  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      {isRunning ? "Thinking..." : "Ask me to manage your canvas"}
    </p>
  );
}

// Main chat panel
export function ChatPanel() {
  return (
    <AssistantProvider>
      <ToolExecutionHandler />
      <KeyboardShortcutHandler />
      <PendingChatMessageHandler />
      <div className="flex flex-col h-full bg-card border-l border-border">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Assistant</h2>
            <span className="text-xs text-muted-foreground ml-auto">⌘K</span>
          </div>
          <StatusDisplay />
        </div>

        {/* Thread */}
        <AssistantThread />
      </div>
    </AssistantProvider>
  );
}
