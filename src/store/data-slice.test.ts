import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

import { createCanvasSlice, type CanvasSlice } from "@/store/canvas-slice";
import { createDataSlice, type DataSlice } from "@/store/data-slice";
import { createUndoSlice, type UndoSlice } from "@/store/undo-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "@/store/workspace-slice";
import type { DataBinding } from "@/types";

type TestStore = CanvasSlice & DataSlice & UndoSlice & WorkspaceSlice;

enableMapSet();

function createTestStore() {
  return create<TestStore>()(
    immer((...args) => ({
      ...createCanvasSlice(...args),
      ...createDataSlice(...args),
      ...createUndoSlice(...args),
      ...createWorkspaceSlice(...args),
    }))
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const binding: DataBinding = {
  source: "mock-github",
  query: { type: "stats", params: { metric: "open_prs" } },
  refreshInterval: null,
};

describe("data-slice fetchData", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deduplicates pending fetches and waits for completion", async () => {
    const store = createTestStore();
    const addResult = store.getState().addComponent({
      typeId: "github.stat-tile",
      config: {},
    });
    const componentId = addResult.affectedComponentIds[0];

    const deferred = createDeferred<{ ok: boolean; json: () => Promise<unknown> }>();

    globalThis.fetch = vi.fn(() => deferred.promise) as unknown as typeof fetch;

    const p1 = store.getState().fetchData(componentId, binding);
    const p2 = store.getState().fetchData(componentId, binding);

    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    expect(store.getState().pendingFetches.size).toBe(1);

    const loading = store.getState().canvas.components.find((c) => c.id === componentId);
    expect(loading?.dataState.status).toBe("loading");

    deferred.resolve({
      ok: true,
      json: async () => ({ data: { items: [] }, ttl: 1000 }),
    });

    await Promise.all([p1, p2]);

    const ready = store.getState().canvas.components.find((c) => c.id === componentId);
    expect(ready?.dataState.status).toBe("ready");
  });

  it("records error state when fetch fails", async () => {
    const store = createTestStore();
    const addResult = store.getState().addComponent({
      typeId: "github.stat-tile",
      config: {},
    });
    const componentId = addResult.affectedComponentIds[0];

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "kaboom" }),
    })) as unknown as typeof fetch;

    await store.getState().fetchData(componentId, binding);

    const errored = store.getState().canvas.components.find((c) => c.id === componentId);
    expect(errored?.dataState.status).toBe("error");
    if (errored?.dataState.status === "error") {
      expect(errored.dataState.error.message).toContain("kaboom");
    }
  });
});
