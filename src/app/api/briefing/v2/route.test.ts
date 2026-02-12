import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

function makeValidCandidate() {
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
  };
}

describe("Briefing V2 API route", () => {
  it("runs full vertical loop: schedule -> precompute -> render -> writeback", async () => {
    const { POST } = await import("@/app/api/briefing/v2/route");

    const req = new Request("http://localhost/api/briefing/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule: { timezone: "America/New_York", hour: 8, minute: 15 },
        mission_hint: "Release readiness",
        llm_candidate: makeValidCandidate(),
        reaction: { kind: "accept", note: "Looks right." },
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.schedule.time_local).toBe("08:15");
    expect(payload.data.precomputed.telemetry.reasoning_mode).toBe("llm");
    expect(payload.data.view.sections).toHaveLength(4);
    expect(payload.data.writeback.reaction.kind).toBe("accept");
  });

  it("uses bounded repair when first candidate fails validation", async () => {
    const { POST } = await import("@/app/api/briefing/v2/route");

    const invalidCandidate = {
      ...makeValidCandidate(),
      priorities: [
        {
          id: "invalid",
          rank: 1,
          headline: "Bad",
          summary: "Missing evidence refs",
          confidence: "high",
          evidence_refs: [],
        },
      ],
    };

    const req = new Request("http://localhost/api/briefing/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mission_hint: "Release readiness",
        llm_candidate: invalidCandidate,
        repair_candidate: makeValidCandidate(),
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.precomputed.telemetry.attempt).toBe(2);
    expect(payload.data.precomputed.telemetry.repair_used).toBe(true);
    expect(payload.data.precomputed.telemetry.reasoning_mode).toBe("llm");
  });

  it("fails closed to deterministic fallback when repair also fails", async () => {
    const { POST } = await import("@/app/api/briefing/v2/route");

    const invalidCandidate = {
      ...makeValidCandidate(),
      priorities: [
        {
          id: "invalid",
          rank: 4,
          headline: "Bad",
          summary: "Out-of-range rank + no evidence refs",
          confidence: "low",
          evidence_refs: [],
        },
      ],
    };

    const req = new Request("http://localhost/api/briefing/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mission_hint: "Release readiness",
        llm_candidate: invalidCandidate,
        repair_candidate: invalidCandidate,
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.precomputed.telemetry.reasoning_mode).toBe("fallback");
    expect(payload.data.precomputed.telemetry.fallback_reason).toBe("validation_failed");
    expect(payload.data.view.sections).toHaveLength(4);
  });
});
