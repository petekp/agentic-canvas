import type { StateSignal, StateSnapshot } from "@/types";
import { buildStateSnapshot, type TemplateStateInput } from "./state";

export type InteractionKind = "pointer" | "keyboard" | "scroll" | "touch";

const MAX_EVENTS = 240;
const events: Array<{ timestamp: number; kind: InteractionKind }> = [];
let lastInteractionAt = 0;
let initialized = false;
let isFocused = true;
let lastFocusChangeAt = 0;

function recordInteraction(kind: InteractionKind, timestamp = Date.now()) {
  lastInteractionAt = timestamp;
  events.push({ timestamp, kind });
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

function handleFocusChange(nextFocused: boolean) {
  isFocused = nextFocused;
  lastFocusChangeAt = Date.now();
}

export function registerStateSignalListeners(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const options = { passive: true } as AddEventListenerOptions;

  window.addEventListener("pointerdown", () => recordInteraction("pointer"), options);
  window.addEventListener("wheel", () => recordInteraction("scroll"), options);
  window.addEventListener("touchstart", () => recordInteraction("touch"), options);
  window.addEventListener("keydown", () => recordInteraction("keyboard"));

  window.addEventListener("focus", () => handleFocusChange(true));
  window.addEventListener("blur", () => handleFocusChange(false));
  document.addEventListener("visibilitychange", () => {
    handleFocusChange(document.visibilityState === "visible");
  });
}

export interface InteractionSnapshot {
  lastInteractionAt: number;
  idleMs: number;
  eventsLastMinute: number;
  eventsLastFiveMinutes: number;
  isFocused: boolean;
}

export function getInteractionSnapshot(now = Date.now()): InteractionSnapshot {
  const oneMinute = now - 60_000;
  const fiveMinutes = now - 300_000;

  let eventsLastMinute = 0;
  let eventsLastFiveMinutes = 0;

  for (const event of events) {
    if (event.timestamp >= oneMinute) eventsLastMinute += 1;
    if (event.timestamp >= fiveMinutes) eventsLastFiveMinutes += 1;
  }

  const last = lastInteractionAt || (events.length > 0 ? events[events.length - 1].timestamp : 0);
  const idleMs = last ? now - last : Number.POSITIVE_INFINITY;

  return {
    lastInteractionAt: last,
    idleMs,
    eventsLastMinute,
    eventsLastFiveMinutes,
    isFocused,
  };
}

function clampNormalized(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getTimeOfDaySegment(date: Date): "early" | "morning" | "midday" | "afternoon" | "evening" | "night" {
  const hour = date.getHours();
  if (hour < 6) return "early";
  if (hour < 10) return "morning";
  if (hour < 14) return "midday";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function deriveEnergyFromTime(segment: ReturnType<typeof getTimeOfDaySegment>): number {
  switch (segment) {
    case "early":
      return 0.35;
    case "morning":
      return 0.7;
    case "midday":
      return 0.75;
    case "afternoon":
      return 0.6;
    case "evening":
      return 0.45;
    case "night":
      return 0.3;
    default:
      return 0.5;
  }
}

function deriveTimePressure(segment: ReturnType<typeof getTimeOfDaySegment>): number {
  switch (segment) {
    case "morning":
      return 0.35;
    case "midday":
      return 0.45;
    case "afternoon":
      return 0.55;
    case "evening":
      return 0.6;
    case "night":
      return 0.3;
    case "early":
      return 0.25;
    default:
      return 0.4;
  }
}

function deriveMode(snapshot: InteractionSnapshot): StateSnapshot["mode"] {
  if (!snapshot.isFocused) return "monitor";
  if (snapshot.idleMs > 15 * 60_000) return "recover";
  if (snapshot.eventsLastMinute >= 20) return "execute";
  if (snapshot.eventsLastMinute >= 8) return "review";
  return "monitor";
}

export function deriveStateInputFromSignals(now = Date.now()): {
  input: TemplateStateInput;
  signals: StateSignal[];
} {
  const interaction = getInteractionSnapshot(now);
  const segment = getTimeOfDaySegment(new Date(now));

  const engagement = clampNormalized(interaction.eventsLastMinute / 30);
  const idlePenalty = interaction.idleMs === Number.POSITIVE_INFINITY
    ? 0.3
    : clampNormalized(interaction.idleMs / 300_000);

  const focus = clampNormalized(0.4 + engagement * 0.6 - idlePenalty * 0.4);
  const energy = clampNormalized(deriveEnergyFromTime(segment) - idlePenalty * 0.2);
  const timePressure = clampNormalized(deriveTimePressure(segment) + engagement * 0.15);
  const interruptibility = clampNormalized(1 - focus + idlePenalty * 0.2);
  const stress = clampNormalized(timePressure * 0.6 + engagement * 0.2);

  const input: TemplateStateInput = {
    focus,
    energy,
    stress,
    time_pressure: timePressure,
    interruptibility,
    mode: deriveMode(interaction),
    ambient_light: "normal",
    noise_level: "moderate",
    motion_context: "still",
  };

  const signals: StateSignal[] = [
    {
      source: "interaction",
      key: "events_last_minute",
      value: interaction.eventsLastMinute,
      confidence: 0.6,
      capturedAt: now,
    },
    {
      source: "interaction",
      key: "idle_ms",
      value: interaction.idleMs === Number.POSITIVE_INFINITY ? 999999 : interaction.idleMs,
      confidence: 0.7,
      capturedAt: now,
    },
    {
      source: "interaction",
      key: "is_focused",
      value: interaction.isFocused,
      confidence: 0.9,
      capturedAt: now,
    },
    {
      source: "inference",
      key: "time_of_day_segment",
      value: segment,
      confidence: 0.5,
      capturedAt: now,
    },
  ];

  return { input, signals };
}

export function buildStateSnapshotFromSignals(overrides?: TemplateStateInput): StateSnapshot {
  const now = Date.now();
  const derived = deriveStateInputFromSignals(now);
  const merged: TemplateStateInput = {
    ...derived.input,
    ...overrides,
  };

  const snapshot = buildStateSnapshot(merged, {
    now,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    signals: derived.signals,
  });

  return snapshot;
}

export function getFocusStatus() {
  return { isFocused, lastFocusChangeAt };
}
