// @vitest-environment jsdom
import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";

describe("AssistantProvider", () => {
  it("renders without runtime errors", async () => {
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
    const { AssistantProvider } = await import("@/components/chat/AssistantProvider");
    const { useAssistantState } = await import("@assistant-ui/react");

    function Probe() {
      const isRunning = useAssistantState((state) => state.thread.isRunning);
      return React.createElement("div", { "data-testid": "probe" }, String(isRunning));
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(
          React.createElement(
            AssistantProvider,
            null,
            React.createElement(Probe, null),
          )
        );
      });
    }).not.toThrow();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("unmounts cleanly under React.StrictMode (no double-unmount crashes)", async () => {
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

    const { AssistantProvider } = await import("@/components/chat/AssistantProvider");
    const { useAssistantState } = await import("@assistant-ui/react");

    function Probe() {
      const isRunning = useAssistantState((state) => state.thread.isRunning);
      return React.createElement("div", { "data-testid": "probe" }, String(isRunning));
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(
              AssistantProvider,
              null,
              React.createElement(Probe, null),
            ),
          )
        );
      });
    }).not.toThrow();

    expect(() => {
      act(() => {
        root.unmount();
      });
    }).not.toThrow();

    container.remove();
  });
});
