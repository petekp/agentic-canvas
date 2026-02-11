import { describe, expect, it } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

import { createCanvasSlice, type CanvasSlice } from "@/store/canvas-slice";
import { createWorkspaceSlice, type WorkspaceSlice } from "@/store/workspace-slice";
import { createUndoSlice, type UndoSlice } from "@/store/undo-slice";
import { createDataSlice, type DataSlice } from "@/store/data-slice";
import { createChatSlice, type ChatSlice } from "@/store/chat-slice";
import { createNotificationSlice, type NotificationSlice } from "@/store/notification-slice";

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

describe("workspace load/save behavior", () => {
  it("does not duplicate pinned components in a space snapshot across re-entry", () => {
    const store = createTestStore();
    const state = store.getState();
    const activeSpaceId = state.activeSpaceId;

    expect(activeSpaceId).toBeTruthy();

    state.addComponent({
      typeId: "github.activity-timeline",
      config: { repo: "assistant-ui/assistant-ui" },
      meta: { pinned: true },
    });

    const space = store.getState().workspace.spaces.find((s) => s.id === activeSpaceId);
    expect(space).toBeTruthy();

    store.getState().saveSpace({
      spaceId: activeSpaceId!,
      name: space!.name,
      description: space!.description,
    });

    const firstSaveCount =
      store.getState().workspace.spaces.find((s) => s.id === activeSpaceId)?.snapshot.components.length ?? 0;

    expect(firstSaveCount).toBe(1);

    store.getState().loadSpace(activeSpaceId!);

    store.getState().saveSpace({
      spaceId: activeSpaceId!,
      name: space!.name,
      description: space!.description,
    });

    const secondSaveCount =
      store.getState().workspace.spaces.find((s) => s.id === activeSpaceId)?.snapshot.components.length ?? 0;

    expect(secondSaveCount).toBe(1);
  });

  it("preserves pinned components once while switching between spaces", () => {
    const store = createTestStore();
    const state = store.getState();
    const firstSpaceId = state.activeSpaceId!;

    state.addComponent({
      typeId: "github.activity-timeline",
      config: { repo: "assistant-ui/assistant-ui" },
      meta: { pinned: true, label: "global-pinned" },
    });
    state.addComponent({
      typeId: "github.pr-list",
      config: { repo: "assistant-ui/assistant-ui", state: "open" },
    });

    const firstSpace = store.getState().workspace.spaces.find((s) => s.id === firstSpaceId)!;
    store.getState().saveSpace({
      spaceId: firstSpaceId,
      name: firstSpace.name,
      description: firstSpace.description,
    });

    const secondSpaceId = store.getState().createEmptySpace({ name: "Second", switchTo: false });
    store.getState().loadSpace(secondSpaceId);

    const afterSecondLoad = store.getState().canvas.components;
    expect(afterSecondLoad.filter((c) => c.meta.pinned)).toHaveLength(1);
    expect(afterSecondLoad.filter((c) => !c.meta.pinned)).toHaveLength(0);

    store.getState().addComponent({
      typeId: "github.commits",
      config: { repo: "assistant-ui/assistant-ui", limit: 5 },
    });

    const secondSpace = store.getState().workspace.spaces.find((s) => s.id === secondSpaceId)!;
    store.getState().saveSpace({
      spaceId: secondSpaceId,
      name: secondSpace.name,
      description: secondSpace.description,
    });

    store.getState().loadSpace(firstSpaceId);
    const backToFirst = store.getState().canvas.components;
    expect(backToFirst.filter((c) => c.meta.pinned)).toHaveLength(1);
    expect(backToFirst.filter((c) => !c.meta.pinned)).toHaveLength(1);

    store.getState().loadSpace(secondSpaceId);
    const backToSecond = store.getState().canvas.components;
    expect(backToSecond.filter((c) => c.meta.pinned)).toHaveLength(1);
    expect(backToSecond.filter((c) => !c.meta.pinned)).toHaveLength(1);
  });

  it("loads pinned components from snapshot when canvas has none", () => {
    const store = createTestStore();
    const state = store.getState();
    const spaceId = state.activeSpaceId!;

    state.addComponent({
      typeId: "github.activity-timeline",
      config: { repo: "assistant-ui/assistant-ui" },
      meta: { pinned: true, label: "persisted-pinned" },
    });

    const space = store.getState().workspace.spaces.find((s) => s.id === spaceId)!;
    store.getState().saveSpace({
      spaceId,
      name: space.name,
      description: space.description,
    });

    store.getState().clearCanvas(false);
    expect(store.getState().canvas.components).toHaveLength(0);

    store.getState().loadSpace(spaceId);

    const loaded = store.getState().canvas.components;
    expect(loaded).toHaveLength(1);
    expect(loaded[0].meta.pinned).toBe(true);
  });
});
