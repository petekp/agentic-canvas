import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

import { createCanvasSlice, type CanvasSlice } from "@/store/canvas-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "@/store/workspace-slice";
import { createUndoSlice, type UndoSlice } from "@/store/undo-slice";
import { createDataSlice, type DataSlice } from "@/store/data-slice";
import { createAssistantSource } from "@/lib/undo/types";
import type { DataBinding } from "@/types";

type TestStore = CanvasSlice & WorkspaceSlice & UndoSlice & DataSlice;

enableMapSet();

function createTestStore() {
  return create<TestStore>()(
    immer((...args) => ({
      ...createCanvasSlice(...args),
      ...createWorkspaceSlice(...args),
      ...createUndoSlice(...args),
      ...createDataSlice(...args),
    }))
  );
}

beforeEach(() => {
  // Provide a minimal fetch mock for any incidental data fetches.
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { items: [] }, ttl: 1000 }),
  })) as unknown as typeof fetch;
});

describe("undo batching", () => {
  it("combines multiple operations into a single undo entry", () => {
    const store = createTestStore();
    const source = createAssistantSource({ messageId: "m1", toolCallId: "t1" });

    store.getState().startBatch(source, "AI: batch test");
    store.getState().addComponent({
      typeId: "github.stat-tile",
      config: {},
    });
    store.getState().addComponent({
      typeId: "github.pr-list",
      config: { repo: "assistant-ui/assistant-ui" },
    });

    store.getState().commitBatch();

    const { undoStack } = store.getState();
    expect(undoStack.length).toBe(1);
    expect(undoStack[0].batchSize).toBe(2);
    expect(undoStack[0].source.type).toBe("assistant");
  });
});

describe("undo view context", () => {
  it("switches back to the view where the change occurred", () => {
    const store = createTestStore();
    const defaultSpaceId = store.getState().activeSpaceId;

    const spaceId = store
      .getState()
      .createEmptySpace({ name: "Focus", switchTo: true });

    store.getState().addComponent({
      typeId: "github.stat-tile",
      config: {},
    });

    // Switch away from the view before undo.
    store.getState().setActiveSpace(defaultSpaceId);

    store.getState().undo();

    expect(store.getState().activeSpaceId).toBe(spaceId);
  });
});

describe("view operations", () => {
  it("renames should be undoable", () => {
    const store = createTestStore();
    const spaceId = store.getState().activeSpaceId;

    const originalName = store
      .getState()
      .workspace.spaces.find((space) => space.id === spaceId)?.name;

    store.getState().renameSpace(spaceId!, "Renamed");

    expect(store.getState().undoStack.length).toBeGreaterThan(0);

    store.getState().undo();

    const nameAfterUndo = store
      .getState()
      .workspace.spaces.find((space) => space.id === spaceId)?.name;

    expect(nameAfterUndo).toBe(originalName);
  });
});

describe("update component", () => {
  it("records binding changes as component_update_binding", () => {
    const store = createTestStore();

    const addResult = store.getState().addComponent({
      typeId: "github.stat-tile",
      config: {},
    });

    const componentId = addResult.affectedComponentIds[0];

    const binding: DataBinding = {
      source: "mock-github",
      query: { type: "stats", params: { repo: "assistant-ui/assistant-ui", metric: "open_prs" } },
      refreshInterval: null,
    };

    store.getState().updateComponent({
      componentId,
      dataBinding: binding,
    });

    const lastEntry = store.getState().undoStack[store.getState().undoStack.length - 1];

    expect(lastEntry.command).toMatchObject({
      type: "component_update_binding",
      componentId,
    });
  });
});
