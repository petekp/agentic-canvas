import { nanoid } from "nanoid";
import { z } from "zod";
import type {
  EvidenceItem,
  MorningBriefActionDirectory,
  MorningBriefComponentData,
  MorningBriefDataSource,
  MorningBriefLifecycleState,
  MorningBriefOverride,
  MorningBriefSourceReadiness,
} from "@/types";

const CONFIDENCE_VALUES = ["low", "medium", "high"] as const;
const DATA_SOURCE_VALUES = ["github", "slack", "posthog", "vercel", "custom"] as const;
const ASSUMPTION_REASON_VALUES = [
  "missing_data",
  "stale_data",
  "conflict",
  "insufficient_sample",
] as const;
const LEVER_ACTION_VALUES = [
  "notify",
  "create_space",
  "update_component",
  "open_link",
  "manual",
] as const;
const CERTAINTY_VALUES = ["low", "medium", "high"] as const;
const PRIORITY_RANK_VALUES = [1, 2, 3] as const;
const OWNERSHIP_OWNER_VALUES = ["me", "team", "shared", "unknown"] as const;
const PRIORITY_HORIZON_VALUES = ["today", "this_week"] as const;
const BRIEF_ACTION_APP_VALUES = [
  "github",
  "slack",
  "posthog",
  "vercel",
  "workspace",
  "custom",
] as const;
const BRIEF_ACTION_TYPE_VALUES = [
  "open_link",
  "create_space",
  "switch_space",
  "send_message_draft",
  "create_task",
  "manual",
] as const;
const VERIFICATION_REASON_VALUES = [
  "ownership_uncertain",
  "conflicting_signals",
  "low_confidence",
  "missing_context",
] as const;
const LIFECYCLE_STATE_VALUES = [
  "drafted",
  "presented",
  "accepted",
  "activated",
  "monitoring",
  "reframed",
  "resolved",
  "archived",
] as const;
const OVERRIDE_TYPE_VALUES = [
  "accept",
  "reframe",
  "deprioritize",
  "not_my_responsibility",
  "replace_objective",
  "snooze",
] as const;

const missionStatementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  owner: z.string().min(1),
  horizon: z.enum(["today", "this_week"]),
  priorityScore: z.number().min(0).max(100),
  whyNow: z.string().min(1).optional(),
  confidenceScore: z.number().min(0).max(100).optional(),
  certainty: z.enum(CERTAINTY_VALUES).optional(),
});

const evidenceItemSchema = z.object({
  id: z.string().min(1),
  source: z.enum(DATA_SOURCE_VALUES),
  entity: z.string().min(1),
  metric: z.string().min(1),
  valueText: z.string().min(1),
  valueNumber: z.number().optional(),
  observedAt: z.string().datetime(),
  freshnessMinutes: z.number().min(0),
  link: z.string().url().optional(),
  confidence: z.enum(CONFIDENCE_VALUES),
  confidenceScore: z.number().min(0).max(100).optional(),
});

const leverSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  actionType: z.enum(LEVER_ACTION_VALUES),
  actionPayload: z.record(z.string(), z.unknown()).optional(),
  expectedImpact: z.string().min(1),
  impactScore: z.number().min(0).max(100),
  confidence: z.enum(CONFIDENCE_VALUES),
});

const assumptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  reason: z.enum(ASSUMPTION_REASON_VALUES),
  sourceScope: z.array(z.enum(DATA_SOURCE_VALUES)),
  impact: z.enum(["low", "medium", "high"]).optional(),
  relatedSource: z.enum(DATA_SOURCE_VALUES).optional(),
});

const morningBriefMetaSchema = z.object({
  generatedAt: z.string().datetime(),
  window: z.object({
    todayStart: z.string().datetime(),
    now: z.string().datetime(),
    weekStart: z.string().datetime(),
  }),
  profileId: z.literal("user0"),
  rankingPolicy: z.literal("highest_impact_first"),
  maxPriorities: z.literal(3),
});

const briefActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  app: z.enum(BRIEF_ACTION_APP_VALUES),
  type: z.enum(BRIEF_ACTION_TYPE_VALUES),
  payload: z.record(z.string(), z.unknown()).optional(),
  expectedOutcome: z.string().min(1),
});

const priorityScoreSchema = z.object({
  impact: z.number().min(0).max(100),
  urgency: z.number().min(0).max(100),
  ownershipFit: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  composite: z.number().min(0).max(100),
});

const priorityItemSchema = z.object({
  id: z.string().min(1),
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string().min(1),
  recommendation: z.string().min(1),
  approach: z.string().min(1),
  whyHighestImpact: z.string().min(1),
  horizon: z.enum(PRIORITY_HORIZON_VALUES),
  scores: priorityScoreSchema,
  certainty: z.enum(CERTAINTY_VALUES),
  ownershipHypothesis: z.object({
    likelyOwner: z.enum(OWNERSHIP_OWNER_VALUES),
    rationale: z.string().min(1),
    needsVerification: z.boolean(),
  }),
  relatedEvidenceIds: z.array(z.string().min(1)),
  primaryActions: z.array(briefActionSchema),
});

const correlationStorySchema = z.object({
  id: z.string().min(1),
  headline: z.string().min(1),
  claim: z.string().min(1),
  sources: z.array(z.enum(DATA_SOURCE_VALUES)).min(1),
  relatedEvidenceIds: z.array(z.string().min(1)),
  confidenceScore: z.number().min(0).max(100),
  certainty: z.enum(CERTAINTY_VALUES),
});

const actionDirectorySchema = z.object({
  availableNow: z.array(
    z.object({
      app: z.string().min(1),
      actions: z.array(z.string().min(1)),
    })
  ),
  suggestedSetup: z.array(
    z.object({
      app: z.string().min(1),
      missingAction: z.string().min(1),
      value: z.string().min(1),
      setupHint: z.string().min(1),
    })
  ),
});

const weeklyCheckinSchema = z.object({
  ready: z.boolean(),
  bullets: z.array(z.string().min(1)),
  gaps: z.array(z.string().min(1)),
});

const verificationPromptSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  appliesToPriorityId: z.string().min(1).optional(),
  reason: z.enum(VERIFICATION_REASON_VALUES),
});

const sourceReadinessSchema = z.object({
  source: z.enum(DATA_SOURCE_VALUES),
  available: z.boolean(),
  freshnessMinutes: z.number().min(0).optional(),
  error: z.string().min(1).optional(),
});

const morningBriefVersionSchema = z.object({
  version: z.number().int().min(0),
  generatedAt: z.string().datetime(),
  generatedBy: z.literal("assistant"),
  mission: missionStatementSchema,
  evidence: z.array(evidenceItemSchema),
  levers: z.array(leverSchema),
  assumptions: z.array(assumptionSchema),
  confidence: z.enum(CONFIDENCE_VALUES),
  freshnessSummary: z.string().min(1),
  meta: morningBriefMetaSchema.optional(),
  priorities: z.array(priorityItemSchema).max(3).optional(),
  correlations: z.array(correlationStorySchema).optional(),
  actionDirectory: actionDirectorySchema.optional(),
  weeklyCheckin: weeklyCheckinSchema.optional(),
  verification: z.array(verificationPromptSchema).optional(),
  sourceReadiness: z.array(sourceReadinessSchema).optional(),
});

const morningBriefVersionHistorySchema = z.object({
  version: z.number().int().min(0),
  generatedAt: z.string().datetime(),
  mission: missionStatementSchema,
  confidence: z.enum(CONFIDENCE_VALUES),
});

const morningBriefOverrideSchema = z.object({
  id: z.string().min(1),
  type: z.enum(OVERRIDE_TYPE_VALUES),
  createdAt: z.string().datetime(),
  actor: z.literal("user"),
  note: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const morningBriefComponentDataSchema = z.object({
  current: morningBriefVersionSchema,
  history: z.array(morningBriefVersionHistorySchema),
  state: z.enum(LIFECYCLE_STATE_VALUES),
  userOverrides: z.array(morningBriefOverrideSchema),
});

const morningBriefReasonerMissionSchema = z.object({
  title: z.string().min(1),
  whyNow: z.string().min(1),
  confidenceScore: z.number().min(0).max(100),
  certainty: z.enum(CERTAINTY_VALUES),
});

export const morningBriefReasonerOutputSchema = z.object({
  mission: morningBriefReasonerMissionSchema,
  confidence: z.enum(CONFIDENCE_VALUES),
  priorities: z.array(priorityItemSchema).max(3),
  correlations: z.array(correlationStorySchema).max(3),
  assumptions: z.array(assumptionSchema).max(8),
  verification: z.array(verificationPromptSchema).max(6),
  weeklyCheckin: weeklyCheckinSchema,
});

export type MorningBriefReasonerOutput = z.infer<typeof morningBriefReasonerOutputSchema>;

export type MorningBriefReasonerValidationResult =
  | { valid: true; data: MorningBriefReasonerOutput }
  | { valid: false; errors: string[] };

export interface MorningBriefReasonerInput {
  context: {
    generatedAt: string;
    since: string;
    profileId: "user0";
    rankingPolicy: "highest_impact_first";
    maxPriorities: 3;
    horizons: Array<"today" | "this_week">;
    ownershipPriority: ["engineering_delivery", "team_communications", "strategy_planning"];
  };
  summaries: {
    summary: string;
    repoCount: number;
    repos: string[];
    signalCounts: {
      prs: number;
      issues: number;
      deployments: number;
      slack: number;
      posthog: number;
    };
  };
  requestedSources: Record<MorningBriefDataSource, boolean>;
  sourceReadiness: MorningBriefSourceReadiness[];
  actionDirectory: MorningBriefActionDirectory;
  evidence: EvidenceItem[];
  guidance: {
    avoidSingleSourceOverindexing: boolean;
    hypothesisFirst: boolean;
    requireVerificationWhenUncertain: boolean;
  };
}

export type MorningBriefValidationResult =
  | { valid: true; data: MorningBriefComponentData }
  | { valid: false; errors: string[] };

export const MORNING_BRIEF_TRANSITIONS: Record<
  MorningBriefLifecycleState,
  MorningBriefLifecycleState[]
> = {
  drafted: ["presented"],
  presented: ["accepted", "reframed"],
  accepted: ["activated"],
  activated: ["monitoring"],
  monitoring: ["reframed", "resolved"],
  reframed: ["presented", "accepted", "activated", "monitoring", "resolved"],
  resolved: ["archived"],
  archived: [],
};

export function validateMorningBriefComponentData(
  value: unknown
): MorningBriefValidationResult {
  const result = morningBriefComponentDataSchema.safeParse(value);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `${path}: ${issue.message}`;
      }),
    };
  }

  return { valid: true, data: result.data };
}

export function validateMorningBriefReasonerOutput(
  value: unknown
): MorningBriefReasonerValidationResult {
  const result = morningBriefReasonerOutputSchema.safeParse(value);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `${path}: ${issue.message}`;
      }),
    };
  }

  return { valid: true, data: result.data };
}

export function canTransitionMorningBriefState(
  from: MorningBriefLifecycleState,
  to: MorningBriefLifecycleState
): boolean {
  if (from === to) return true;
  return MORNING_BRIEF_TRANSITIONS[from].includes(to);
}

export function transitionMorningBriefState(
  data: MorningBriefComponentData,
  to: MorningBriefLifecycleState
): MorningBriefComponentData {
  if (!canTransitionMorningBriefState(data.state, to)) {
    throw new Error(
      `Invalid Morning Brief lifecycle transition: ${data.state} -> ${to}`
    );
  }

  if (data.state === to) {
    return data;
  }

  return {
    ...data,
    state: to,
  };
}

export interface MorningBriefOverrideInput {
  id?: string;
  type: MorningBriefOverride["type"];
  createdAt?: string;
  note?: string;
  payload?: Record<string, unknown>;
}

function createOverride(input: MorningBriefOverrideInput): MorningBriefOverride {
  return {
    id: input.id ?? `mbo_${nanoid(10)}`,
    type: input.type,
    createdAt: input.createdAt ?? new Date().toISOString(),
    actor: "user",
    note: input.note,
    payload: input.payload,
  };
}

function deriveStateAfterOverride(
  currentState: MorningBriefLifecycleState,
  overrideType: MorningBriefOverride["type"]
): MorningBriefLifecycleState {
  if (overrideType === "accept" && canTransitionMorningBriefState(currentState, "accepted")) {
    return "accepted";
  }

  if (
    overrideType !== "accept" &&
    overrideType !== "snooze" &&
    canTransitionMorningBriefState(currentState, "reframed")
  ) {
    return "reframed";
  }

  return currentState;
}

export function appendMorningBriefOverride(
  data: MorningBriefComponentData,
  input: MorningBriefOverrideInput
): MorningBriefComponentData {
  const override = createOverride(input);
  const nextState = deriveStateAfterOverride(data.state, override.type);

  return {
    ...data,
    state: nextState,
    userOverrides: [...data.userOverrides, override],
  };
}

export function isMorningBriefComponentData(
  value: unknown
): value is MorningBriefComponentData {
  return validateMorningBriefComponentData(value).valid;
}
