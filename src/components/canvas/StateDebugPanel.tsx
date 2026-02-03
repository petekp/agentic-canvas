"use client";

import type { StateSnapshot } from "@/types";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface StateDebugPanelProps {
  open: boolean;
  snapshot: StateSnapshot | null;
  onClose: () => void;
}

function formatNumber(value: number | undefined, digits = 2) {
  if (value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function formatSignalValue(value: StateSnapshot["signals"][number]["value"]) {
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function StateDebugPanel({ open, snapshot, onClose }: StateDebugPanelProps) {
  if (!open || !snapshot) return null;

  const signalMap = new Map(snapshot.signals.map((signal) => [signal.key, signal]));
  const idleMs = signalMap.get("idle_ms")?.value as number | undefined;
  const eventsLastMinute = signalMap.get("events_last_minute")?.value as number | undefined;
  const isFocused = signalMap.get("is_focused")?.value as boolean | undefined;

  return (
    <div className="absolute bottom-4 left-4 z-20 w-80 rounded-lg border border-border/60 bg-zinc-950/90 p-4 text-xs text-muted-foreground shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">State Debug</div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span>Mode</span>
        <span className="text-foreground">{snapshot.mode}</span>

        <span>Focus</span>
        <span className="text-foreground">{formatNumber(snapshot.focus)}</span>

        <span>Energy</span>
        <span className="text-foreground">{formatNumber(snapshot.energy)}</span>

        <span>Stress</span>
        <span className="text-foreground">{formatNumber(snapshot.stress)}</span>

        <span>Time Pressure</span>
        <span className="text-foreground">{formatNumber(snapshot.timePressure)}</span>

        <span>Interruptibility</span>
        <span className="text-foreground">{formatNumber(snapshot.interruptibility)}</span>

        <span>Ambient</span>
        <span className="text-foreground">{snapshot.ambientLight}</span>

        <span>Noise</span>
        <span className="text-foreground">{snapshot.noiseLevel}</span>

        <span>Motion</span>
        <span className="text-foreground">{snapshot.motionContext}</span>

        <span>Idle (ms)</span>
        <span className="text-foreground">{idleMs ? Math.round(idleMs).toString() : "-"}</span>

        <span>Events/min</span>
        <span className="text-foreground">{eventsLastMinute ?? "-"}</span>

        <span>Focused</span>
        <span className="text-foreground">{isFocused === undefined ? "-" : isFocused ? "yes" : "no"}</span>
      </div>

      {snapshot.signals.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">Signals</div>
          <div className="space-y-1">
            {snapshot.signals.map((signal) => (
              <div key={signal.key} className="flex items-center justify-between">
                <span>{signal.key}</span>
                <span className="text-foreground/90">
                  {formatSignalValue(signal.value)} ({formatNumber(signal.confidence, 1)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
