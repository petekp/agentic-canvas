import type { MorningBriefV02 } from "../contracts/brief-v0.2";
import {
  REQUIRED_V1_SECTION_IDS,
  VIEW_V1_SCHEMA_VERSION,
  type MorningBriefV1Section,
  type MorningBriefViewV1,
} from "../contracts/view-v1";

function nonEmpty(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function buildMissionSection(brief: MorningBriefV02): MorningBriefV1Section {
  const title = nonEmpty(brief.mission.title, "Mission pending");
  const rationale = nonEmpty(
    brief.mission.rationale,
    "No rationale available yet. Request a refresh."
  );

  return {
    id: "mission",
    title: "Mission",
    body: `${title}\n${rationale}`,
  };
}

function buildPrioritiesSection(brief: MorningBriefV02): MorningBriefV1Section {
  const body =
    brief.priorities.length > 0
      ? brief.priorities
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map(
            (priority) =>
              `P${priority.rank}: ${nonEmpty(priority.headline, "Untitled priority")} — ${nonEmpty(
                priority.summary,
                "No summary provided."
              )}`
          )
          .join("\n")
      : "No priorities available yet. Trigger a precompute run.";

  return {
    id: "priorities",
    title: "Top Priorities",
    body: nonEmpty(body, "No priorities available yet."),
  };
}

function buildEvidenceSection(brief: MorningBriefV02): MorningBriefV1Section {
  const body =
    brief.evidence.length > 0
      ? brief.evidence
          .slice(0, 5)
          .map(
            (item) =>
              `${item.id}: ${item.value_text} (${item.source}/${item.entity}, freshness ${item.freshness_minutes}m)`
          )
          .join("\n")
      : "No evidence captured yet. Collect source data before acting.";

  return {
    id: "evidence",
    title: "Evidence",
    body: nonEmpty(body, "No evidence captured yet."),
  };
}

function buildQuickReactionSection(brief: MorningBriefV02): MorningBriefV1Section {
  const lowConfidenceVerification = brief.priorities
    .filter((priority) => priority.confidence === "low")
    .map((priority) => priority.verification_prompt?.trim())
    .filter((prompt): prompt is string => Boolean(prompt && prompt.length > 0));

  const prompt = nonEmpty(
    brief.quick_reaction_prompt,
    "Quick reaction: accept, reframe, or snooze."
  );

  const verificationSuffix =
    lowConfidenceVerification.length > 0
      ? `\nVerify first: ${lowConfidenceVerification.join(" | ")}`
      : "";

  return {
    id: "quick_reaction",
    title: "Quick Reaction",
    body: nonEmpty(`${prompt}${verificationSuffix}`, "Quick reaction unavailable."),
  };
}

export function projectBriefToV1Sections(brief: MorningBriefV02): MorningBriefViewV1 {
  const sectionMap = {
    mission: buildMissionSection(brief),
    priorities: buildPrioritiesSection(brief),
    evidence: buildEvidenceSection(brief),
    quick_reaction: buildQuickReactionSection(brief),
  } satisfies Record<(typeof REQUIRED_V1_SECTION_IDS)[number], MorningBriefV1Section>;

  return {
    schema_version: VIEW_V1_SCHEMA_VERSION,
    source_schema_version: "v0.2",
    generated_at: brief.generated_at,
    sections: REQUIRED_V1_SECTION_IDS.map((sectionId) => sectionMap[sectionId]),
  };
}
