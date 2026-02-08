// @vitest-environment jsdom
import React, { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

vi.mock("@assistant-ui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@assistant-ui/react")>();
  return {
    ...actual,
    useThreadRuntime: () => null,
  };
});

describe("PendingChatMessageHandler", () => {
  it("does not clear queued messages when thread runtime is unavailable", async () => {
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

    const { PendingChatMessageHandler } = await import("@/components/chat/ChatPanel");
    const { useStore } = await import("@/store");

    act(() => {
      useStore.getState().queueChatMessage("hello");
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(React.createElement(PendingChatMessageHandler, null));
      });
    }).not.toThrow();

    expect(useStore.getState().pendingChatMessage).toBe("hello");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
