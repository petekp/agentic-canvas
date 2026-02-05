import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

import { createCanvasSlice, type CanvasSlice } from "@/store/canvas-slice";
import { createDataSlice, type DataSlice } from "@/store/data-slice";
import { createUndoSlice, type UndoSlice } from "@/store/undo-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "@/store/workspace-slice";
import { createNotificationSlice, type NotificationSlice } from "@/store/notification-slice";
import type { CreateComponentPayload } from "@/types";
import { addComponentWithFetch } from "@/lib/assistant-actions";

enableMapSet();

type TestStore = CanvasSlice & DataSlice & UndoSlice & WorkspaceSlice & NotificationSlice;

function createTestStore() {
  return create<TestStore>()(
    immer((...args) => ({
      ...createCanvasSlice(...args),
      ...createDataSlice(...args),
      ...createUndoSlice(...args),
      ...createWorkspaceSlice(...args),
      ...createNotificationSlice(...args),
    }))
  );
}

const payload: CreateComponentPayload = {
  typeId: "github.stat-tile",
  config: {},
  dataBinding: {
    source: "mock-github",
    query: { type: "stats", params: { metric: "open_prs" } },
    refreshInterval: null,
  },
};

describe("addComponentWithFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("removes the component if the data fetch fails", async () => {
    const store = createTestStore();

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "kaboom" }),
    })) as unknown as typeof fetch;

    const result = await addComponentWithFetch(store.getState, payload);

    expect(result.error).toContain("kaboom");
    expect(store.getState().canvas.components.length).toBe(0);
  });

  it("keeps the component when the data fetch succeeds", async () => {
    const store = createTestStore();

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { items: [] }, ttl: 1000 }),
    })) as unknown as typeof fetch;

    const result = await addComponentWithFetch(store.getState, payload);

    expect(result.error).toBeUndefined();
    expect(store.getState().canvas.components.length).toBe(1);
    expect(result.componentId).toBeDefined();
  });

  it("returns a user-friendly Slack channel error", async () => {
    const store = createTestStore();

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        error: "Slack bot is not a member of #general. Invite the app to the channel or choose another channel.",
      }),
    })) as unknown as typeof fetch;

    const slackPayload: CreateComponentPayload = {
      typeId: "slack.channel-activity",
      config: { channelName: "general" },
      dataBinding: {
        source: "slack",
        query: { type: "channel_activity", params: { channelName: "general", limit: 5 } },
        refreshInterval: null,
      },
    };

    const result = await addComponentWithFetch(store.getState, slackPayload);

    expect(result.error).toMatch(/invite the app/i);
    expect(result.assistantMessage).toMatch(/invite the app/i);
    expect(store.getState().canvas.components.length).toBe(0);
  });
});
