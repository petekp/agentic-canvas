import { describe, expect, it } from "vitest";
import type { MorningBriefComponentData } from "@/types";
import {
  appendMorningBriefOverride,
  canTransitionMorningBriefState,
  transitionMorningBriefState,
  validateMorningBriefComponentData,
} from "@/lib/morning-brief";

function createMorningBriefData(
  state: MorningBriefComponentData["state"] = "presented"
): MorningBriefComponentData {
  return {
    current: {
      version: 2,
      generatedAt: "2026-02-11T08:00:00.000Z",
      generatedBy: "assistant",
      mission: {
        id: "mission_1",
        title: "Stabilize release readiness",
        rationale: "Open blockers and failed deploys increased in the past 12 hours.",
        owner: "Pete",
        horizon: "today",
        priorityScore: 84,
      },
      evidence: [
        {
          id: "ev_1",
          source: "github",
          entity: "agentic-canvas",
          metric: "open_blockers",
          valueText: "4",
          valueNumber: 4,
          observedAt: "2026-02-11T07:45:00.000Z",
          freshnessMinutes: 15,
          link: "https://github.com/petepetrash/agentic-canvas/issues",
          confidence: "high",
        },
      ],
      levers: [
        {
          id: "lever_1",
          label: "Triage blocker issues",
          actionType: "update_component",
          actionPayload: { componentId: "cmp_1" },
          expectedImpact: "Reduce release risk by clarifying ownership.",
          impactScore: 72,
          confidence: "medium",
        },
      ],
      assumptions: [
        {
          id: "assume_1",
          text: "Slack mention volume is lower due to missing user token.",
          reason: "missing_data",
          sourceScope: ["slack"],
        },
      ],
      confidence: "medium",
      freshnessSummary: "GitHub fresh (15m), Slack missing",
    },
    history: [
      {
        version: 1,
        generatedAt: "2026-02-10T08:00:00.000Z",
        mission: {
          id: "mission_0",
          title: "Clear review queue",
          rationale: "Review backlog exceeded baseline.",
          owner: "Pete",
          horizon: "today",
          priorityScore: 70,
        },
        confidence: "medium",
      },
    ],
    state,
    userOverrides: [],
  };
}

describe("morning brief validation", () => {
  it("accepts a valid morning brief payload", () => {
    const result = validateMorningBriefComponentData(createMorningBriefData());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.state).toBe("presented");
      expect(result.data.current.mission.priorityScore).toBe(84);
    }
  });

  it("rejects invalid lifecycle state", () => {
    const payload = createMorningBriefData() as unknown as Record<string, unknown>;
    payload.state = "unknown";

    const result = validateMorningBriefComponentData(payload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.join(" ")).toContain("state");
    }
  });
});

describe("morning brief lifecycle transitions", () => {
  it("allows transitions that match the lifecycle graph", () => {
    expect(canTransitionMorningBriefState("presented", "accepted")).toBe(true);
    expect(canTransitionMorningBriefState("accepted", "activated")).toBe(true);
    expect(canTransitionMorningBriefState("monitoring", "resolved")).toBe(true);
  });

  it("rejects transitions that skip required states", () => {
    expect(canTransitionMorningBriefState("presented", "monitoring")).toBe(false);
    expect(canTransitionMorningBriefState("accepted", "resolved")).toBe(false);
  });

  it("applies valid state transitions", () => {
    const payload = createMorningBriefData("presented");
    const next = transitionMorningBriefState(payload, "accepted");

    expect(next.state).toBe("accepted");
  });

  it("throws for invalid state transitions", () => {
    const payload = createMorningBriefData("presented");

    expect(() => transitionMorningBriefState(payload, "monitoring")).toThrow(
      "Invalid Morning Brief lifecycle transition"
    );
  });
});

describe("morning brief overrides", () => {
  it("appends override and transitions to accepted on accept", () => {
    const payload = createMorningBriefData("presented");
    const updated = appendMorningBriefOverride(payload, {
      type: "accept",
      note: "Looks right",
    });

    expect(updated.userOverrides).toHaveLength(1);
    expect(updated.userOverrides[0].actor).toBe("user");
    expect(updated.state).toBe("accepted");
  });

  it("appends non-accept overrides and reframes when possible", () => {
    const payload = createMorningBriefData("presented");
    const updated = appendMorningBriefOverride(payload, {
      type: "replace_objective",
      note: "Focus on launch blocker triage",
      payload: { objective: "Launch blockers only" },
    });

    expect(updated.userOverrides).toHaveLength(1);
    expect(updated.userOverrides[0].type).toBe("replace_objective");
    expect(updated.state).toBe("reframed");
  });
});
