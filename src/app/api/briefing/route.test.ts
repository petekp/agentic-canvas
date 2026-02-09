import { describe, expect, it, vi, afterEach } from "vitest";
import type { NextRequest } from "next/server";

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
});
