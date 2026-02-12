export const BRIEF_V02_SCHEMA_VERSION = "v0.2" as const;

export type BriefSchemaVersion = typeof BRIEF_V02_SCHEMA_VERSION;

export type BriefEvidenceSource =
  | "github"
  | "slack"
  | "vercel"
  | "posthog"
  | "custom";

export type BriefConfidence = "low" | "medium" | "high";

export type BriefAssumptionReason =
  | "missing_data"
  | "stale_data"
  | "conflict"
  | "insufficient_sample";

export interface BriefMissionV02 {
  title: string;
  rationale: string;
  horizon: "today" | "this_week";
}

export interface BriefPriorityV02 {
  id: string;
  rank: number;
  headline: string;
  summary: string;
  confidence: BriefConfidence;
  evidence_refs: string[];
  verification_prompt?: string;
}

export interface BriefEvidenceV02 {
  id: string;
  source: BriefEvidenceSource;
  entity: string;
  metric: string;
  value_text: string;
  observed_at: string;
  freshness_minutes: number;
  link?: string;
}

export interface BriefAssumptionV02 {
  id: string;
  text: string;
  reason: BriefAssumptionReason;
  source_scope: BriefEvidenceSource[];
}

export interface MorningBriefV02 {
  schema_version: BriefSchemaVersion;
  generated_at: string;
  mission: BriefMissionV02;
  priorities: BriefPriorityV02[];
  evidence: BriefEvidenceV02[];
  assumptions: BriefAssumptionV02[];
  quick_reaction_prompt: string;
}

export interface BriefReasonerInput {
  mission_hint?: string;
  evidence?: Array<Partial<BriefEvidenceV02>>;
}

export function buildFallbackBrief(
  input: BriefReasonerInput,
  generatedAtIso: string
): MorningBriefV02 {
  const evidence = (input.evidence ?? [])
    .map((item, index): BriefEvidenceV02 => {
      const id = item.id?.trim() || `seed-e${index + 1}`;
      const source = item.source ?? "custom";
      return {
        id,
        source,
        entity: item.entity?.trim() || "workspace",
        metric: item.metric?.trim() || "signal",
        value_text: item.value_text?.trim() || "No numeric value provided",
        observed_at: item.observed_at || generatedAtIso,
        freshness_minutes:
          typeof item.freshness_minutes === "number" && item.freshness_minutes >= 0
            ? item.freshness_minutes
            : 0,
        link: item.link,
      };
    })
    .filter((item) => item.id.length > 0);

  const normalizedEvidence =
    evidence.length > 0
      ? evidence
      : [
          {
            id: "seed-e1",
            source: "custom",
            entity: "workspace",
            metric: "signal",
            value_text: "No upstream evidence was provided",
            observed_at: generatedAtIso,
            freshness_minutes: 0,
          },
        ];

  const missionTitle =
    input.mission_hint?.trim() || "Stabilize today's highest-risk thread";

  return {
    schema_version: BRIEF_V02_SCHEMA_VERSION,
    generated_at: generatedAtIso,
    mission: {
      title: missionTitle,
      rationale:
        "Fallback brief generated because model output failed validation. Verify evidence before acting.",
      horizon: "today",
    },
    priorities: [
      {
        id: "fallback-p1",
        rank: 1,
        headline: missionTitle,
        summary: "Start with the highest-confidence signal, then request a refreshed brief.",
        confidence: "medium",
        evidence_refs: [normalizedEvidence[0].id],
      },
    ],
    evidence: normalizedEvidence,
    assumptions: [],
    quick_reaction_prompt:
      "Quick reaction: accept, reframe, or snooze this fallback mission.",
  };
}
