import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

import { createCanvasSlice, type CanvasSlice } from "@/store/canvas-slice";
import { createDataSlice, type DataSlice } from "@/store/data-slice";
import { createUndoSlice, type UndoSlice } from "@/store/undo-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "@/store/workspace-slice";
import { createChatSlice, type ChatSlice } from "@/store/chat-slice";
import { createNotificationSlice, type NotificationSlice } from "@/store/notification-slice";
import type { DataBinding } from "@/types";

type TestStore = CanvasSlice & DataSlice & UndoSlice & WorkspaceSlice & ChatSlice & NotificationSlice;

enableMapSet();

function createTestStore() {
  return create<TestStore>()(
    immer((...args) => ({
      ...createCanvasSlice(...args),
      ...createDataSlice(...args),
      ...createUndoSlice(...args),
      ...createWorkspaceSlice(...args),
      ...createChatSlice(...args),
      ...createNotificationSlice(...args),
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

  it("updates all components sharing a binding when a pending fetch resolves", async () => {
    const store = createTestStore();

    const deferred = createDeferred<{ ok: boolean; json: () => Promise<unknown> }>();
    globalThis.fetch = vi.fn(() => deferred.promise) as unknown as typeof fetch;

    const first = store.getState().addComponent({
      typeId: "github.stat-tile",
      config: {},
      dataBinding: binding,
    });
    const second = store.getState().addComponent({
      typeId: "github.stat-tile",
      config: {},
      dataBinding: binding,
    });

    const firstId = first.affectedComponentIds[0];
    const secondId = second.affectedComponentIds[0];

    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);

    const secondLoading = store.getState().canvas.components.find((c) => c.id === secondId);
    expect(secondLoading?.dataState.status).toBe("loading");

    const pending = Array.from(store.getState().pendingFetches.values())[0] as Promise<void>;

    deferred.resolve({
      ok: true,
      json: async () => ({ data: { items: [1] }, ttl: 1000 }),
    });

    await pending;

    const firstReady = store.getState().canvas.components.find((c) => c.id === firstId);
    const secondReady = store.getState().canvas.components.find((c) => c.id === secondId);

    expect(firstReady?.dataState.status).toBe("ready");
    expect(secondReady?.dataState.status).toBe("ready");
  });

  it("does not reuse cache entries across bindings with different transforms", async () => {
    const store = createTestStore();

    const petekpTransformId = store.getState().createTransform({
      name: "Only petekp",
      description: "Filter to petekp",
      code: "return data.filter((item) => item.actor === 'petekp');",
      compatibleWith: [],
      createdBy: "assistant",
    });
    const avTransformId = store.getState().createTransform({
      name: "Only AVGVSTVS96",
      description: "Filter to AVGVSTVS96",
      code: "return data.filter((item) => item.actor === 'AVGVSTVS96');",
      compatibleWith: [],
      createdBy: "assistant",
    });

    const firstBinding: DataBinding = {
      source: "mock-github",
      query: { type: "activity", params: {} },
      refreshInterval: null,
      transformId: petekpTransformId,
    };
    const secondBinding: DataBinding = {
      source: "mock-github",
      query: { type: "activity", params: {} },
      refreshInterval: null,
      transformId: avTransformId,
    };

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "1", actor: "petekp" },
          { id: "2", actor: "AVGVSTVS96" },
        ],
        ttl: 60_000,
      }),
    })) as unknown as typeof fetch;

    const first = store.getState().addComponent({
      typeId: "github.activity-timeline",
      config: {},
    });
    const second = store.getState().addComponent({
      typeId: "github.activity-timeline",
      config: {},
    });

    const firstId = first.affectedComponentIds[0];
    const secondId = second.affectedComponentIds[0];

    await store.getState().fetchData(firstId, firstBinding);
    await store.getState().fetchData(secondId, secondBinding);

    const fetchCalls = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls;
    expect(fetchCalls.length).toBe(2);

    const firstReady = store.getState().canvas.components.find((c) => c.id === firstId);
    const secondReady = store.getState().canvas.components.find((c) => c.id === secondId);

    expect(firstReady?.dataState.status).toBe("ready");
    expect(secondReady?.dataState.status).toBe("ready");

    if (firstReady?.dataState.status === "ready") {
      const rows = firstReady.dataState.data as Array<{ actor: string }>;
      expect(rows).toEqual([{ actor: "petekp", id: "1" }]);
    }
    if (secondReady?.dataState.status === "ready") {
      const rows = secondReady.dataState.data as Array<{ actor: string }>;
      expect(rows).toEqual([{ actor: "AVGVSTVS96", id: "2" }]);
    }
  });

  it("blocks transforms that are not assistant-generated", async () => {
    const store = createTestStore();
    const addResult = store.getState().addComponent({
      typeId: "github.stat-tile",
      config: {},
    });
    const componentId = addResult.affectedComponentIds[0];

    const transformId = store.getState().createTransform({
      name: "Unsafe",
      description: "User-created transform",
      code: "return data;",
      compatibleWith: [],
      createdBy: "user",
    });

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { items: [] }, ttl: 1000 }),
    })) as unknown as typeof fetch;

    await store.getState().fetchData(componentId, {
      ...binding,
      transformId,
    });

    const errored = store.getState().canvas.components.find((c) => c.id === componentId);
    expect(errored?.dataState.status).toBe("error");
    if (errored?.dataState.status === "error") {
      expect(errored.dataState.error.message).toContain("not trusted");
    }
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

  it("returns briefing data without external fetch", async () => {
    const store = createTestStore();
    const addResult = store.getState().addComponent({
      typeId: "briefing.recommendations",
      config: {},
      dataBinding: {
        source: "briefing",
        query: { type: "recommendations", params: { repos: ["owner/repo"] } },
        refreshInterval: null,
      },
    });
    const componentId = addResult.affectedComponentIds[0];

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: {}, ttl: 1000 }),
    })) as unknown as typeof fetch;

    await store.getState().fetchData(componentId, {
      source: "briefing",
      query: { type: "recommendations", params: { repos: ["owner/repo"] } },
      refreshInterval: null,
    });

    const ready = store.getState().canvas.components.find((c) => c.id === componentId);
    expect(ready?.dataState.status).toBe("ready");
    if (ready?.dataState.status === "ready") {
      const data = ready.dataState.data as { summary?: string };
      expect(typeof data.summary).toBe("string");
    }
  });

  it("requests morning brief output and stores lifecycle payload", async () => {
    const store = createTestStore();
    const addResult = store.getState().addComponent({
      typeId: "system.morning-brief",
      config: {},
    });
    const componentId = addResult.affectedComponentIds[0];

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.outputType).toBe("morning_brief");
      return {
        ok: true,
        json: async () => ({
          data: {
            state: "presented",
            current: {
              version: 1,
              generatedAt: new Date().toISOString(),
              generatedBy: "assistant",
              mission: {
                id: "m1",
                title: "Stabilize release readiness",
                rationale: "Deployments are failing.",
                owner: "You",
                horizon: "today",
                priorityScore: 80,
              },
              evidence: [],
              levers: [],
              assumptions: [],
              confidence: "medium",
              freshnessSummary: "Freshness range 1-1 minutes; stale items 0.",
            },
            history: [],
            userOverrides: [],
          },
          ttl: 1000,
        }),
      };
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await store.getState().fetchData(componentId, {
      source: "briefing",
      query: { type: "morning_brief", params: { repos: ["owner/repo"] } },
      refreshInterval: null,
    });

    const ready = store.getState().canvas.components.find((c) => c.id === componentId);
    expect(ready?.dataState.status).toBe("ready");
    if (ready?.dataState.status === "ready") {
      const data = ready.dataState.data as { state?: string; current?: { mission?: { title?: string } } };
      expect(data.state).toBe("presented");
      expect(data.current?.mission?.title).toContain("Stabilize");
    }
  });

  it("routes morning brief to /api/briefing/v2 behind feature flag and adapts payload", async () => {
    const previousFlag = process.env.NEXT_PUBLIC_MORNING_BRIEF_V2_ENABLED;
    process.env.NEXT_PUBLIC_MORNING_BRIEF_V2_ENABLED = "1";

    try {
      const store = createTestStore();
      const addResult = store.getState().addComponent({
        typeId: "system.morning-brief",
        config: {},
      });
      const componentId = addResult.affectedComponentIds[0];

      const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe("/api/briefing/v2");
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(typeof body.mission_hint).toBe("string");

        return {
          ok: true,
          json: async () => ({
            data: {
              precomputed: {
                brief: {
                  schema_version: "v0.2",
                  generated_at: new Date().toISOString(),
                  mission: {
                    title: "Stabilize release readiness",
                    rationale: "Deployments are failing.",
                    horizon: "today",
                  },
                  priorities: [
                    {
                      id: "p1",
                      rank: 1,
                      headline: "Clear blockers",
                      summary: "Resolve top blocker thread.",
                      confidence: "medium",
                      evidence_refs: ["e1"],
                    },
                  ],
                  evidence: [
                    {
                      id: "e1",
                      source: "github",
                      entity: "owner/repo",
                      metric: "blocked_prs",
                      value_text: "2 blocked PRs",
                      observed_at: new Date().toISOString(),
                      freshness_minutes: 20,
                    },
                  ],
                  assumptions: [],
                  quick_reaction_prompt: "accept, reframe, or snooze",
                },
              },
              view: { sections: [] },
              writeback: {
                recorded_at: new Date().toISOString(),
                reaction: { kind: "accept", note: "looks good" },
              },
            },
            ttl: 1000,
          }),
        };
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await store.getState().fetchData(componentId, {
        source: "briefing",
        query: { type: "morning_brief", params: { repos: ["owner/repo"] } },
        refreshInterval: null,
      });

      const ready = store.getState().canvas.components.find((c) => c.id === componentId);
      expect(ready?.dataState.status).toBe("ready");
      if (ready?.dataState.status === "ready") {
        const data = ready.dataState.data as {
          state?: string;
          current?: { mission?: { title?: string } };
          userOverrides?: Array<{ type?: string }>;
        };
        expect(data.state).toBe("presented");
        expect(data.current?.mission?.title).toContain("Stabilize");
        expect(data.userOverrides?.[0]?.type).toBe("accept");
      }
    } finally {
      if (previousFlag === undefined) {
        delete process.env.NEXT_PUBLIC_MORNING_BRIEF_V2_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_MORNING_BRIEF_V2_ENABLED = previousFlag;
      }
    }
  });

  it("applies LLM scores from /api/rules/score and sorts by score", async () => {
    const store = createTestStore();

    store.getState().setRulesForTarget("github.prs", [
      {
        id: "score-llm",
        type: "score.llm_classifier",
        phase: "score",
        target: "github.prs",
        params: { instruction: "Prioritize questions." },
      },
      {
        id: "sort-score",
        type: "sort.score_then_recent",
        phase: "sort",
        target: "github.prs",
      },
    ]);
    expect(store.getState().getRulesForTarget("github.prs")).toHaveLength(2);

    const fetchMock = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      if (url === "/api/github") {
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: "a", title: "FYI update", updatedAt: 100 },
              { id: "b", title: "Can you review this?", updatedAt: 50 },
            ],
            ttl: 1000,
          }),
        };
      }

      if (url === "/api/rules/score") {
        const body = JSON.parse(String(options?.body ?? "{}"));
        expect(body.instruction).toBe("Prioritize questions.");
        expect(Array.isArray(body.items)).toBe(true);
        return {
          ok: true,
          json: async () => ({
            scores: [
              { key: "b", score: 0.9 },
              { key: "a", score: 0.1 },
            ],
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${String(url)}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const addResult = store.getState().addComponent({
      typeId: "github.pr-list",
      config: {},
      dataBinding: {
        source: "mock-github",
        query: { type: "pull_requests", params: {} },
        refreshInterval: null,
      },
    });
    const componentId = addResult.affectedComponentIds[0];

    await store.getState().fetchData(componentId, {
      source: "mock-github",
      query: { type: "pull_requests", params: {} },
      refreshInterval: null,
    });

    const fetchUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(fetchUrls).toContain("/api/rules/score");

    const ready = store.getState().canvas.components.find((c) => c.id === componentId);
    expect(ready?.dataState.status).toBe("ready");
    if (ready?.dataState.status === "ready") {
      const data = ready.dataState.data as Array<{ id: string }>;
      expect(data[0]?.id).toBe("b");
    }
  });
});
