import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { runPiRetentionJobs } from "@/lib/pi-retention";
import { appendTelemetry } from "@/lib/telemetry";

vi.mock("@/lib/pi-retention", () => ({
  runPiRetentionJobs: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  appendTelemetry: vi.fn(),
}));

describe("PI retention API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runPiRetentionJobs).mockResolvedValue({
      sessionsScanned: 1,
      snapshotsWritten: 2,
      episodesCompacted: 3,
      episodesDeleted: 4,
      ledgerDeleted: 5,
      snapshotsDeleted: 6,
      memoryDeleted: 7,
    });
    vi.mocked(appendTelemetry).mockResolvedValue(undefined);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs retention and returns job metrics", async () => {
    const { POST } = await import("@/app/api/pi/retention/route");

    const req = new Request("http://localhost/api/pi/retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nowMs: 12345 }),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      result: {
        sessionsScanned: 1,
        snapshotsWritten: 2,
        episodesCompacted: 3,
        episodesDeleted: 4,
        ledgerDeleted: 5,
        snapshotsDeleted: 6,
        memoryDeleted: 7,
      },
    });
    expect(runPiRetentionJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        nowMs: 12345,
      })
    );
  });

  it("rejects unauthorized requests when PI_RETENTION_API_TOKEN is set", async () => {
    const { POST } = await import("@/app/api/pi/retention/route");
    vi.stubEnv("PI_RETENTION_API_TOKEN", "top-secret");

    const req = new Request("http://localhost/api/pi/retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload).toEqual({ error: "Unauthorized" });
    expect(runPiRetentionJobs).not.toHaveBeenCalled();
  });

  it("accepts bearer token when PI_RETENTION_API_TOKEN is set", async () => {
    const { POST } = await import("@/app/api/pi/retention/route");
    vi.stubEnv("PI_RETENTION_API_TOKEN", "top-secret");

    const req = new Request("http://localhost/api/pi/retention", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer top-secret",
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req as unknown as NextRequest);

    expect(res.status).toBe(200);
    expect(runPiRetentionJobs).toHaveBeenCalledTimes(1);
  });
});
