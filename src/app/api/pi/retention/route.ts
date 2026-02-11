import path from "node:path";
import { NextRequest } from "next/server";
import { runPiRetentionJobs } from "@/lib/pi-retention";
import { appendTelemetry } from "@/lib/telemetry";

interface RetentionRequestBody {
  nowMs?: unknown;
}

const DEFAULT_RUNTIME_ROOT = path.join(process.cwd(), ".runtime", "pi");

function parseNowMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function isAuthorized(req: NextRequest): boolean {
  const configuredToken = process.env.PI_RETENTION_API_TOKEN?.trim();
  if (!configuredToken) return true;
  const providedToken = parseBearerToken(req.headers.get("authorization"));
  return providedToken === configuredToken;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RetentionRequestBody = {};
  try {
    body = (await req.json()) as RetentionRequestBody;
  } catch {
    // Allow empty body for cron callers.
  }

  const runtimeRoot = process.env.PI_RUNTIME_ROOT ?? DEFAULT_RUNTIME_ROOT;

  const nowMs = parseNowMs(body.nowMs);

  try {
    const result = await runPiRetentionJobs({
      runtimeRoot,
      nowMs,
    });

    await appendTelemetry({
      level: "info",
      source: "api.pi.retention",
      event: "run",
      data: {
        ...result,
      },
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    await appendTelemetry({
      level: "error",
      source: "api.pi.retention",
      event: "run_error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Retention run failed" },
      { status: 500 }
    );
  }
}
