import { describe, expect, it } from "vitest";

import type { MorningBriefV02 } from "../../src/contracts/brief-v0.2";
import { REQUIRED_V1_SECTION_IDS } from "../../src/contracts/view-v1";
import { projectBriefToV1Sections } from "../../src/core/project-v1-sections";

describe("projectBriefToV1Sections", () => {
  it("renders all required sections in deterministic order", () => {
    const brief: MorningBriefV02 = {
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

    const view = projectBriefToV1Sections(brief);

    expect(view.schema_version).toBe("v1");
    expect(view.sections.map((section) => section.id)).toEqual([...REQUIRED_V1_SECTION_IDS]);
  });

  it("uses non-empty fallbacks when source fields are empty", () => {
    const brief: MorningBriefV02 = {
      schema_version: "v0.2",
      generated_at: "2026-02-12T16:00:00.000Z",
      mission: {
        title: "",
        rationale: "",
        horizon: "today",
      },
      priorities: [],
      evidence: [],
      assumptions: [],
      quick_reaction_prompt: "",
    };

    const view = projectBriefToV1Sections(brief);
    for (const section of view.sections) {
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });
});
