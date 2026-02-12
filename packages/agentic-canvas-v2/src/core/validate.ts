import type { MorningBriefV02 } from "../contracts/brief-v0.2";

export type BriefValidationIssueCode =
  | "too_many_priorities"
  | "duplicate_rank"
  | "rank_out_of_bounds"
  | "missing_evidence_ref"
  | "unknown_evidence_ref"
  | "verification_prompt_required";

export interface BriefValidationIssue {
  code: BriefValidationIssueCode;
  path: string;
  message: string;
}

export interface BriefValidationResult {
  ok: boolean;
  issues: BriefValidationIssue[];
}

const MAX_PRIORITIES = 3;

export function validateBriefV02(brief: MorningBriefV02): BriefValidationResult {
  const issues: BriefValidationIssue[] = [];
  const priorities = brief.priorities ?? [];

  if (priorities.length > MAX_PRIORITIES) {
    issues.push({
      code: "too_many_priorities",
      path: "priorities",
      message: `At most ${MAX_PRIORITIES} priorities are allowed.`,
    });
  }

  const seenRanks = new Set<number>();
  for (let index = 0; index < priorities.length; index += 1) {
    const priority = priorities[index];
    const path = `priorities[${index}]`;
    const rank = priority.rank;

    if (!Number.isInteger(rank) || rank < 1 || rank > MAX_PRIORITIES) {
      issues.push({
        code: "rank_out_of_bounds",
        path: `${path}.rank`,
        message: "Rank must be an integer between 1 and 3.",
      });
    }

    if (seenRanks.has(rank)) {
      issues.push({
        code: "duplicate_rank",
        path: `${path}.rank`,
        message: `Rank ${rank} is duplicated.`,
      });
    }
    seenRanks.add(rank);

    if (!Array.isArray(priority.evidence_refs) || priority.evidence_refs.length === 0) {
      issues.push({
        code: "missing_evidence_ref",
        path: `${path}.evidence_refs`,
        message: "Each priority must reference at least one evidence item.",
      });
    }

    if (
      priority.confidence === "low" &&
      (!priority.verification_prompt || priority.verification_prompt.trim().length === 0)
    ) {
      issues.push({
        code: "verification_prompt_required",
        path: `${path}.verification_prompt`,
        message: "Low-confidence priorities must include a verification prompt.",
      });
    }
  }

  const evidenceIds = new Set((brief.evidence ?? []).map((item) => item.id));
  priorities.forEach((priority, index) => {
    (priority.evidence_refs ?? []).forEach((ref, refIndex) => {
      if (!evidenceIds.has(ref)) {
        issues.push({
          code: "unknown_evidence_ref",
          path: `priorities[${index}].evidence_refs[${refIndex}]`,
          message: `Evidence reference "${ref}" does not exist.`,
        });
      }
    });
  });

  return {
    ok: issues.length === 0,
    issues,
  };
}
