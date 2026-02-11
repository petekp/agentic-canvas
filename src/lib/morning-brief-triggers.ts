import type {
  MorningBriefRuntimeState,
  MorningBriefTrigger,
  MorningBriefTriggerType,
  ProactiveTrigger,
  TriggerId,
} from "@/types";

const MORNING_BRIEF_TRIGGER_TYPES: MorningBriefTriggerType[] = [
  "schedule.morning",
  "event.risk_spike",
  "event.blocker",
  "event.behavior_drop",
  "staleness",
  "user.request_refresh",
];

const DEFAULT_MORNING_BRIEF_TRIGGERS: Array<
  Omit<MorningBriefTrigger, "id"> & { id: TriggerId; name: string; description: string; critical?: boolean }
> = [
  {
    id: "trigger_morning_schedule",
    name: "Morning Schedule",
    description: "Fire once per local day at the configured morning hour.",
    type: "schedule.morning",
    enabled: true,
    minIntervalMinutes: 720,
    coolDownMinutes: 720,
    criteria: { localHour: 8, oncePerDay: true },
  },
  {
    id: "trigger_risk_spike",
    name: "Risk Spike",
    description: "Fire when composite risk increases quickly.",
    type: "event.risk_spike",
    enabled: true,
    minIntervalMinutes: 30,
    coolDownMinutes: 60,
    criteria: { thresholdPoints: 20, windowMinutes: 120 },
  },
  {
    id: "trigger_blocker",
    name: "Blocker Threshold",
    description: "Fire when blocker count crosses threshold.",
    type: "event.blocker",
    enabled: true,
    minIntervalMinutes: 30,
    coolDownMinutes: 45,
    criteria: { thresholdCount: 3 },
  },
  {
    id: "trigger_behavior_drop",
    name: "Behavior Drop",
    description: "Fire when primary metric drops day-over-day.",
    type: "event.behavior_drop",
    enabled: true,
    minIntervalMinutes: 60,
    coolDownMinutes: 120,
    criteria: { thresholdPercent: 10 },
  },
  {
    id: "trigger_staleness",
    name: "Evidence Staleness",
    description: "Fire when evidence age exceeds freshness threshold.",
    type: "staleness",
    enabled: true,
    minIntervalMinutes: 60,
    coolDownMinutes: 120,
    criteria: { thresholdMinutes: 180 },
  },
  {
    id: "trigger_user_refresh",
    name: "User Refresh",
    description: "Immediate user-requested refresh.",
    type: "user.request_refresh",
    enabled: true,
    minIntervalMinutes: 0,
    coolDownMinutes: 0,
    criteria: {},
    critical: true,
  },
];

export type MorningBriefTriggerRunReason =
  | "fired"
  | "disabled"
  | "criteria"
  | "min_interval"
  | "cooldown"
  | "snoozed"
  | "suggest_only"
  | "missing_trigger";

export interface MorningBriefTriggerSignal {
  riskDeltaPoints?: number;
  blockerCount?: number;
  behaviorDropPercent?: number;
  evidenceAgeMinutes?: number;
}

export interface EvaluateMorningBriefTriggerInput {
  trigger: MorningBriefTrigger;
  runtime: MorningBriefRuntimeState;
  signal: MorningBriefTriggerSignal;
  nowMs: number;
  force?: boolean;
}

export function isMorningBriefTriggerType(value: string): value is MorningBriefTriggerType {
  return MORNING_BRIEF_TRIGGER_TYPES.includes(value as MorningBriefTriggerType);
}

export function createDefaultMorningBriefRuntimeState(): MorningBriefRuntimeState {
  return {
    mode: "active",
    lowConfidenceStreak: 0,
  };
}

export function createDefaultMorningBriefTriggers(): ProactiveTrigger[] {
  return DEFAULT_MORNING_BRIEF_TRIGGERS.map((trigger) => ({
    id: trigger.id,
    name: trigger.name,
    description: trigger.description,
    enabled: trigger.enabled,
    type: trigger.type,
    minIntervalMinutes: trigger.minIntervalMinutes,
    coolDownMinutes: trigger.coolDownMinutes,
    criteria: structuredClone(trigger.criteria),
    critical: trigger.critical ?? trigger.type === "user.request_refresh",
  }));
}

export function ensureMorningBriefTriggers(triggers: ProactiveTrigger[]): ProactiveTrigger[] {
  const next = [...triggers];

  for (const defaultTrigger of createDefaultMorningBriefTriggers()) {
    const existingIndex = next.findIndex((trigger) => trigger.type === defaultTrigger.type);
    if (existingIndex === -1) {
      next.push(defaultTrigger);
      continue;
    }

    const existing = next[existingIndex];
    next[existingIndex] = {
      ...existing,
      id: existing.id ?? defaultTrigger.id,
      name: existing.name ?? defaultTrigger.name,
      description: existing.description ?? defaultTrigger.description,
      enabled: existing.enabled ?? defaultTrigger.enabled,
      type: defaultTrigger.type,
      minIntervalMinutes:
        typeof existing.minIntervalMinutes === "number"
          ? existing.minIntervalMinutes
          : defaultTrigger.minIntervalMinutes,
      coolDownMinutes:
        typeof existing.coolDownMinutes === "number"
          ? existing.coolDownMinutes
          : defaultTrigger.coolDownMinutes,
      criteria:
        existing.criteria && typeof existing.criteria === "object"
          ? { ...defaultTrigger.criteria, ...existing.criteria }
          : defaultTrigger.criteria,
      critical: existing.critical ?? defaultTrigger.critical,
    };
  }

  return next;
}

export function getMorningBriefTriggerByType(
  triggers: ProactiveTrigger[],
  type: MorningBriefTriggerType
): ProactiveTrigger | undefined {
  return triggers.find((trigger) => trigger.type === type);
}

export function toMorningBriefTrigger(trigger: ProactiveTrigger): MorningBriefTrigger | null {
  if (!isMorningBriefTriggerType(trigger.type)) {
    return null;
  }

  return {
    id: trigger.id,
    type: trigger.type,
    enabled: trigger.enabled,
    minIntervalMinutes:
      typeof trigger.minIntervalMinutes === "number" ? trigger.minIntervalMinutes : 0,
    coolDownMinutes: typeof trigger.coolDownMinutes === "number" ? trigger.coolDownMinutes : 0,
    lastFiredAt: trigger.lastFiredAt,
    criteria: trigger.criteria ?? {},
  };
}

export function evaluateMorningBriefTrigger(
  input: EvaluateMorningBriefTriggerInput
): MorningBriefTriggerRunReason {
  const { trigger, runtime, signal, nowMs, force } = input;
  const isUserRefresh = trigger.type === "user.request_refresh";

  if (!trigger.enabled) {
    return "disabled";
  }

  if (!force && runtime.mode === "suggest_only" && !isUserRefresh) {
    return "suggest_only";
  }

  if (!force && !isUserRefresh && isSnoozed(runtime.snoozedUntil, nowMs)) {
    return "snoozed";
  }

  if (!force && !matchesTriggerCriteria(trigger, signal, nowMs)) {
    return "criteria";
  }

  if (force || isUserRefresh) {
    return "fired";
  }

  const elapsedMinutes = getElapsedMinutes(trigger.lastFiredAt, nowMs);
  if (
    elapsedMinutes !== null &&
    trigger.minIntervalMinutes > 0 &&
    elapsedMinutes < trigger.minIntervalMinutes
  ) {
    return "min_interval";
  }

  if (
    elapsedMinutes !== null &&
    trigger.coolDownMinutes > 0 &&
    elapsedMinutes < trigger.coolDownMinutes
  ) {
    return "cooldown";
  }

  return "fired";
}

function matchesTriggerCriteria(
  trigger: MorningBriefTrigger,
  signal: MorningBriefTriggerSignal,
  nowMs: number
): boolean {
  switch (trigger.type) {
    case "schedule.morning": {
      const localHour =
        typeof trigger.criteria.localHour === "number" ? trigger.criteria.localHour : 8;
      if (new Date(nowMs).getHours() !== localHour) {
        return false;
      }

      const oncePerDay =
        typeof trigger.criteria.oncePerDay === "boolean"
          ? trigger.criteria.oncePerDay
          : true;
      if (!oncePerDay || !trigger.lastFiredAt) {
        return true;
      }

      return !isSameLocalDay(new Date(trigger.lastFiredAt), new Date(nowMs));
    }

    case "event.risk_spike": {
      const threshold =
        typeof trigger.criteria.thresholdPoints === "number"
          ? trigger.criteria.thresholdPoints
          : 20;
      return typeof signal.riskDeltaPoints === "number" && signal.riskDeltaPoints >= threshold;
    }

    case "event.blocker": {
      const threshold =
        typeof trigger.criteria.thresholdCount === "number"
          ? trigger.criteria.thresholdCount
          : 3;
      return typeof signal.blockerCount === "number" && signal.blockerCount >= threshold;
    }

    case "event.behavior_drop": {
      const threshold =
        typeof trigger.criteria.thresholdPercent === "number"
          ? trigger.criteria.thresholdPercent
          : 10;
      return (
        typeof signal.behaviorDropPercent === "number" &&
        signal.behaviorDropPercent >= threshold
      );
    }

    case "staleness": {
      const threshold =
        typeof trigger.criteria.thresholdMinutes === "number"
          ? trigger.criteria.thresholdMinutes
          : 180;
      return (
        typeof signal.evidenceAgeMinutes === "number" && signal.evidenceAgeMinutes > threshold
      );
    }

    case "user.request_refresh":
      return true;

    default:
      return false;
  }
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSnoozed(snoozedUntil: string | undefined, nowMs: number): boolean {
  if (!snoozedUntil) {
    return false;
  }

  const expiry = Date.parse(snoozedUntil);
  if (!Number.isFinite(expiry)) {
    return false;
  }

  return nowMs < expiry;
}

function getElapsedMinutes(lastFiredAt: string | undefined, nowMs: number): number | null {
  if (!lastFiredAt) {
    return null;
  }

  const firedAtMs = Date.parse(lastFiredAt);
  if (!Number.isFinite(firedAtMs)) {
    return null;
  }

  const elapsedMs = Math.max(0, nowMs - firedAtMs);
  return elapsedMs / 60_000;
}
