import { describe, expect, it } from "vitest";
import type { MorningBriefComponentData } from "@/types";
import {
  appendMorningBriefOverride,
  canTransitionMorningBriefState,
  transitionMorningBriefState,
  validateMorningBriefComponentData,
  validateMorningBriefReasonerOutput,
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

  it("preserves v0.2 fields on validated payloads", () => {
    const payload = createMorningBriefData() as unknown as Record<string, unknown>;
    const current = payload.current as Record<string, unknown>;

    current.priorities = [
      {
        id: "priority_1",
        rank: 1,
        title: "Protect signup conversion while deployment health recovers",
        recommendation: "Roll back and triage the failing release.",
        approach: "Coordinate with on-call and isolate the recent risky diff.",
        whyHighestImpact: "Conversion is dropping during active traffic.",
        horizon: "today",
        scores: {
          impact: 92,
          urgency: 86,
          ownershipFit: 80,
          confidence: 70,
          composite: 84,
        },
        certainty: "medium",
        ownershipHypothesis: {
          likelyOwner: "shared",
          rationale: "Requires engineering + product coordination.",
          needsVerification: true,
        },
        relatedEvidenceIds: ["ev_1"],
        primaryActions: [
          {
            id: "act_1",
            label: "Open deployment error",
            app: "vercel",
            type: "open_link",
            expectedOutcome: "Identify root cause and mitigation path.",
          },
        ],
      },
    ];
    current.sourceReadiness = [
      { source: "github", available: true, freshnessMinutes: 5 },
      { source: "posthog", available: true, freshnessMinutes: 8 },
    ];
    current.verification = [
      {
        id: "verify_1",
        prompt: "Confirm who owns signup drop mitigation this morning.",
        reason: "ownership_uncertain",
      },
    ];

    const result = validateMorningBriefComponentData(payload);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const validatedCurrent = result.data.current as unknown as {
      priorities?: Array<{ id: string; rank: number }>;
      sourceReadiness?: Array<{ source: string; available: boolean }>;
      verification?: Array<{ id: string; reason: string }>;
    };
    expect(validatedCurrent.priorities?.[0]?.id).toBe("priority_1");
    expect(validatedCurrent.priorities?.[0]?.rank).toBe(1);
    expect(validatedCurrent.sourceReadiness?.some((entry) => entry.source === "posthog")).toBe(
      true
    );
    expect(validatedCurrent.verification?.[0]?.reason).toBe("ownership_uncertain");
  });

  it("rejects invalid v0.2 priority ranks when priorities are present", () => {
    const payload = createMorningBriefData() as unknown as Record<string, unknown>;
    const current = payload.current as Record<string, unknown>;

    current.priorities = [
      {
        id: "priority_bad",
        rank: 4,
        title: "Invalid rank priority",
        recommendation: "Do a thing",
        approach: "Do it carefully",
        whyHighestImpact: "Because",
        horizon: "today",
        scores: {
          impact: 80,
          urgency: 70,
          ownershipFit: 60,
          confidence: 50,
          composite: 71,
        },
        certainty: "low",
        ownershipHypothesis: {
          likelyOwner: "unknown",
          rationale: "Not enough context",
          needsVerification: true,
        },
        relatedEvidenceIds: ["ev_1"],
        primaryActions: [],
      },
    ];

    const result = validateMorningBriefComponentData(payload);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.join(" ")).toContain("priorities");
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

describe("morning brief reasoner validation", () => {
  it("accepts a valid reasoner payload", () => {
    const result = validateMorningBriefReasonerOutput({
      mission: {
        title: "Stabilize release path",
        whyNow: "Deployment failures coincide with active traffic.",
        confidenceScore: 74,
        certainty: "medium",
      },
      confidence: "medium",
      priorities: [
        {
          id: "priority_1",
          rank: 1,
          title: "Resolve failing deployment",
          recommendation: "Fix release blocker before new merges.",
          approach: "Open deployment logs, identify regression, and patch.",
          whyHighestImpact: "Production errors affect all active sessions.",
          horizon: "today",
          scores: {
            impact: 90,
            urgency: 88,
            ownershipFit: 80,
            confidence: 75,
            composite: 85,
          },
          certainty: "medium",
          ownershipHypothesis: {
            likelyOwner: "me",
            rationale: "Direct ownership of deploy pipeline.",
            needsVerification: false,
          },
          relatedEvidenceIds: ["ev_1"],
          primaryActions: [
            {
              id: "action_1",
              label: "Open failing deployment",
              app: "vercel",
              type: "open_link",
              expectedOutcome: "Identify root cause quickly.",
            },
          ],
        },
      ],
      correlations: [],
      assumptions: [
        {
          id: "assumption_1",
          text: "Slack signal may be incomplete due to token scope.",
          reason: "missing_data",
          sourceScope: ["slack"],
          relatedSource: "slack",
          impact: "medium",
        },
      ],
      verification: [
        {
          id: "verify_1",
          prompt: "Is this still the top KPI for this week?",
          reason: "ownership_uncertain",
        },
      ],
      weeklyCheckin: {
        ready: true,
        bullets: ["Mitigated release risk on the highest traffic path."],
        gaps: [],
      },
    });

    expect(result.valid).toBe(true);
  });

  it("rejects reasoner payloads with more than three priorities", () => {
    const priority = {
      id: "priority",
      rank: 1,
      title: "Item",
      recommendation: "Do it",
      approach: "How",
      whyHighestImpact: "Why",
      horizon: "today",
      scores: {
        impact: 80,
        urgency: 70,
        ownershipFit: 60,
        confidence: 50,
        composite: 67,
      },
      certainty: "low",
      ownershipHypothesis: {
        likelyOwner: "unknown",
        rationale: "unknown",
        needsVerification: true,
      },
      relatedEvidenceIds: ["ev_1"],
      primaryActions: [],
    } as const;

    const result = validateMorningBriefReasonerOutput({
      mission: {
        title: "Too many priorities",
        whyNow: "Testing cap",
        confidenceScore: 40,
        certainty: "low",
      },
      confidence: "low",
      priorities: [priority, { ...priority, id: "p2", rank: 2 }, { ...priority, id: "p3", rank: 3 }, { ...priority, id: "p4", rank: 3 }],
      correlations: [],
      assumptions: [],
      verification: [],
      weeklyCheckin: {
        ready: false,
        bullets: [],
        gaps: [],
      },
    });

    expect(result.valid).toBe(false);
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
