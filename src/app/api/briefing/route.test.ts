import { describe, expect, it, vi, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { MorningBriefReasonerOutput } from "@/lib/morning-brief";

const mockGenerateObject = vi.fn();

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-model"),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateObject: (...args: unknown[]) => mockGenerateObject(...args),
  };
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("Briefing API route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGenerateObject.mockReset();
    delete process.env.OPENAI_API_KEY;
    delete process.env.MORNING_BRIEF_REASONER_MODE;
  });

  it("aggregates data across multiple repos", async () => {
    const { POST } = await import("@/app/api/briefing/route");
    const now = Date.now();
    const since = now - 60 * 60 * 1000;

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlString = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (urlString.endsWith("/api/github")) {
        if (body.type === "pull_requests") {
          const repo = body.params.repo;
          return jsonResponse({
            data: [
              {
                id: `pr_${repo}`,
                number: repo === "owner/repo1" ? 12 : 34,
                title: repo === "owner/repo1" ? "Fix login" : "Update docs",
                author: "maintainer",
                state: "open",
                labels: [],
                createdAt: since + 1000,
                updatedAt: since + 2000,
              },
            ],
            ttl: 1000,
          });
        }
        if (body.type === "issues") {
          const repo = body.params.repo;
          return jsonResponse({
            data: [
              {
                id: `issue_${repo}`,
                number: repo === "owner/repo1" ? 56 : 78,
                title: repo === "owner/repo1" ? "Bug report" : "Feature request",
                author: "contributor",
                state: "open",
                labels: [],
                createdAt: since + 1500,
              },
            ],
            ttl: 1000,
          });
        }
        if (body.type === "team_activity") {
          return jsonResponse({
            data: {
              repo: body.params.repo,
              timeWindow: "7d",
              totalCommits: 3,
              contributors: [],
              daily: [],
            },
            ttl: 1000,
          });
        }
      }

      if (urlString.endsWith("/api/slack")) {
        if (body.type === "channel_activity") {
          return jsonResponse({
            data: [
              {
                ts: "1",
                user: "Sam",
                text: "Morning update",
                timestamp: since + 3000,
              },
            ],
            ttl: 1000,
          });
        }
      }

      if (urlString.endsWith("/api/vercel")) {
        return jsonResponse({
          data: [
            {
              id: "dep_1",
              name: "web",
              url: null,
              state: "READY",
              createdAt: since + 4000,
              target: "production",
              commit: null,
              creator: "vercel",
            },
          ],
          ttl: 1000,
        });
      }

      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        since,
        repos: ["owner/repo1", "owner/repo2"],
        slackChannels: [{ id: "C123", name: "general" }],
        vercelProjectId: "proj_123",
        generateNarrative: false,
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.summary).toMatch(/Across 2 repos/i);

    const sections = payload.data.sections as Array<{ title: string; items: Array<{ text: string }> }>;
    const prSection = sections.find((section) => section.title === "PRs Needing Review");
    expect(prSection).toBeTruthy();
    expect(prSection?.items.some((item) => item.text.includes("repo1"))).toBe(true);
    expect(prSection?.items.some((item) => item.text.includes("repo2"))).toBe(true);

    const issueSection = sections.find((section) => section.title === "New Issues");
    expect(issueSection).toBeTruthy();
    expect(issueSection?.items.some((item) => item.text.includes("repo1"))).toBe(true);
    expect(issueSection?.items.some((item) => item.text.includes("repo2"))).toBe(true);
  });

  it("returns MorningBriefComponentData when outputType is morning_brief", async () => {
    const { POST } = await import("@/app/api/briefing/route");
    const now = Date.now();
    const since = now - 60 * 60 * 1000;

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlString = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (urlString.endsWith("/api/github")) {
        if (body.type === "pull_requests") {
          return jsonResponse({
            data: [
              {
                id: "pr_1",
                number: 12,
                title: "Fix login blocker",
                author: "maintainer",
                state: "open",
                labels: ["critical"],
                createdAt: since + 1000,
                updatedAt: since + 2000,
              },
            ],
            ttl: 1000,
          });
        }
        if (body.type === "issues") {
          return jsonResponse({
            data: [
              {
                id: "issue_1",
                number: 56,
                title: "Checkout error",
                author: "contributor",
                state: "open",
                labels: ["bug"],
                createdAt: since + 3000,
              },
            ],
            ttl: 1000,
          });
        }
        if (body.type === "team_activity") {
          return jsonResponse({
            data: {
              repo: body.params.repo,
              timeWindow: "7d",
              totalCommits: 3,
              contributors: [],
              daily: [],
            },
            ttl: 1000,
          });
        }
      }

      if (urlString.endsWith("/api/slack")) {
        if (body.type === "mentions") {
          return jsonResponse({
            data: [
              {
                ts: "1",
                user: "Sam",
                text: "@pete this is blocked on deploy",
                channel: "general",
                permalink: "https://slack.com/message/1",
                timestamp: since + 4000,
              },
            ],
            ttl: 1000,
          });
        }
      }

      if (urlString.endsWith("/api/vercel")) {
        return jsonResponse({
          data: [
            {
              id: "dep_1",
              name: "web",
              url: null,
              state: "ERROR",
              createdAt: since + 5000,
              target: "production",
              commit: null,
              creator: "vercel",
            },
          ],
          ttl: 1000,
        });
      }

      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        since,
        outputType: "morning_brief",
        repos: ["owner/repo1"],
        slackUserId: "U123",
        vercelProjectId: "proj_123",
        generateNarrative: false,
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.state).toBe("presented");
    expect(payload.data.current.mission.title).toMatch(/stabilize|unblock|reduce/i);
    expect(payload.data.current.evidence.length).toBeGreaterThan(0);
    expect(payload.data.current.levers.length).toBeGreaterThanOrEqual(2);
    expect(payload.data.current.freshnessSummary).toContain("Freshness range");
  });

  it("adds fallback evidence and assumptions when configured sources are empty", async () => {
    const { POST } = await import("@/app/api/briefing/route");

    globalThis.fetch = vi.fn(async () => {
      throw new Error("No upstream fetch expected for empty source configuration");
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outputType: "morning_brief",
        repos: [],
        generateNarrative: false,
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.current.evidence.length).toBeGreaterThan(0);
    expect(payload.data.current.freshnessSummary).toMatch(/minutes/i);
    expect(payload.data.current.assumptions.length).toBeGreaterThan(0);
    expect(payload.data.current.mission.rationale).toMatch(/based on evidence|because/i);
  });

  it("emits v0.2 priority and readiness fields with PostHog synthesis", async () => {
    const { POST } = await import("@/app/api/briefing/route");
    const now = Date.now();
    const since = now - 2 * 60 * 60 * 1000;

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlString = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (urlString.endsWith("/api/github")) {
        if (body.type === "pull_requests") {
          return jsonResponse({
            data: [
              {
                id: "pr_1",
                number: 101,
                title: "Ship onboarding improvements",
                author: "maintainer",
                state: "open",
                labels: ["critical"],
                createdAt: since + 1_000,
                updatedAt: since + 2_000,
              },
            ],
            ttl: 1_000,
          });
        }
        if (body.type === "issues") {
          return jsonResponse({
            data: [
              {
                id: "issue_1",
                number: 55,
                title: "Signup drop on mobile",
                author: "contributor",
                state: "open",
                labels: ["bug"],
                createdAt: since + 3_000,
              },
            ],
            ttl: 1_000,
          });
        }
        if (body.type === "team_activity") {
          return jsonResponse({
            data: {
              repo: "owner/repo1",
              timeWindow: "7d",
              totalCommits: 8,
              contributors: [{ login: "petekp", avatar: "", commits: 4, lastActive: now, themes: [], recentCommits: [] }],
              daily: [],
            },
            ttl: 1_000,
          });
        }
      }

      if (urlString.endsWith("/api/slack")) {
        if (body.type === "mentions") {
          return jsonResponse({
            data: [
              {
                ts: "1",
                user: "Sam",
                text: "@pete checkout funnel is dropping after latest deploy",
                channel: "team-updates",
                permalink: "https://slack.com/message/1",
                timestamp: since + 4_000,
              },
            ],
            ttl: 1_000,
          });
        }
      }

      if (urlString.endsWith("/api/vercel")) {
        return jsonResponse({
          data: [
            {
              id: "dep_1",
              name: "web",
              url: "https://web.vercel.app",
              state: "ERROR",
              createdAt: since + 5_000,
              target: "production",
              commit: { sha: "abc", message: "Release", ref: "main", author: "petekp" },
              creator: "vercel",
            },
          ],
          ttl: 1_000,
        });
      }

      if (urlString.endsWith("/api/posthog")) {
        if (body.type === "site_health") {
          return jsonResponse({
            data: {
              uniqueVisitors: 2100,
              pageviews: 8400,
              newVisitorRatio: 0.34,
              daily: [
                { date: "2026-02-11", visitors: 1000 },
                { date: "2026-02-12", visitors: 1100 },
              ],
            },
            ttl: 1_000,
          });
        }
        if (body.type === "top_pages") {
          return jsonResponse({
            data: {
              pages: [
                { path: "/signup", property: "app.example.com", views: 2300 },
                { path: "/pricing", property: "app.example.com", views: 1200 },
              ],
            },
            ttl: 1_000,
          });
        }
      }

      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        since,
        outputType: "morning_brief",
        repos: ["owner/repo1"],
        slackUserId: "U123",
        vercelProjectId: "proj_123",
        posthogProperties: ["app.example.com"],
        posthogTimeWindow: "7d",
        generateNarrative: false,
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.state).toBe("presented");

    const current = payload.data.current as {
      priorities?: Array<{ rank: number; scores?: { composite?: number } }>;
      verification?: unknown[];
      actionDirectory?: { availableNow?: Array<{ app: string; actions: string[] }> };
      weeklyCheckin?: { ready?: boolean; bullets?: string[]; gaps?: string[] };
      sourceReadiness?: Array<{ source: string; available: boolean }>;
      correlations?: Array<{ sources?: string[] }>;
    };

    expect(Array.isArray(current.priorities)).toBe(true);
    expect((current.priorities ?? []).length).toBeGreaterThan(0);
    expect((current.priorities ?? []).length).toBeLessThanOrEqual(3);
    expect(current.priorities?.[0]?.rank).toBe(1);
    expect(
      (current.priorities ?? [])[0]?.scores?.composite >=
        ((current.priorities ?? [])[1]?.scores?.composite ?? 0)
    ).toBe(true);

    expect(Array.isArray(current.verification)).toBe(true);
    expect(current.actionDirectory?.availableNow?.some((entry) => entry.app === "posthog")).toBe(true);
    expect(Array.isArray(current.weeklyCheckin?.bullets)).toBe(true);
    expect(Array.isArray(current.weeklyCheckin?.gaps)).toBe(true);
    expect(
      current.sourceReadiness?.some((entry) => entry.source === "posthog" && entry.available)
    ).toBe(true);
    expect(
      current.correlations?.some((story) => (story.sources ?? []).includes("posthog"))
    ).toBe(true);
  });

  it("uses LLM reasoner output and repairs evidence references", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { POST } = await import("@/app/api/briefing/route");
    const now = Date.now();
    const since = now - 6 * 60 * 60 * 1000;

    mockGenerateObject.mockResolvedValue({
      object: {
        mission: {
          title: "Protect release reliability before traffic impact compounds",
          whyNow: "Deploy risk and active traffic are converging on the same path.",
          confidenceScore: 77,
          certainty: "medium",
        },
        confidence: "medium",
        priorities: [
          {
            id: "priority_1",
            rank: 1,
            title: "Resolve deployment instability",
            recommendation: "Stabilize failed deploy before additional merges.",
            approach: "Inspect failing deployment and gate risky merges.",
            whyHighestImpact: "Production errors impact active visitors immediately.",
            horizon: "today",
            scores: {
              impact: 90,
              urgency: 88,
              ownershipFit: 80,
              confidence: 72,
              composite: 85,
            },
            certainty: "medium",
            ownershipHypothesis: {
              likelyOwner: "me",
              rationale: "Directly owned release path.",
              needsVerification: false,
            },
            relatedEvidenceIds: ["ev_dep_dep_1", "ev_missing"],
            primaryActions: [
              {
                id: "act_1",
                label: "Open failing deployment",
                app: "vercel",
                type: "open_link",
                payload: { url: "https://vercel.com/deployments/dep_1" },
                expectedOutcome: "Identify and mitigate root cause.",
              },
            ],
          },
          {
            id: "priority_2",
            rank: 2,
            title: "Clear blocker issue queue",
            recommendation: "Triage blocker issues in active repo.",
            approach: "Classify severity and assign owners.",
            whyHighestImpact: "Backlog pressure slows this week's execution.",
            horizon: "today",
            scores: {
              impact: 80,
              urgency: 76,
              ownershipFit: 75,
              confidence: 70,
              composite: 77,
            },
            certainty: "medium",
            ownershipHypothesis: {
              likelyOwner: "shared",
              rationale: "Needs product + engineering alignment.",
              needsVerification: true,
            },
            relatedEvidenceIds: ["ev_issue_issue_1"],
            primaryActions: [
              {
                id: "act_2",
                label: "Open issue",
                app: "github",
                type: "open_link",
                payload: { url: "https://github.com/owner/repo1/issues/56" },
                expectedOutcome: "Set owner and next action.",
              },
            ],
          },
          {
            id: "priority_3",
            rank: 3,
            title: "Acknowledge blocker communication",
            recommendation: "Reply in blocker thread with owner and ETA.",
            approach: "Confirm owner, timeline, and follow-up action.",
            whyHighestImpact: "Coordination lag increases delivery risk.",
            horizon: "today",
            scores: {
              impact: 73,
              urgency: 70,
              ownershipFit: 68,
              confidence: 66,
              composite: 70,
            },
            certainty: "medium",
            ownershipHypothesis: {
              likelyOwner: "shared",
              rationale: "Cross-team dependency.",
              needsVerification: true,
            },
            relatedEvidenceIds: ["ev_slack_mention_1"],
            primaryActions: [
              {
                id: "act_3",
                label: "Open Slack thread",
                app: "slack",
                type: "open_link",
                payload: { url: "https://slack.com/message/1" },
                expectedOutcome: "Close the ownership gap quickly.",
              },
            ],
          },
        ],
        correlations: [
          {
            id: "corr_1",
            headline: "Traffic + deploy failures overlap",
            claim: "PostHog and Vercel indicate elevated release impact risk.",
            sources: ["posthog", "vercel"],
            relatedEvidenceIds: ["ev_posthog_visitors", "ev_dep_dep_1", "ev_fake"],
            confidenceScore: 74,
            certainty: "medium",
          },
        ],
        assumptions: [],
        verification: [],
        weeklyCheckin: {
          ready: true,
          bullets: ["Release risk was identified and triaged."],
          gaps: [],
        },
      } as MorningBriefReasonerOutput,
    });

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlString = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (urlString.endsWith("/api/github")) {
        if (body.type === "pull_requests") {
          return jsonResponse({
            data: [
              {
                id: "pr_1",
                number: 12,
                title: "Fix login blocker",
                author: "maintainer",
                state: "open",
                labels: ["critical"],
                createdAt: since + 1000,
                updatedAt: since + 2000,
              },
            ],
            ttl: 1000,
          });
        }
        if (body.type === "issues") {
          return jsonResponse({
            data: [
              {
                id: "issue_1",
                number: 56,
                title: "Checkout error",
                author: "contributor",
                state: "open",
                labels: ["bug"],
                createdAt: since + 3000,
              },
            ],
            ttl: 1000,
          });
        }
        if (body.type === "team_activity") {
          return jsonResponse({
            data: {
              repo: body.params.repo,
              timeWindow: "7d",
              totalCommits: 3,
              contributors: [],
              daily: [],
            },
            ttl: 1000,
          });
        }
      }

      if (urlString.endsWith("/api/slack")) {
        if (body.type === "mentions") {
          return jsonResponse({
            data: [
              {
                ts: "1",
                user: "Sam",
                text: "@pete this is blocked on deploy",
                channel: "general",
                permalink: "https://slack.com/message/1",
                timestamp: since + 4000,
              },
            ],
            ttl: 1000,
          });
        }
      }

      if (urlString.endsWith("/api/vercel")) {
        return jsonResponse({
          data: [
            {
              id: "dep_1",
              name: "web",
              url: "https://vercel.com/deployments/dep_1",
              state: "ERROR",
              createdAt: since + 5000,
              target: "production",
              commit: null,
              creator: "vercel",
            },
          ],
          ttl: 1000,
        });
      }

      if (urlString.endsWith("/api/posthog")) {
        if (body.type === "site_health") {
          return jsonResponse({
            data: {
              uniqueVisitors: 2100,
              pageviews: 8400,
              newVisitorRatio: 0.34,
              daily: [
                { date: "2026-02-11", visitors: 1000 },
                { date: "2026-02-12", visitors: 1100 },
              ],
            },
            ttl: 1000,
          });
        }
        if (body.type === "top_pages") {
          return jsonResponse({
            data: {
              pages: [{ path: "/signup", property: "app.example.com", views: 2300 }],
            },
            ttl: 1000,
          });
        }
      }

      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        since,
        outputType: "morning_brief",
        repos: ["owner/repo1"],
        slackUserId: "U123",
        vercelProjectId: "proj_123",
        posthogProperties: ["app.example.com"],
        reasoningMode: "llm",
        generateNarrative: false,
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);

    const current = payload.data.current as {
      priorities: Array<{ rank: number; relatedEvidenceIds: string[] }>;
      evidence: Array<{ id: string }>;
      assumptions: Array<{ reason: string }>;
      correlations: Array<{ relatedEvidenceIds: string[] }>;
    };

    expect(current.priorities).toHaveLength(3);
    expect(current.priorities.map((item) => item.rank)).toEqual([1, 2, 3]);

    const evidenceIds = new Set(current.evidence.map((item) => item.id));
    for (const priority of current.priorities) {
      for (const related of priority.relatedEvidenceIds) {
        expect(evidenceIds.has(related)).toBe(true);
      }
    }
    for (const story of current.correlations) {
      for (const related of story.relatedEvidenceIds) {
        expect(evidenceIds.has(related)).toBe(true);
      }
    }

    expect(current.assumptions.some((item) => item.reason === "stale_data")).toBe(true);
  });

  it("runs a repair pass for invalid LLM output and falls back when repair fails", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { POST } = await import("@/app/api/briefing/route");
    const now = Date.now();
    const since = now - 60 * 60 * 1000;

    mockGenerateObject
      .mockResolvedValueOnce({ object: { mission: { title: "invalid" } } })
      .mockRejectedValueOnce(new Error("repair timeout"));

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlString = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (urlString.endsWith("/api/github")) {
        if (body.type === "pull_requests") {
          return jsonResponse({
            data: [
              {
                id: "pr_1",
                number: 12,
                title: "Fix login blocker",
                author: "maintainer",
                state: "open",
                labels: ["critical"],
                createdAt: since + 1000,
                updatedAt: since + 2000,
              },
            ],
            ttl: 1000,
          });
        }
        if (body.type === "issues") {
          return jsonResponse({
            data: [
              {
                id: "issue_1",
                number: 56,
                title: "Checkout error",
                author: "contributor",
                state: "open",
                labels: ["bug"],
                createdAt: since + 3000,
              },
            ],
            ttl: 1000,
          });
        }
        if (body.type === "team_activity") {
          return jsonResponse({
            data: {
              repo: body.params.repo,
              timeWindow: "7d",
              totalCommits: 3,
              contributors: [],
              daily: [],
            },
            ttl: 1000,
          });
        }
      }

      if (urlString.endsWith("/api/vercel")) {
        return jsonResponse({
          data: [
            {
              id: "dep_1",
              name: "web",
              url: null,
              state: "ERROR",
              createdAt: since + 5000,
              target: "production",
              commit: null,
              creator: "vercel",
            },
          ],
          ttl: 1000,
        });
      }

      if (urlString.endsWith("/api/slack")) {
        return jsonResponse({ data: [], ttl: 1000 });
      }

      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        since,
        outputType: "morning_brief",
        repos: ["owner/repo1"],
        vercelProjectId: "proj_123",
        reasoningMode: "llm",
        generateNarrative: false,
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(payload.data.current.mission.title).toMatch(/stabilize|unblock|reduce/i);
    expect(Array.isArray(payload.data.current.priorities)).toBe(true);
    expect(payload.data.current.priorities.length).toBeGreaterThan(0);
  });
});
