import { describe, expect, it } from "vitest";
import { COMPONENT_TYPES, CONTENT_RENDERERS } from "@/lib/component-registry";

describe("morning brief component scaffold", () => {
  it("registers a renderer for system.morning-brief", () => {
    expect(CONTENT_RENDERERS["system.morning-brief"]).toBeTruthy();
  });

  it("registers a component type entry for system.morning-brief", () => {
    const entry = COMPONENT_TYPES.find(
      (component) => component.typeId === "system.morning-brief"
    );

    expect(entry).toBeTruthy();
    expect(entry?.category).toBe("briefing");
    expect(entry?.queryType).toBe("morning_brief");
  });
});
