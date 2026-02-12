import { describe, expect, it } from "vitest";

import type { MorningBriefV02 } from "../../src/contracts/brief-v0.2";
import { reasonMorningBrief } from "../../src/core/reasoner";

function makeValidBrief(overrides?: Partial<MorningBriefV02>): MorningBriefV02 {
  return {
    schema_version: "v0.2",
    generated_at: "2026-02-12T16:00:00.000Z",
    mission: {
      title: "Stabilize release readiness",
      rationale: "Focus on top blockers first.",
      horizon: "today",
    },
    priorities: [
      {
        id: "p1",
        rank: 1,
        headline: "Clear blocker queue",
        summary: "Unblock open dependencies before noon.",
        confidence: "high",
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
        observed_at: "2026-02-12T15:40:00.000Z",
        freshness_minutes: 20,
      },
    ],
    assumptions: [],
    quick_reaction_prompt: "Does this mission look right?",
    ...overrides,
  };
}

describe("reasonMorningBrief", () => {
  it("returns llm mode when first attempt is valid", async () => {
    const brief = makeValidBrief();
    const result = await reasonMorningBrief({
      input: { mission_hint: "Release readiness" },
      synthesize: async () => brief,
    });

    expect(result.brief).toEqual(brief);
    expect(result.telemetry.reasoning_mode).toBe("llm");
    expect(result.telemetry.attempt).toBe(1);
    expect(result.telemetry.validation_fail).toBe(false);
    expect(result.telemetry.repair_used).toBe(false);
    expect(result.telemetry.fallback_reason).toBeUndefined();
  });

  it("uses one bounded repair attempt", async () => {
    const invalid = makeValidBrief({
      priorities: [
        {
          id: "bad",
          rank: 1,
          headline: "No evidence refs",
          summary: "Invalid output should force repair.",
          confidence: "high",
          evidence_refs: [],
        },
      ],
    });
    const repaired = makeValidBrief({
      priorities: [
        {
          id: "fixed",
          rank: 1,
          headline: "Fixed priority",
          summary: "Now has evidence references.",
          confidence: "high",
          evidence_refs: ["e1"],
        },
      ],
    });

    const result = await reasonMorningBrief({
      input: { mission_hint: "Release readiness" },
      synthesize: async () => invalid,
      repair: async () => repaired,
    });

    expect(result.brief.priorities[0]?.id).toBe("fixed");
    expect(result.telemetry.reasoning_mode).toBe("llm");
    expect(result.telemetry.attempt).toBe(2);
    expect(result.telemetry.validation_fail).toBe(true);
    expect(result.telemetry.repair_used).toBe(true);
  });

  it("fails closed to fallback after invalid repair", async () => {
    const invalid = makeValidBrief({
      priorities: [
        {
          id: "bad",
          rank: 4,
          headline: "Out of bounds rank",
          summary: "Invalid rank should fail validation.",
          confidence: "low",
          evidence_refs: [],
        },
      ],
    });

    const result = await reasonMorningBrief({
      input: {
        mission_hint: "Release readiness",
        evidence: [{ id: "upstream-evidence", source: "slack", value_text: "Thread is blocked" }],
      },
      synthesize: async () => invalid,
      repair: async () => invalid,
    });

    expect(result.telemetry.reasoning_mode).toBe("fallback");
    expect(result.telemetry.repair_used).toBe(true);
    expect(result.telemetry.fallback_reason).toBe("validation_failed");
    expect(result.view.sections).toHaveLength(4);
    for (const section of result.view.sections) {
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });
});
