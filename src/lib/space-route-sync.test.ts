// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { SPACE_NAVIGATE_EVENT, syncSpaceRoute } from "@/lib/space-route-sync";

describe("syncSpaceRoute", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/spaces");
  });

  it("emits a navigation event from spaces list to target space", () => {
    let nextSpaceId = "";
    window.addEventListener(
      SPACE_NAVIGATE_EVENT,
      ((event: Event) => {
        const custom = event as CustomEvent<{ spaceId: string }>;
        nextSpaceId = custom.detail.spaceId;
      }) as EventListener,
      { once: true }
    );

    syncSpaceRoute("space_new");
    expect(nextSpaceId).toBe("space_new");
  });

  it("emits navigation event between space detail routes", () => {
    window.history.replaceState({}, "", "/spaces/space_old");
    let nextSpaceId = "";
    window.addEventListener(
      SPACE_NAVIGATE_EVENT,
      ((event: Event) => {
        const custom = event as CustomEvent<{ spaceId: string }>;
        nextSpaceId = custom.detail.spaceId;
      }) as EventListener,
      { once: true }
    );

    syncSpaceRoute("space_next");
    expect(nextSpaceId).toBe("space_next");
  });

  it("does nothing outside spaces routes", () => {
    window.history.replaceState({}, "", "/settings");
    syncSpaceRoute("space_ignore");
    expect(window.location.pathname).toBe("/settings");
  });

  it("does nothing when already at target route", () => {
    window.history.replaceState({}, "", "/spaces/space_same");
    syncSpaceRoute("space_same");
    expect(window.location.pathname).toBe("/spaces/space_same");
  });
});
