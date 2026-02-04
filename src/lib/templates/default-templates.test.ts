import { describe, expect, it } from "vitest";
import type { CanvasContext, StateSnapshot } from "@/types";
import { compileTemplateToCommands, deriveIntent } from "./engine";
import { DEFAULT_TEMPLATES } from "./default-templates";

const baseState: StateSnapshot = {
  timestamp: 0,
  timezone: "UTC",
  focus: 0.6,
  energy: 0.6,
  stress: 0.3,
  timePressure: 0.4,
  interruptibility: 0.5,
  ambientLight: "normal",
  noiseLevel: "moderate",
  motionContext: "still",
  mode: "monitor",
  signals: [],
};

const baseContext: CanvasContext = {
  components: [],
  temporal: {
    timestamp: "2026-02-03T00:00:00Z",
    timezone: "UTC",
    dayOfWeek: "tuesday",
    timeOfDay: "morning",
    isWorkHours: true,
  },
  workspace: {
    id: "ws_1",
    name: "Test",
    activeSpaceId: null,
    savedSpaces: [],
    componentCount: 0,
    gridUtilization: 0,
  },
  budget: {
    maxTokens: 4000,
    usedTokens: 0,
    maxComponents: 20,
    summarizationLevel: "full",
  },
};

describe("default templates", () => {
  it("compile into component.create commands", () => {
    const intent = deriveIntent(baseState, baseContext);

    for (const template of DEFAULT_TEMPLATES) {
      const result = compileTemplateToCommands({
        template,
        intent,
        state: baseState,
        context: baseContext,
        overrides: { repo: "example/repo" },
      });

      expect(result.command.type === "component.create" || result.command.type === "batch").toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    }
  });
});
