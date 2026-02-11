import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("GitHub API route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns 401 when GITHUB_TOKEN is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { POST } = await import("@/app/api/github/route");
    const req = new Request("http://localhost/api/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "activity",
        params: { repo: "assistant-ui/assistant-ui", limit: 2 },
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload.error).toMatch(/GITHUB_TOKEN not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses Authorization header when token is configured", async () => {
    process.env.GITHUB_TOKEN = "ghp-test";

    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.includes("/events?")) {
        expect((init?.headers as Record<string, string>)?.Authorization).toBe(
          "Bearer ghp-test"
        );
        return jsonResponse([]);
      }
      return jsonResponse({}, false, 404);
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { POST } = await import("@/app/api/github/route");
    const req = new Request("http://localhost/api/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "activity",
        params: { repo: "assistant-ui/assistant-ui", limit: 2 },
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(payload.data)).toBe(true);
  });

  it("fetches user activity when username is provided", async () => {
    process.env.GITHUB_TOKEN = "ghp-test";

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      if (typeof input === "string" && input.includes("/users/petekp/events?per_page=2")) {
        return jsonResponse([
          {
            id: "evt_1",
            type: "PushEvent",
            actor: { login: "petekp" },
            payload: { commits: [], ref: "refs/heads/codex/test-branch" },
            created_at: "2026-02-11T00:00:00Z",
          },
          {
            id: "evt_2",
            type: "PullRequestEvent",
            actor: { login: "petekp" },
            payload: { action: "closed", pull_request: { merged: true } },
            created_at: "2026-02-11T00:00:00Z",
          },
          {
            id: "evt_3",
            type: "DeleteEvent",
            actor: { login: "petekp" },
            payload: { ref_type: "branch", ref: "codex/test-branch" },
            created_at: "2026-02-11T00:00:00Z",
          },
        ]);
      }
      return jsonResponse({}, false, 404);
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { POST } = await import("@/app/api/github/route");
    const req = new Request("http://localhost/api/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "activity",
        params: { username: "petekp", limit: 2 },
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "evt_1",
          actor: "petekp",
          message: "Pushed updates to codex/test-branch",
        }),
        expect.objectContaining({
          id: "evt_2",
          actor: "petekp",
          message: "Merged a PR",
        }),
        expect.objectContaining({
          id: "evt_3",
          actor: "petekp",
          type: "delete",
          message: "Deleted branch: codex/test-branch",
        }),
      ])
    );
    const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/users/petekp/events?per_page=2"))).toBe(true);
  });
});
