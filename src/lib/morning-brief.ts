import { nanoid } from "nanoid";
import { z } from "zod";
import type {
  MorningBriefComponentData,
  MorningBriefLifecycleState,
  MorningBriefOverride,
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
