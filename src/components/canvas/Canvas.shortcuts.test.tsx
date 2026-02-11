// @vitest-environment jsdom
import React, { act } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";

const undo = vi.fn();
const redo = vi.fn();
const navigateToGrid = vi.fn();

vi.mock("@/hooks/useCanvas", () => ({
  useCanvas: () => ({
    components: [],
    grid: { columns: 12, gap: 8 },
    selectedComponentId: null,
    addComponent: vi.fn(),
    removeComponent: vi.fn(),
    moveComponent: vi.fn(),
    resizeComponent: vi.fn(),
    clearCanvas: vi.fn(),
    setGridDimensions: vi.fn(),
    selectComponent: vi.fn(),
  }),
}));

vi.mock("@/hooks/useUndo", () => ({
  useUndoSimple: () => ({
    canUndo: true,
    canRedo: true,
    undo,
    redo,
    undoDescription: null,
    redoDescription: null,
    undoCount: 0,
    redoCount: 0,
  }),
}));

vi.mock("@/hooks/usePolling", () => ({
  usePolling: () => ({}),
}));

vi.mock("@/hooks/useInsightLoop", () => ({
  useInsightLoop: () => ({}),
}));

vi.mock("@/hooks/useStateSignals", () => ({
  useStateSignals: () => ({}),
}));

vi.mock("@/hooks/useStateDebug", () => ({
  useStateDebugSnapshot: () => null,
}));

vi.mock("@/hooks/useSpaceNavigation", () => ({
  useSpaceNavigation: () => ({ navigateToGrid }),
}));

vi.mock("react-grid-layout/core", () => ({
  getCompactor: () => () => null,
}));

vi.mock("react-grid-layout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="grid">{children}</div>
  ),
  useContainerWidth: () => ({
    width: 1000,
    containerRef: { current: null },
    mounted: true,
  }),
}));

vi.mock("./ComponentContent", () => ({
  ComponentContent: () => null,
}));

vi.mock("./CanvasHeader", () => ({
  CanvasHeader: () => null,
}));

vi.mock("@/components/UndoRedoControls", () => ({
  UndoRedoControls: () => null,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/notifications/NotificationBadge", () => ({
  NotificationBadge: () => null,
}));

vi.mock("@/components/notifications/NotificationPanel", () => ({
  NotificationPanel: () => null,
}));

vi.mock("@/components/canvas/ToolbarMenu", () => ({
  ToolbarMenu: {
    Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Trigger: () => null,
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Item: ({
      children,
      onClick,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
    }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    Separator: () => null,
    Label: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("@/components/canvas/StateDebugPanel", () => ({
  StateDebugPanel: () => null,
}));

describe("Canvas keyboard shortcuts", () => {
  beforeEach(() => {
    undo.mockClear();
    redo.mockClear();
    navigateToGrid.mockClear();
  });

  function stubLocalStorage() {
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
  }

  it("does not intercept Cmd+Z when event target is a textarea", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as Record<string, unknown>).React = React;
    stubLocalStorage();

    const { Canvas } = await import("@/components/canvas/Canvas");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Canvas, null));
    });

    const textarea = document.createElement("textarea");
    container.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent("keydown", {
      key: "z",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: textarea });
    window.dispatchEvent(event);

    expect(undo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("handles Cmd+Shift+Z regardless of key casing", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as Record<string, unknown>).React = React;
    stubLocalStorage();

    const { Canvas } = await import("@/components/canvas/Canvas");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Canvas, null));
    });

    const event = new KeyboardEvent("keydown", {
      key: "Z",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(redo).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
