import { describe, expect, it } from "vitest";

import type { MorningBriefV02 } from "../../src/contracts/brief-v0.2";
import { validateBriefV02 } from "../../src/core/validate";

const baseBrief: MorningBriefV02 = {
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
      headline: "Top priority",
      summary: "Act now",
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
};

describe("validateBriefV02", () => {
  it("rejects priorities over hard cap and duplicate ranks", () => {
    const candidate: MorningBriefV02 = {
      ...baseBrief,
      priorities: [
        { ...baseBrief.priorities[0], id: "p1", rank: 1 },
        { ...baseBrief.priorities[0], id: "p2", rank: 1 },
        { ...baseBrief.priorities[0], id: "p3", rank: 2 },
        { ...baseBrief.priorities[0], id: "p4", rank: 3 },
      ],
    };

    const result = validateBriefV02(candidate);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "too_many_priorities")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "duplicate_rank")).toBe(true);
  });

  it("requires evidence refs and verification prompt for low confidence priorities", () => {
    const candidate: MorningBriefV02 = {
      ...baseBrief,
      priorities: [
        {
          ...baseBrief.priorities[0],
          confidence: "low",
          evidence_refs: [],
          verification_prompt: undefined,
        },
      ],
    };

    const result = validateBriefV02(candidate);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "missing_evidence_ref")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "verification_prompt_required")).toBe(
      true
    );
  });
});
