import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

import { createCanvasSlice, type CanvasSlice } from "@/store/canvas-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "@/store/workspace-slice";
import { createUndoSlice, type UndoSlice } from "@/store/undo-slice";
import { createDataSlice, type DataSlice } from "@/store/data-slice";
import { createChatSlice, type ChatSlice } from "@/store/chat-slice";
import { createNotificationSlice, type NotificationSlice } from "@/store/notification-slice";
import type { MorningBriefComponentData } from "@/types";

enableMapSet();

type TestStore = CanvasSlice & WorkspaceSlice & UndoSlice & DataSlice & ChatSlice & NotificationSlice;

function createTestStore() {
  return create<TestStore>()(
    immer((...args) => ({
      ...createCanvasSlice(...args),
      ...createWorkspaceSlice(...args),
      ...createUndoSlice(...args),
      ...createDataSlice(...args),
      ...createChatSlice(...args),
      ...createNotificationSlice(...args),
    }))
  );
}

function createMorningBriefData(
  confidence: MorningBriefComponentData["current"]["confidence"] = "medium"
): MorningBriefComponentData {
  return {
    current: {
      version: 1,
      generatedAt: "2026-02-11T08:00:00.000Z",
      generatedBy: "assistant",
      mission: {
        id: "mission_1",
        title: "Stabilize release readiness",
        rationale: "Blockers and failed deploys are rising.",
        owner: "You",
        horizon: "today",
        priorityScore: 82,
      },
      evidence: [
        {
          id: "ev_1",
          source: "github",
          entity: "owner/repo",
          metric: "blockers",
          valueText: "4",
          valueNumber: 4,
          observedAt: "2026-02-11T07:45:00.000Z",
          freshnessMinutes: 15,
          confidence: "high",
        },
      ],
      levers: [
        {
          id: "lever_1",
          label: "Triage blockers",
          actionType: "manual",
          expectedImpact: "Reduce release risk quickly.",
          impactScore: 70,
          confidence: "medium",
        },
      ],
      assumptions: [],
      confidence,
      freshnessSummary: "Freshness range 15-15 minutes; stale items 0.",
    },
    history: [],
    state: "presented",
    userOverrides: [],
  };
}

function seedMorningBriefComponent(store: ReturnType<typeof createTestStore>): string {
  const componentId = store.getState().addComponent({
    typeId: "system.morning-brief",
    config: {},
  }).affectedComponentIds[0];

  store.setState((state) => {
    const component = state.canvas.components.find((c) => c.id === componentId);
    if (!component) return;
    component.dataBinding = {
      source: "briefing",
      query: { type: "morning_brief", params: { repos: ["owner/repo"] } },
      refreshInterval: null,
    };
    component.dataState = {
      status: "ready",
      data: createMorningBriefData("medium"),
      fetchedAt: Date.now(),
    };
  });

  return componentId;
}

describe("workspace morning brief defaults", () => {
  it("creates exactly one system-managed morning brief space by default", () => {
    const store = createTestStore();
    const spaces = store.getState().workspace.spaces;

    const morningSpaces = spaces.filter((space) => space.kind === "system.morning_brief");
    expect(morningSpaces).toHaveLength(1);

    const morningSpace = morningSpaces[0];
    expect(morningSpace.meta.systemManaged).toBe(true);
    expect(morningSpace.meta.pinned).toBe(true);
    expect(morningSpace.pinned).toBe(true);
    expect(store.getState().activeSpaceId).toBe(morningSpace.id);
    expect(
      morningSpace.snapshot.components.some((component) => component.typeId === "system.morning-brief")
    ).toBe(true);
  });

  it("creates ad_hoc spaces by default with synced metadata", () => {
    const store = createTestStore();
    const spaceId = store.getState().createEmptySpace({ name: "Focus Slice" });
    const space = store.getState().workspace.spaces.find((s) => s.id === spaceId);

    expect(space).toBeTruthy();
    expect(space?.kind).toBe("ad_hoc");
    expect(space?.meta.systemManaged).toBe(false);
    expect(space?.meta.createdBy).toBe("user");
    expect(space?.createdBy).toBe("user");
    expect(space?.meta.pinned).toBe(space?.pinned);
  });

  it("does not delete the system-managed morning brief space", () => {
    const store = createTestStore();
    const morning = store
      .getState()
      .workspace.spaces.find((space) => space.kind === "system.morning_brief");

    expect(morning).toBeTruthy();

    store.getState().deleteSpace(morning!.id);

    const stillExists = store
      .getState()
      .workspace.spaces.find((space) => space.id === morning!.id);

    expect(stillExists).toBeTruthy();
  });

  it("does not unpin the system-managed morning brief space", () => {
    const store = createTestStore();
    const morning = store
      .getState()
      .workspace.spaces.find((space) => space.kind === "system.morning_brief");

    expect(morning).toBeTruthy();

    store.getState().unpinSpace(morning!.id);

    const updated = store
      .getState()
      .workspace.spaces.find((space) => space.id === morning!.id);

    expect(updated?.pinned).toBe(true);
    expect(updated?.meta.pinned).toBe(true);
  });

  it("registers default morning brief triggers", () => {
    const store = createTestStore();
    const triggers = store
      .getState()
      .workspace.triggers.filter((trigger) => trigger.type.startsWith("event.") || trigger.type.includes("morning") || trigger.type === "staleness" || trigger.type === "user.request_refresh");

    expect(triggers.map((trigger) => trigger.type).sort()).toEqual([
      "event.behavior_drop",
      "event.blocker",
      "event.risk_spike",
      "schedule.morning",
      "staleness",
      "user.request_refresh",
    ]);
  });

  it("seeds a morning brief component when loading an empty morning brief snapshot", () => {
    const store = createTestStore();
    const morningSpace = store
      .getState()
      .workspace.spaces.find((space) => space.kind === "system.morning_brief");

    expect(morningSpace).toBeTruthy();
    if (!morningSpace) return;

    store.setState((state) => {
      const target = state.workspace.spaces.find((space) => space.id === morningSpace.id);
      if (!target) return;
      target.snapshot.components = [];
      state.canvas.components = [];
    });

    const result = store.getState().loadSpace(morningSpace.id);

    expect(result.success).toBe(true);
    expect(
      store
        .getState()
        .canvas.components.some((component) => component.typeId === "system.morning-brief")
    ).toBe(true);
  });
});

describe("workspace morning brief triggers", () => {
  it("suppresses non-critical triggers while snoozed", async () => {
    const store = createTestStore();
    const componentId = seedMorningBriefComponent(store);

    const snoozed = store.getState().applyMorningBriefOverrideAction(componentId, {
      type: "snooze",
      payload: { durationMinutes: 60 },
    });
    expect(snoozed).toBe(true);

    const result = await store.getState().runMorningBriefTrigger({
      type: "event.blocker",
      metrics: { blockerCount: 4 },
      now: Date.parse("2026-02-11T09:00:00.000Z"),
    });

    expect(result.fired).toBe(false);
    expect(result.reason).toBe("snoozed");
  });

  it("enforces cooldown and min interval windows", async () => {
    const store = createTestStore();
    seedMorningBriefComponent(store);

    store.setState((state) => {
      const blocker = state.workspace.triggers.find((trigger) => trigger.type === "event.blocker");
      if (!blocker) return;
      blocker.minIntervalMinutes = 30;
      blocker.coolDownMinutes = 45;
    });

    const first = await store.getState().runMorningBriefTrigger({
      type: "event.blocker",
      metrics: { blockerCount: 5 },
      now: Date.parse("2026-02-11T09:00:00.000Z"),
    });
    expect(first.fired).toBe(true);

    const minIntervalSuppressed = await store.getState().runMorningBriefTrigger({
      type: "event.blocker",
      metrics: { blockerCount: 6 },
      now: Date.parse("2026-02-11T09:10:00.000Z"),
    });
    expect(minIntervalSuppressed.fired).toBe(false);
    expect(minIntervalSuppressed.reason).toBe("min_interval");

    store.setState((state) => {
      const blocker = state.workspace.triggers.find((trigger) => trigger.type === "event.blocker");
      if (!blocker) return;
      blocker.minIntervalMinutes = 0;
      blocker.coolDownMinutes = 45;
    });

    const cooldownSuppressed = await store.getState().runMorningBriefTrigger({
      type: "event.blocker",
      metrics: { blockerCount: 7 },
      now: Date.parse("2026-02-11T09:20:00.000Z"),
    });
    expect(cooldownSuppressed.fired).toBe(false);
    expect(cooldownSuppressed.reason).toBe("cooldown");
  });

  it("allows user-request refresh even when snoozed or in cooldown", async () => {
    const store = createTestStore();
    const componentId = seedMorningBriefComponent(store);
    store.getState().applyMorningBriefOverrideAction(componentId, {
      type: "snooze",
      payload: { durationMinutes: 120 },
    });

    store.setState((state) => {
      const userRefresh = state.workspace.triggers.find(
        (trigger) => trigger.type === "user.request_refresh"
      );
      if (!userRefresh) return;
      userRefresh.lastFiredAt = "2026-02-11T08:59:00.000Z";
      userRefresh.minIntervalMinutes = 120;
      userRefresh.coolDownMinutes = 120;
    });

    const result = await store.getState().runMorningBriefTrigger({
      type: "user.request_refresh",
      now: Date.parse("2026-02-11T09:00:00.000Z"),
    });

    expect(result.fired).toBe(true);
    expect(result.reason).toBe("fired");
  });

  it("switches to suggest-only mode after two low-confidence refreshes", async () => {
    const store = createTestStore();
    seedMorningBriefComponent(store);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createMorningBriefData("low"), ttl: 1_000 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createMorningBriefData("low"), ttl: 1_000 }),
      });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await store.getState().runMorningBriefTrigger({
      type: "user.request_refresh",
      now: Date.parse("2026-02-11T09:00:00.000Z"),
    });
    const second = await store.getState().runMorningBriefTrigger({
      type: "user.request_refresh",
      now: Date.parse("2026-02-11T09:02:00.000Z"),
    });

    expect(first.fired).toBe(true);
    expect(second.fired).toBe(true);
    expect(store.getState().workspace.morningBrief.mode).toBe("suggest_only");
    expect(store.getState().workspace.morningBrief.lowConfidenceStreak).toBe(2);

    const suppressed = await store.getState().runMorningBriefTrigger({
      type: "event.blocker",
      metrics: { blockerCount: 5 },
      now: Date.parse("2026-02-11T09:03:00.000Z"),
    });
    expect(suppressed.fired).toBe(false);
    expect(suppressed.reason).toBe("suggest_only");
  });
});

describe("workspace morning brief overrides", () => {
  it("applies override actions and transitions lifecycle state", () => {
    const store = createTestStore();
    const componentId = seedMorningBriefComponent(store);

    const accepted = store.getState().applyMorningBriefOverrideAction(componentId, {
      type: "accept",
      note: "Ship this plan",
    });
    expect(accepted).toBe(true);

    const component = store.getState().canvas.components.find((c) => c.id === componentId);
    expect(component?.dataState.status).toBe("ready");
    if (component?.dataState.status !== "ready") return;
    const data = component.dataState.data as MorningBriefComponentData;
    expect(data.state).toBe("accepted");
    expect(data.userOverrides.at(-1)?.type).toBe("accept");
  });
});
