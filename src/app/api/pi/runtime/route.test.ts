import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { resetPiRuntimeEngineResolverForTests } from "@/lib/pi-runtime";
import { appendTelemetry } from "@/lib/telemetry";

vi.mock("@/lib/telemetry", () => ({
  appendTelemetry: vi.fn(),
}));

describe("PI runtime diagnostics API route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPiRuntimeEngineResolverForTests();
    vi.clearAllMocks();
    vi.mocked(appendTelemetry).mockResolvedValue(undefined);
  });

  it("returns 404 when diagnostics are disabled", async () => {
    const { GET } = await import("@/app/api/pi/runtime/route");

    const req = new Request("http://localhost/api/pi/runtime", {
      method: "GET",
    });

    const res = await GET(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(404);
    expect(payload).toEqual({ error: "Not found" });
  });

  it("returns fallback runtime diagnostics when no external module is configured", async () => {
    vi.stubEnv("PI_RUNTIME_DIAGNOSTICS_ENABLED", "1");
    vi.stubEnv("PI_EPISODE_LOG_DISABLED", "1");

    const { GET } = await import("@/app/api/pi/runtime/route");

    const req = new Request("http://localhost/api/pi/runtime", {
      method: "GET",
    });

    const res = await GET(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status, JSON.stringify(payload)).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.diagnostics.engine).toMatchObject({
      id: "internal.ai-sdk",
      source: "internal",
      configuredModule: null,
      loadedModule: null,
      loadedExport: null,
      loadError: null,
    });
  });

  it("returns external runtime diagnostics when module is configured", async () => {
    vi.stubEnv("PI_RUNTIME_DIAGNOSTICS_ENABLED", "1");
    vi.stubEnv("PI_EPISODE_LOG_DISABLED", "1");

    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-runtime-diagnostics-"));
    const modulePath = path.join(runtimeRoot, "external-engine.mjs");
    await fs.writeFile(
      modulePath,
      [
        "export const piRuntimeEngine = {",
        "  id: 'external-diagnostics-engine',",
        "  stream() {",
        "    return { toUIMessageStreamResponse() { return new Response('ok'); } };",
        "  },",
        "};",
      ].join("\n"),
      "utf8"
    );

    vi.stubEnv("PI_RUNTIME_ENGINE_MODULE", modulePath);

    const { GET } = await import("@/app/api/pi/runtime/route");

    const req = new Request("http://localhost/api/pi/runtime", {
      method: "GET",
    });

    const res = await GET(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status, JSON.stringify(payload)).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.diagnostics.engine).toMatchObject({
      id: "external-diagnostics-engine",
      source: "external",
      configuredModule: modulePath,
      loadedModule: modulePath,
      loadedExport: "piRuntimeEngine",
      loadError: null,
    });
  });

  it("reports external engine load failures while falling back to internal runtime", async () => {
    vi.stubEnv("PI_RUNTIME_DIAGNOSTICS_ENABLED", "1");
    vi.stubEnv("PI_EPISODE_LOG_DISABLED", "1");
    vi.stubEnv("PI_RUNTIME_ENGINE_MODULE", "/tmp/does-not-exist-pi-engine.mjs");

    const { GET } = await import("@/app/api/pi/runtime/route");

    const req = new Request("http://localhost/api/pi/runtime", {
      method: "GET",
    });

    const res = await GET(req as unknown as NextRequest);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.diagnostics.engine.id).toBe("internal.ai-sdk");
    expect(payload.diagnostics.engine.source).toBe("internal");
    expect(payload.diagnostics.engine.configuredModule).toBe("/tmp/does-not-exist-pi-engine.mjs");
    expect(payload.diagnostics.engine.loadedModule).toBe("/tmp/does-not-exist-pi-engine.mjs");
    expect(payload.diagnostics.engine.loadError).toContain("does-not-exist-pi-engine.mjs");
  });
});
