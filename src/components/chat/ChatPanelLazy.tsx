"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const ChatPanel = dynamic(() => import("./ChatPanel").then((m) => m.ChatPanel), {
  ssr: false,
});

function requestIdle(callback: () => void, timeoutMs: number) {
  if (typeof window === "undefined") return () => {};

  if (window.requestIdleCallback) {
    const handle = window.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => window.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, timeoutMs);
  return () => window.clearTimeout(handle);
}

function focusComposerInput() {
  const input = document.querySelector<HTMLTextAreaElement>(
    '[data-aui-composer-input], [placeholder*="Ask about"]'
  );
  input?.focus();
}

function isCmdK(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

export function ChatPanelLazy() {
  const [enabled, setEnabled] = useState(false);
  const shouldFocusAfterMount = useRef(false);

  useEffect(() => {
    const cancel = requestIdle(() => setEnabled(true), 2000);
    return cancel;
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isCmdK(event)) return;
      event.preventDefault();
      shouldFocusAfterMount.current = true;
      setEnabled(true);
      void import("./ChatPanel");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!shouldFocusAfterMount.current) return;
    shouldFocusAfterMount.current = false;

    let cancelled = false;
    const start = performance.now();

    function tryFocus() {
      if (cancelled) return;
      focusComposerInput();
      const active = document.activeElement;
      if (active?.tagName === "TEXTAREA") return;
      if (performance.now() - start > 1500) return;
      requestAnimationFrame(tryFocus);
    }

    requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={() => {
          shouldFocusAfterMount.current = true;
          setEnabled(true);
          void import("./ChatPanel");
        }}
        className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border/60 bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-lg backdrop-blur transition hover:bg-background"
      >
        Assistant <span className="ml-2 text-xs opacity-70">⌘K</span>
      </button>
    );
  }
  return <ChatPanel />;
}
