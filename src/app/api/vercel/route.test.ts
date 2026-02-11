import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

function textResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

describe("Vercel API route", () => {
  const originalToken = process.env.VERCEL_TOKEN;

  beforeEach(() => {
    process.env.VERCEL_TOKEN = "vercel-test-token";
  });

  afterEach(() => {
    process.env.VERCEL_TOKEN = originalToken;
    vi.restoreAllMocks();
  });

  it("returns 403 when Vercel API forbids access", async () => {
    const { POST } = await import("@/app/api/vercel/route");

    globalThis.fetch = vi.fn(async () =>
      textResponse(
        { error: { code: "forbidden", message: "Not authorized" } },
        false,
        403
      )
    ) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/vercel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "deployments",
        params: { projectId: "proj_123" },
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.error).toMatch(/Not authorized/i);
  });
});
