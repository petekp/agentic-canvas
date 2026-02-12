import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

import {
  BRIEF_V02_SCHEMA_VERSION,
  buildFallbackBrief,
  type BriefReasonerInput,
  type MorningBriefV02,
} from "../contracts/brief-v0.2";
import { projectBriefToV1Sections } from "./project-v1-sections";
import type { BriefReasonerResult, FallbackReason } from "./telemetry";
import { validateBriefV02, type BriefValidationIssue } from "./validate";

const DEFAULT_MODEL = "gpt-5.2-mini";

interface SynthesizeArgs {
  input: BriefReasonerInput;
  attempt: 1 | 2;
  previousCandidate?: unknown;
  issues?: BriefValidationIssue[];
}

type SynthesizeFn = (args: SynthesizeArgs) => Promise<unknown>;

export interface ReasonMorningBriefOptions {
  input: BriefReasonerInput;
  synthesize?: SynthesizeFn;
  repair?: SynthesizeFn;
  now?: () => number;
  model?: string;
}

function normalizeCandidate(
  candidate: unknown,
  input: BriefReasonerInput,
  generatedAtIso: string
): MorningBriefV02 {
  const fallback = buildFallbackBrief(input, generatedAtIso);
  if (!candidate || typeof candidate !== "object") {
    return fallback;
  }

  const raw = candidate as Partial<MorningBriefV02>;
  const rawMission =
    raw.mission && typeof raw.mission === "object" ? raw.mission : fallback.mission;

  return {
    schema_version:
      raw.schema_version === BRIEF_V02_SCHEMA_VERSION
        ? BRIEF_V02_SCHEMA_VERSION
        : BRIEF_V02_SCHEMA_VERSION,
    generated_at:
      typeof raw.generated_at === "string" && raw.generated_at.trim().length > 0
        ? raw.generated_at
        : generatedAtIso,
    mission: {
      title:
        typeof rawMission.title === "string"
          ? rawMission.title
          : fallback.mission.title,
      rationale:
        typeof rawMission.rationale === "string"
          ? rawMission.rationale
          : fallback.mission.rationale,
      horizon:
        rawMission.horizon === "today" || rawMission.horizon === "this_week"
          ? rawMission.horizon
          : fallback.mission.horizon,
    },
    priorities: Array.isArray(raw.priorities)
      ? raw.priorities.map((priority, index) => ({
          id:
            typeof priority.id === "string" && priority.id.trim().length > 0
              ? priority.id
              : `priority-${index + 1}`,
          rank: typeof priority.rank === "number" ? priority.rank : index + 1,
          headline:
            typeof priority.headline === "string" ? priority.headline : "Untitled priority",
          summary: typeof priority.summary === "string" ? priority.summary : "",
          confidence:
            priority.confidence === "low" ||
            priority.confidence === "medium" ||
            priority.confidence === "high"
              ? priority.confidence
              : "medium",
          evidence_refs: Array.isArray(priority.evidence_refs)
            ? priority.evidence_refs.filter(
                (value): value is string => typeof value === "string"
              )
            : [],
          verification_prompt:
            typeof priority.verification_prompt === "string"
              ? priority.verification_prompt
              : undefined,
        }))
      : [],
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.map((item, index) => ({
          id:
            typeof item.id === "string" && item.id.trim().length > 0
              ? item.id
              : `e${index + 1}`,
          source:
            item.source === "github" ||
            item.source === "slack" ||
            item.source === "vercel" ||
            item.source === "posthog" ||
            item.source === "custom"
              ? item.source
              : "custom",
          entity: typeof item.entity === "string" ? item.entity : "workspace",
          metric: typeof item.metric === "string" ? item.metric : "signal",
          value_text:
            typeof item.value_text === "string" ? item.value_text : "No value provided",
          observed_at:
            typeof item.observed_at === "string" ? item.observed_at : generatedAtIso,
          freshness_minutes:
            typeof item.freshness_minutes === "number" && item.freshness_minutes >= 0
              ? item.freshness_minutes
              : 0,
          link: typeof item.link === "string" ? item.link : undefined,
        }))
      : [],
    assumptions: Array.isArray(raw.assumptions)
      ? raw.assumptions.map((assumption, index) => ({
          id:
            typeof assumption.id === "string" && assumption.id.trim().length > 0
              ? assumption.id
              : `assumption-${index + 1}`,
          text: typeof assumption.text === "string" ? assumption.text : "No assumption text",
          reason:
            assumption.reason === "missing_data" ||
            assumption.reason === "stale_data" ||
            assumption.reason === "conflict" ||
            assumption.reason === "insufficient_sample"
              ? assumption.reason
              : "missing_data",
          source_scope: Array.isArray(assumption.source_scope)
            ? assumption.source_scope.filter(
                (value) =>
                  value === "github" ||
                  value === "slack" ||
                  value === "vercel" ||
                  value === "posthog" ||
                  value === "custom"
              )
            : ["custom"],
        }))
      : [],
    quick_reaction_prompt:
      typeof raw.quick_reaction_prompt === "string"
        ? raw.quick_reaction_prompt
        : fallback.quick_reaction_prompt,
  };
}

async function synthesizeWithModel({
  input,
  attempt,
  previousCandidate,
  issues,
  model,
}: SynthesizeArgs & { model: string }): Promise<unknown> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for v2 synthesis");
  }

  const schemaGuide = `Return a JSON object with keys:
- schema_version: "v0.2"
- generated_at: ISO-8601 string
- mission: { title, rationale, horizon }
- priorities: up to 3 entries (rank 1..3, evidence_refs required)
- evidence: entries with id/source/entity/metric/value_text/observed_at/freshness_minutes
- assumptions: entries with id/text/reason/source_scope
- quick_reaction_prompt: string`;

  const prompt =
    attempt === 1
      ? `Input:\n${JSON.stringify(input, null, 2)}`
      : `Repair the previous candidate so it passes validation.\nIssues:\n${JSON.stringify(
          issues ?? [],
          null,
          2
        )}\nCandidate:\n${JSON.stringify(previousCandidate, null, 2)}`;

  const { text } = await generateText({
    model: openai(model),
    system: `You generate morning brief JSON. ${schemaGuide}. Output raw JSON only.`,
    prompt,
  });

  return parseJsonCandidate(text);
}

function parseJsonCandidate(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("Model returned empty text");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

function buildFallbackResult({
  input,
  generatedAtIso,
  issues,
  now,
  startedAt,
  attempt,
  validationFail,
  repairUsed,
  fallbackReason,
}: {
  input: BriefReasonerInput;
  generatedAtIso: string;
  issues: BriefValidationIssue[];
  now: () => number;
  startedAt: number;
  attempt: 1 | 2;
  validationFail: boolean;
  repairUsed: boolean;
  fallbackReason: FallbackReason;
}): BriefReasonerResult {
  const brief = buildFallbackBrief(input, generatedAtIso);
  return {
    brief,
    view: projectBriefToV1Sections(brief),
    issues,
    telemetry: {
      reasoning_mode: "fallback",
      schema_version: BRIEF_V02_SCHEMA_VERSION,
      attempt,
      validation_fail: validationFail,
      repair_used: repairUsed,
      fallback_reason: fallbackReason,
      duration_ms: Math.max(0, now() - startedAt),
    },
  };
}

export async function reasonMorningBrief(
  options: ReasonMorningBriefOptions
): Promise<BriefReasonerResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const generatedAtIso = new Date(startedAt).toISOString();
  const synthesize =
    options.synthesize ??
    ((args: SynthesizeArgs) => synthesizeWithModel({ ...args, model: options.model ?? DEFAULT_MODEL }));
  const repair = options.repair ?? synthesize;

  let attemptedRepair = false;

  try {
    const initialRaw = await synthesize({ input: options.input, attempt: 1 });
    const initialCandidate = normalizeCandidate(initialRaw, options.input, generatedAtIso);
    const initialValidation = validateBriefV02(initialCandidate);

    if (initialValidation.ok) {
      return {
        brief: initialCandidate,
        view: projectBriefToV1Sections(initialCandidate),
        issues: [],
        telemetry: {
          reasoning_mode: "llm",
          schema_version: BRIEF_V02_SCHEMA_VERSION,
          attempt: 1,
          validation_fail: false,
          repair_used: false,
          duration_ms: Math.max(0, now() - startedAt),
        },
      };
    }

    attemptedRepair = true;
    const repairRaw = await repair({
      input: options.input,
      attempt: 2,
      previousCandidate: initialRaw,
      issues: initialValidation.issues,
    });
    const repairedCandidate = normalizeCandidate(repairRaw, options.input, generatedAtIso);
    const repairedValidation = validateBriefV02(repairedCandidate);

    if (repairedValidation.ok) {
      return {
        brief: repairedCandidate,
        view: projectBriefToV1Sections(repairedCandidate),
        issues: [],
        telemetry: {
          reasoning_mode: "llm",
          schema_version: BRIEF_V02_SCHEMA_VERSION,
          attempt: 2,
          validation_fail: true,
          repair_used: true,
          duration_ms: Math.max(0, now() - startedAt),
        },
      };
    }

    return buildFallbackResult({
      input: options.input,
      generatedAtIso,
      issues: [...initialValidation.issues, ...repairedValidation.issues],
      now,
      startedAt,
      attempt: 2,
      validationFail: true,
      repairUsed: true,
      fallbackReason: "validation_failed",
    });
  } catch {
    return buildFallbackResult({
      input: options.input,
      generatedAtIso,
      issues: [],
      now,
      startedAt,
      attempt: attemptedRepair ? 2 : 1,
      validationFail: attemptedRepair,
      repairUsed: attemptedRepair,
      fallbackReason: "llm_error",
    });
  }
}
