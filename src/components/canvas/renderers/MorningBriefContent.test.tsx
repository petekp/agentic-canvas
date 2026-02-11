// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MorningBriefComponentData } from "@/types";
import { MorningBriefContent } from "@/components/canvas/renderers/MorningBriefContent";

const mockApplyMorningBriefOverrideAction = vi.fn();
const mockRunMorningBriefTrigger = vi.fn(() => Promise.resolve());

vi.mock("@/store", () => ({
  useStore: (selector: (state: {
    applyMorningBriefOverrideAction: typeof mockApplyMorningBriefOverrideAction;
    runMorningBriefTrigger: typeof mockRunMorningBriefTrigger;
  }) => unknown) =>
    selector({
      applyMorningBriefOverrideAction: mockApplyMorningBriefOverrideAction,
      runMorningBriefTrigger: mockRunMorningBriefTrigger,
    }),
}));

function createBriefData(): MorningBriefComponentData {
  return {
    current: {
      version: 1,
      generatedAt: "2026-02-11T08:00:00.000Z",
      generatedBy: "assistant",
      mission: {
        id: "mission_primary",
        title: "Stabilize release readiness",
        rationale: "Based on evidence, deployment failures and blocker issues are rising.",
        owner: "You",
        horizon: "today",
        priorityScore: 82,
      },
      evidence: [
        {
          id: "ev_1",
          source: "github",
          entity: "owner/repo",
          metric: "open_issue",
          valueText: "Issue #42: Checkout failure",
          observedAt: "2026-02-11T07:55:00.000Z",
          freshnessMinutes: 5,
          confidence: "high",
        },
      ],
      levers: [
        {
          id: "lever_1",
          label: "Triage blocker issue #42",
          actionType: "manual",
          expectedImpact: "Reduce production risk before next deploy.",
          impactScore: 80,
          confidence: "high",
        },
        {
          id: "lever_2",
          label: "Verify rollback plan with on-call",
          actionType: "manual",
          expectedImpact: "Lower recovery time if deploy fails.",
          impactScore: 72,
          confidence: "medium",
        },
      ],
      assumptions: [
        {
          id: "assumption_1",
          text: "Slack outage may have hidden mention volume.",
          reason: "missing_data",
          sourceScope: ["slack"],
        },
      ],
      confidence: "medium",
      freshnessSummary: "Freshness range 5-5 minutes; stale items 0.",
    },
    history: [],
    state: "presented",
    userOverrides: [],
  };
}

describe("MorningBriefContent", () => {
  beforeEach(() => {
    mockApplyMorningBriefOverrideAction.mockReset();
    mockRunMorningBriefTrigger.mockReset();
    mockRunMorningBriefTrigger.mockResolvedValue(undefined);
  });

  it("renders contract-critical evidence, confidence, and lever bullets", () => {
    render(<MorningBriefContent data={createBriefData()} componentId="cmp_morning" />);

    expect(screen.getByRole("heading", { name: "Evidence" })).toBeTruthy();
    expect(screen.getByText("Confidence: Medium")).toBeTruthy();

    const leversHeading = screen.getByRole("heading", { name: "Top Levers" });
    const leversSection = leversHeading.closest("section");
    expect(leversSection).toBeTruthy();
    if (!leversSection) {
      throw new Error("Top Levers section is required");
    }

    expect(within(leversSection).getAllByRole("listitem")).toHaveLength(2);
  });

  it("does not duplicate lever text when expected impact equals label", () => {
    const brief = createBriefData();
    brief.current.levers = [
      {
        id: "lever_dup",
        label: "Confirm integrations are connected.",
        actionType: "manual",
        expectedImpact: "Confirm integrations are connected.",
        impactScore: 60,
        confidence: "medium",
      },
    ];

    render(<MorningBriefContent data={brief} componentId="cmp_morning" />);

    expect(screen.getAllByText("Confirm integrations are connected.")).toHaveLength(1);
  });
});
