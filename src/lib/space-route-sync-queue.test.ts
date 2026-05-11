import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginAssistantToolExecution,
  getAssistantRunActive,
  requestSpaceRouteSync,
  resetSpaceRouteSyncQueueForTests,
  setAssistantRunActive,
  setSpaceRouteSyncFnForTests,
  subscribeAssistantRunActive,
} from "@/lib/space-route-sync-queue";

describe("space route sync queue", () => {
  afterEach(() => {
    resetSpaceRouteSyncQueueForTests();
  });

  it("syncs immediately when no assistant run is active", () => {
    const syncSpy = vi.fn();
    setSpaceRouteSyncFnForTests(syncSpy);

    const result = requestSpaceRouteSync("space_1");

    expect(result).toEqual({ deferred: false });
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith("space_1");
  });

  it("defers sync while an assistant run is active and flushes after completion", () => {
    const syncSpy = vi.fn();
    setSpaceRouteSyncFnForTests(syncSpy);
    setAssistantRunActive(true);

    const result = requestSpaceRouteSync("space_2");
    expect(result).toEqual({ deferred: true });
    expect(syncSpy).not.toHaveBeenCalled();

    setAssistantRunActive(false);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith("space_2");
  });

  it("keeps only the latest deferred space while a run is active", () => {
    const syncSpy = vi.fn();
    setSpaceRouteSyncFnForTests(syncSpy);
    setAssistantRunActive(true);

    requestSpaceRouteSync("space_a");
    requestSpaceRouteSync("space_b");
    requestSpaceRouteSync("space_c");

    expect(syncSpy).not.toHaveBeenCalled();

    setAssistantRunActive(false);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith("space_c");
  });

  it("exposes assistant run state", () => {
    expect(getAssistantRunActive()).toBe(false);

    setAssistantRunActive(true);
    expect(getAssistantRunActive()).toBe(true);

    setAssistantRunActive(false);
    expect(getAssistantRunActive()).toBe(false);
  });

  it("notifies subscribers when assistant run state changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAssistantRunActive(listener);

    setAssistantRunActive(true);
    setAssistantRunActive(true);
    setAssistantRunActive(false);

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setAssistantRunActive(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("treats in-flight tool execution as active and flushes after tool completion", () => {
    const syncSpy = vi.fn();
    setSpaceRouteSyncFnForTests(syncSpy);

    const endToolExecution = beginAssistantToolExecution();
    expect(getAssistantRunActive()).toBe(true);

    const result = requestSpaceRouteSync("space_tool");
    expect(result).toEqual({ deferred: true });
    expect(syncSpy).not.toHaveBeenCalled();

    endToolExecution();
    expect(getAssistantRunActive()).toBe(false);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith("space_tool");
  });

  it("keeps route deferred while tool execution is active even after run flag clears", () => {
    const syncSpy = vi.fn();
    setSpaceRouteSyncFnForTests(syncSpy);
    setAssistantRunActive(true);
    const endToolExecution = beginAssistantToolExecution();

    requestSpaceRouteSync("space_after_run");

    setAssistantRunActive(false);
    expect(getAssistantRunActive()).toBe(true);
    expect(syncSpy).not.toHaveBeenCalled();

    endToolExecution();
    expect(getAssistantRunActive()).toBe(false);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith("space_after_run");
  });
});
