import type { StateSignal, StateSnapshot } from "@/types";

export interface TemplateStateInput {
  focus?: number;
  energy?: number;
  stress?: number;
  time_pressure?: number;
  interruptibility?: number;
  mode?: StateSnapshot["mode"];
  ambient_light?: StateSnapshot["ambientLight"];
  noise_level?: StateSnapshot["noiseLevel"];
  motion_context?: StateSnapshot["motionContext"];
}

function clampNormalized(value: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

export function buildStateSnapshot(
  input?: TemplateStateInput,
  overrides?: { now?: number; timezone?: string; signals?: StateSignal[] }
): StateSnapshot {
  const now = overrides?.now ?? Date.now();
  const timezone = overrides?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  return {
    timestamp: now,
    timezone,
    focus: clampNormalized(input?.focus ?? 0.6, 0.6),
    energy: clampNormalized(input?.energy ?? 0.6, 0.6),
    stress: clampNormalized(input?.stress ?? 0.3, 0.3),
    timePressure: clampNormalized(input?.time_pressure ?? 0.4, 0.4),
    interruptibility: clampNormalized(input?.interruptibility ?? 0.5, 0.5),
    ambientLight: input?.ambient_light ?? "normal",
    noiseLevel: input?.noise_level ?? "moderate",
    motionContext: input?.motion_context ?? "still",
    mode: input?.mode ?? "monitor",
    signals: overrides?.signals ?? [],
  };
}
