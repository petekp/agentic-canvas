import { NextRequest } from "next/server";

import {
  reasonMorningBrief,
  type BriefEvidenceV02,
  type BriefReasonerInput,
} from "@/lib/agentic-canvas-v2";
import { appendTelemetry } from "@/lib/telemetry";

interface BriefingV2ScheduleConfig {
  enabled: boolean;
  timezone: string;
  hour: number;
  minute: number;
  time_local: string;
}

type QuickReactionKind =
  | "accept"
  | "reframe"
  | "deprioritize"
  | "not_my_responsibility"
  | "replace_objective"
  | "snooze";

interface QuickReactionInput {
  kind: QuickReactionKind;
  note?: string;
}

interface QuickReactionWriteback {
  recorded_at: string;
  reaction: {
    kind: QuickReactionKind;
    note?: string;
  };
  applied_to_brief_generated_at: string;
  status: "recorded";
}

interface BriefingV2Request {
  schedule?: Partial<{
    enabled: boolean;
    timezone: string;
    hour: number;
    minute: number;
  }>;
  mission_hint?: string;
  evidence?: Array<Partial<BriefEvidenceV02>>;
  reaction?: QuickReactionInput;
  llm_candidate?: unknown;
  repair_candidate?: unknown;
}

function clampHour(hour: number | undefined): number {
  if (typeof hour !== "number" || !Number.isFinite(hour)) return 8;
  return Math.max(0, Math.min(23, Math.trunc(hour)));
}

function clampMinute(minute: number | undefined): number {
  if (typeof minute !== "number" || !Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(59, Math.trunc(minute)));
}

function normalizeSchedule(input?: BriefingV2Request["schedule"]): BriefingV2ScheduleConfig {
  const timezone =
    typeof input?.timezone === "string" && input.timezone.trim().length > 0
      ? input.timezone.trim()
      : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const hour = clampHour(input?.hour);
  const minute = clampMinute(input?.minute);
  return {
    enabled: input?.enabled !== false,
    timezone,
    hour,
    minute,
    time_local: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function normalizeReasonerInput(body: BriefingV2Request): BriefReasonerInput {
  return {
    mission_hint: body.mission_hint,
    evidence: Array.isArray(body.evidence) ? body.evidence : [],
  };
}

function normalizeReaction(
  reaction: BriefingV2Request["reaction"]
): QuickReactionInput | undefined {
  if (!reaction) return undefined;
  const allowed: QuickReactionKind[] = [
    "accept",
    "reframe",
    "deprioritize",
    "not_my_responsibility",
    "replace_objective",
    "snooze",
  ];
  if (!allowed.includes(reaction.kind)) {
    return undefined;
  }
  return {
    kind: reaction.kind,
    note: reaction.note?.trim() || undefined,
  };
}

function makeWriteback(
  reaction: QuickReactionInput | undefined,
  briefGeneratedAt: string,
  nowIso: string
): QuickReactionWriteback | null {
  if (!reaction) return null;
  return {
    recorded_at: nowIso,
    reaction,
    applied_to_brief_generated_at: briefGeneratedAt,
    status: "recorded",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BriefingV2Request;
    const schedule = normalizeSchedule(body.schedule);
    const nowIso = new Date().toISOString();
    const reasonerInput = normalizeReasonerInput(body);

    await appendTelemetry({
      level: "info",
      source: "api.briefing.v2",
      event: "request",
      data: {
        schedule,
        hasReaction: Boolean(body.reaction),
        hasMockCandidate: body.llm_candidate !== undefined,
        hasMockRepairCandidate: body.repair_candidate !== undefined,
      },
    });

    const precomputed = await reasonMorningBrief({
      input: reasonerInput,
      synthesize:
        body.llm_candidate !== undefined
          ? async () => body.llm_candidate
          : undefined,
      repair:
        body.repair_candidate !== undefined
          ? async () => body.repair_candidate
          : undefined,
    });

    const reaction = normalizeReaction(body.reaction);
    const writeback = makeWriteback(reaction, precomputed.brief.generated_at, nowIso);

    const responsePayload = {
      schedule,
      precomputed: {
        brief: precomputed.brief,
        telemetry: precomputed.telemetry,
        issues: precomputed.issues,
      },
      view: precomputed.view,
      writeback,
    };

    await appendTelemetry({
      level: "info",
      source: "api.briefing.v2",
      event: "response",
      data: {
        reasoning_mode: precomputed.telemetry.reasoning_mode,
        repair_used: precomputed.telemetry.repair_used,
        fallback_reason: precomputed.telemetry.fallback_reason,
        duration_ms: precomputed.telemetry.duration_ms,
      },
    });

    return Response.json({ data: responsePayload, ttl: 300000 }, { status: 200 });
  } catch (error) {
    await appendTelemetry({
      level: "error",
      source: "api.briefing.v2",
      event: "error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });

    return Response.json(
      { error: error instanceof Error ? error.message : "Briefing v2 error" },
      { status: 500 }
    );
  }
}
