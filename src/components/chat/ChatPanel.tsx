"use client";

// ChatPanel - floating assistant tray + composer
// Uses assistant-ui for chat interface with native tool execution

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ThreadPrimitive, useAssistantState, useAssistantApi } from "@assistant-ui/react";
import { motion, useDragControls, useMotionValue } from "motion/react";
import { useStore } from "@/store";
import { AssistantComposer, AssistantThreadMessages } from "./AssistantThread";
import { AssistantProvider } from "./AssistantProvider";
import { CanvasTools } from "@/lib/canvas-tools";
import { ChevronDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY_FLOATING_X = "agentic-canvas:assistant-floating-x";
const MIN_TRAY_HEIGHT = 220;
const DEFAULT_TRAY_HEIGHT = 360;
const MAX_TRAY_HEIGHT_RATIO = 0.6;

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
export function PendingChatMessageHandler() {
  const api = useAssistantApi();
  const pendingMessage = useStore((state) => state.pendingChatMessage);
  const clearPendingChatMessage = useStore((state) => state.clearPendingChatMessage);

  useEffect(() => {
    if (pendingMessage) {
      api.thread().append({
        role: "user",
        content: [{ type: "text", text: pendingMessage }],
      });
      clearPendingChatMessage();
    }
  }, [pendingMessage, api, clearPendingChatMessage]);

  return null;
}

function FloatingChat() {
  const isRunning = useAssistantState((s) => s.thread.isRunning);
  const messageCount = useAssistantState((s) => s.thread.messages.length);
  const [isOpen, setIsOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [trayHeight, setTrayHeight] = useState(DEFAULT_TRAY_HEIGHT);
  const [maxTrayHeight, setMaxTrayHeight] = useState(DEFAULT_TRAY_HEIGHT * 2);
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const trayHeightRef = useRef(trayHeight);
  const containerRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);

  trayHeightRef.current = trayHeight;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY_FLOATING_X);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) dragX.set(parsed);
    }
  }, [dragX]);

  useEffect(() => {
    if (!isRunning) return;
    setIsOpen(true);
  }, [isRunning]);

  useEffect(() => {
    if (messageCount > 0) {
      setIsOpen(true);
    }
  }, [messageCount]);

  useEffect(() => {
    function updateMaxHeight() {
      const nextMax = Math.max(
        MIN_TRAY_HEIGHT,
        Math.floor(window.innerHeight * MAX_TRAY_HEIGHT_RATIO)
      );
      setMaxTrayHeight(nextMax);
      setTrayHeight((prev) => Math.min(prev, nextMax));
    }

    updateMaxHeight();
    window.addEventListener("resize", updateMaxHeight);
    return () => window.removeEventListener("resize", updateMaxHeight);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isRunning) {
        setIsOpen(false);
      }
    }

    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node) && !isRunning) {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, isRunning]);

  const startResize = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      setIsResizing(true);

      const startY = event.clientY;
      const startHeight = trayHeightRef.current;

      function handleMove(e: PointerEvent) {
        const delta = startY - e.clientY;
        const next = Math.min(
          Math.max(startHeight + delta, MIN_TRAY_HEIGHT),
          maxTrayHeight
        );
        trayHeightRef.current = next;
        setTrayHeight(next);
      }

      function handleUp() {
        setIsResizing(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      }

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [maxTrayHeight]
  );

  const handleDragStart = useCallback(
    (event: ReactPointerEvent) => {
      dragControls.start(event);
    },
    [dragControls]
  );

  const handleDragEnd = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY_FLOATING_X, `${dragX.get()}`);
  }, [dragX]);

  const trayTransition = useMemo(
    () =>
      isResizing
        ? ({ duration: 0 } as const)
        : ({ type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const),
    [isResizing]
  );

  return (
    <div
      ref={constraintsRef}
      className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 sm:px-6"
    >
      <motion.div
        ref={containerRef}
        drag="x"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={constraintsRef}
        dragElastic={0.12}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x: dragX }}
        className="pointer-events-auto flex w-full max-w-[77ch] flex-col"
      >
        <ThreadPrimitive.Root className="flex w-full flex-col">
          <motion.div
            className={cn(
              "flex flex-col overflow-hidden border bg-card shadow-2xl",
              isOpen
                ? "pointer-events-auto rounded-t-3xl border-border border-b-0"
                : "pointer-events-none rounded-t-3xl border-transparent border-b-0 shadow-none"
            )}
            initial={false}
            animate={{
              height: isOpen ? trayHeight : 0,
              opacity: isOpen ? 1 : 0,
              y: isOpen ? 0 : 8,
            }}
            transition={trayTransition}
            style={{ transformOrigin: "bottom" }}
            aria-hidden={!isOpen}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onPointerDown={handleDragStart}
                  className="flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm transition hover:bg-background"
                  aria-label="Drag assistant"
                >
                  <GripVertical className="h-3 w-3" />
                  <span className="hidden sm:inline">Drag</span>
                </button>
                <span className="hidden sm:inline">Assistant</span>
                {isRunning ? <span>Thinking...</span> : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isRunning) setIsOpen(false);
                }}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground shadow-sm transition hover:bg-background",
                  isRunning && "cursor-not-allowed opacity-60"
                )}
                aria-label="Collapse assistant tray"
                disabled={isRunning}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <div
              onPointerDown={startResize}
              className="flex h-6 cursor-row-resize items-center justify-center bg-transparent"
              aria-label="Resize assistant tray"
            >
              <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
            </div>
            <AssistantThreadMessages />
          </motion.div>

          <div
            className={cn(
              "border bg-card shadow-lg",
              isOpen ? "rounded-b-3xl border-border border-t-0" : "rounded-3xl border-border"
            )}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onPointerDown={handleDragStart}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition hover:bg-muted"
                aria-label="Drag assistant"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="flex-1">
                <AssistantComposer
                  onFocus={() => setIsOpen(true)}
                  placeholder="Ask about your canvas..."
                  className="border-t-0 p-0"
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-3 pb-2 text-[11px] text-muted-foreground">
              <span>⌘K to focus</span>
              <span className="hidden sm:inline">
                {isRunning ? "Thinking..." : "Ready"}
              </span>
            </div>
          </div>
        </ThreadPrimitive.Root>
      </motion.div>
    </div>
  );
}

// Main chat panel
export function ChatPanel() {
  return (
    <AssistantProvider>
      <CanvasTools />
      <KeyboardShortcutHandler />
      <PendingChatMessageHandler />
      <FloatingChat />
    </AssistantProvider>
  );
}
