// @vitest-environment jsdom
import React, { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

vi.mock("@/components/chat/AssistantProvider", () => ({
  AssistantProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/canvas-tools", () => ({
  CanvasTools: () => null,
}));

vi.mock("@assistant-ui/react", () => {
  const ThreadPrimitive = {
    Root: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div data-thread-root {...props}>
        {children}
      </div>
    ),
    Viewport: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div data-thread-viewport {...props}>
        {children}
      </div>
    ),
    Empty: ({ children }: { children: React.ReactNode }) => (
      <div data-thread-empty>{children}</div>
    ),
    Messages: () => null,
    Suggestion: ({
      children,
      send,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { send?: boolean }) => {
      void send;
      return (
        <button type="button" {...props}>
          {children}
        </button>
      );
    },
  };

  const MessagePrimitive = {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    If: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Parts: () => null,
  };

  const ComposerPrimitive = {
    Root: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    Input: ({
      asChild,
      children,
      ...props
    }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
      asChild?: boolean;
      children?: React.ReactNode;
    }) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, props);
      }
      return <textarea {...props} />;
    },
    Send: ({
      asChild,
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      asChild?: boolean;
      children?: React.ReactNode;
    }) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, props);
      }
      return <button type="button" {...props} />;
    },
    Cancel: ({
      asChild,
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      asChild?: boolean;
      children?: React.ReactNode;
    }) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, props);
      }
      return <button type="button" {...props} />;
    },
  };

  return {
    ThreadPrimitive,
    MessagePrimitive,
    ComposerPrimitive,
    AssistantIf: ({
      condition,
      children,
    }: {
      condition: (state: { thread: { isRunning: boolean } }) => boolean;
      children: React.ReactNode;
    }) => (condition({ thread: { isRunning: false } }) ? <>{children}</> : null),
    useAssistantState: (selector: (state: { thread: { isRunning: boolean; messages: [] } }) => boolean | unknown) =>
      selector({ thread: { isRunning: false, messages: [] } }),
    useAssistantApi: () => ({
      thread: () => ({
        append: vi.fn(),
        cancelRun: vi.fn(),
      }),
    }),
  };
});

describe("ChatPanel", () => {
  it("does not place the composer inside a pointer-events-none ancestor", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as Record<string, unknown>).React = React;
    const storage = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    } as Storage;

    const { ChatPanel } = await import("@/components/chat/ChatPanel");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(ChatPanel, null));
    });

    const input = container.querySelector<HTMLElement>("[data-aui-composer-input]");
    expect(input).toBeTruthy();

    let current = input;
    let hasPointerEventsNone = false;
    while (current) {
      if (current.classList?.contains("pointer-events-none")) {
        hasPointerEventsNone = true;
        break;
      }
      current = current.parentElement;
    }

    expect(hasPointerEventsNone).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
