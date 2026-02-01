"use client";

// ChatPanel - main chat sidebar component
// Uses assistant-ui for chat interface with native tool execution

import { useEffect } from "react";
import { useAssistantState, useThreadRuntime } from "@assistant-ui/react";
import { useStore } from "@/store";
import { AssistantProvider } from "./AssistantProvider";
import { AssistantThread } from "./AssistantThread";
import { CanvasTools } from "@/lib/canvas-tools";
import { MessageSquare } from "lucide-react";

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
      <CanvasTools />
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
