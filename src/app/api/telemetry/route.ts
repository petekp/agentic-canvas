import { NextRequest } from "next/server";
import { appendTelemetry, listTelemetry, sanitizeTelemetryData } from "@/lib/telemetry";

interface TelemetryPayload {
  level?: "info" | "warn" | "error";
  source?: string;
  event?: string;
  data?: unknown;
  ts?: string;
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as TelemetryPayload;
    const level =
      payload.level === "warn" || payload.level === "error" ? payload.level : "info";
    const source = typeof payload.source === "string" ? payload.source : "unknown";
    const event = typeof payload.event === "string" ? payload.event : "event";
    const data = sanitizeTelemetryData(payload.data);
    const ts = typeof payload.ts === "string" ? payload.ts : undefined;

    await appendTelemetry({ level, source, event, data, ts });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[telemetry] Ingest error:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 100;
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.min(500, Math.floor(limit)) : 100;
  const events = listTelemetry(safeLimit);
  return Response.json({ events });
}
