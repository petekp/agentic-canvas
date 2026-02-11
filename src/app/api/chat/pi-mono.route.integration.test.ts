import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { resetPiRuntimeEngineResolverForTests } from "@/lib/pi-runtime";

describe("chat route with external pi-mono runtime module", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPiRuntimeEngineResolverForTests();
  });

  it("streams assistant-ui response via PI_RUNTIME_ENGINE_MODULE", async () => {
    const modulePath = path.join(process.cwd(), "src/lib/pi-mono-runtime-engine.mjs");
    vi.stubEnv("PI_RUNTIME_ENGINE_MODULE", pathToFileURL(modulePath).href);
    vi.stubEnv("PI_MONO_DRY_RUN", "1");
    vi.stubEnv("PI_EPISODE_LOG_DISABLED", "1");

    const { POST } = await import("@/app/api/chat/route");

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] }],
        canvas: {
          grid: { columns: 12, rows: 8 },
          components: [],
        },
        workspaceId: "ws_pi_mono",
        threadId: "thread_pi_mono",
        activeSpaceId: "space_pi_mono",
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("pi-mono dry run");
  });

  it.runIf(process.env.PI_MONO_LIVE_TEST === "1" && Boolean(process.env.OPENAI_API_KEY))(
    "streams with live pi-mono provider integration",
    async () => {
      const modulePath = path.join(process.cwd(), "src/lib/pi-mono-runtime-engine.mjs");
      vi.stubEnv("PI_RUNTIME_ENGINE_MODULE", pathToFileURL(modulePath).href);
      vi.stubEnv("PI_MONO_PROVIDER", "openai");
      vi.stubEnv("PI_MONO_MODEL", "gpt-4o-mini");
      vi.stubEnv("PI_EPISODE_LOG_DISABLED", "1");

      const { POST } = await import("@/app/api/chat/route");

      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              id: "m1",
              role: "user",
              parts: [{ type: "text", text: "Reply in exactly two words." }],
            },
          ],
          canvas: {
            grid: { columns: 12, rows: 8 },
            components: [],
          },
          workspaceId: "ws_pi_mono_live",
          threadId: "thread_pi_mono_live",
          activeSpaceId: "space_pi_mono_live",
        }),
      });

      const res = await POST(req as unknown as NextRequest);
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(body.length).toBeGreaterThan(0);
      expect(body).toContain("finish");
    }
  );
});
