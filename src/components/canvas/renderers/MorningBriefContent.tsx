"use client";

import { Sparkles, AlertTriangle } from "lucide-react";
import type { MorningBriefComponentData } from "@/types";
import { validateMorningBriefComponentData } from "@/lib/morning-brief";
import { openInNewTab } from "./shared";
import { useStore } from "@/store";

interface MorningBriefContentProps {
  data: unknown;
  componentId: string;
}

const STALE_EVIDENCE_THRESHOLD_MINUTES = 180;

function confidenceStyles(level: MorningBriefComponentData["current"]["confidence"]) {
  if (level === "high") return "text-emerald-300 bg-emerald-500/10";
  if (level === "medium") return "text-amber-300 bg-amber-500/10";
  return "text-red-300 bg-red-500/10";
}

function confidenceLabel(level: MorningBriefComponentData["current"]["confidence"]) {
  if (level === "high") return "High";
  if (level === "medium") return "Medium";
  return "Low";
}

function renderStaleMarker(freshnessMinutes: number) {
  if (freshnessMinutes <= STALE_EVIDENCE_THRESHOLD_MINUTES) {
    return null;
  }

  return (
    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
      stale
    </span>
  );
}

export function MorningBriefContent({ data, componentId }: MorningBriefContentProps) {
  const applyOverride = useStore((state) => state.applyMorningBriefOverrideAction);
  const runTrigger = useStore((state) => state.runMorningBriefTrigger);
  const parsed = validateMorningBriefComponentData(data);

  if (!parsed.valid) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <Sparkles className="h-5 w-5 text-primary" />
        <p className="font-medium text-foreground">Morning Brief is waiting for generation.</p>
        <p className="max-w-[240px] text-xs">
          The brief payload does not yet match the lifecycle contract.
        </p>
      </div>
    );
  }

  const brief = parsed.data;
  const topLevers = brief.current.levers.slice(0, 3);
  const staleEvidence = brief.current.evidence.filter(
    (item) => item.freshnessMinutes > STALE_EVIDENCE_THRESHOLD_MINUTES
  );

  const handleOverride = (input: {
    type: MorningBriefComponentData["userOverrides"][number]["type"];
    note?: string;
    payload?: Record<string, unknown>;
  }) => {
    applyOverride(componentId, input);
  };

  return (
    <div className="flex h-full flex-col gap-3 text-sm text-foreground">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold">Your Morning Brief</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceStyles(
            brief.current.confidence
          )}`}
        >
          {brief.current.confidence} confidence
        </span>
      </div>
      <button
        type="button"
        className="self-start rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
        onClick={() => {
          void runTrigger({ type: "user.request_refresh" });
        }}
      >
        Refresh now
      </button>

      <section className="rounded-md bg-muted/30 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s Mission
        </h4>
        <p className="mt-1 font-medium">{brief.current.mission.title}</p>
      </section>

      <section className="rounded-md bg-muted/30 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Why It Matters Now
        </h4>
        <p className="mt-1 text-sm">{brief.current.mission.rationale}</p>
      </section>

      <section className="rounded-md bg-muted/30 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Top Levers
        </h4>
        <ul className="mt-1 list-disc space-y-2 pl-4">
          {topLevers.length === 0 && (
            <p className="text-xs text-muted-foreground">No levers generated yet.</p>
          )}
          {topLevers.map((lever) => {
            const actionUrl =
              lever.actionType === "open_link" && typeof lever.actionPayload?.url === "string"
                ? lever.actionPayload.url
                : undefined;
            const normalizedLabel = lever.label.trim();
            const normalizedImpact = lever.expectedImpact.trim();
            const showImpact =
              normalizedImpact.length > 0 && normalizedImpact !== normalizedLabel;

            return (
              <li key={lever.id} className="text-xs">
                <div className="font-medium">{lever.label}</div>
                {showImpact && (
                  <div className="text-muted-foreground">{lever.expectedImpact}</div>
                )}
                {actionUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      openInNewTab(actionUrl);
                    }}
                    className="mt-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted/50"
                  >
                    Open source
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-md bg-muted/30 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Evidence
        </h4>
        {brief.current.evidence.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No evidence captured yet.</p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {brief.current.evidence.slice(0, 4).map((item) => (
              <li key={item.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {item.source}:{item.metric}
                </span>{" "}
                {item.valueText} ({item.freshnessMinutes} minutes old){" "}
                {renderStaleMarker(item.freshnessMinutes)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{brief.current.freshnessSummary}</p>
      </section>

      <section className="rounded-md bg-muted/30 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Expected Impact
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Priority score {brief.current.mission.priorityScore} with {brief.current.levers.length} planned
          lever(s).
        </p>
      </section>

      <section className="rounded-md bg-muted/30 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assumptions &amp; Confidence
        </h4>
        <div className="mt-1 flex flex-col gap-1">
          <p className="text-xs font-medium text-foreground">
            Confidence: {confidenceLabel(brief.current.confidence)}
          </p>
          {brief.current.assumptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No assumptions recorded.</p>
          ) : (
            brief.current.assumptions.map((assumption) => (
              <p key={assumption.id} className="text-xs text-muted-foreground">
                {assumption.text}
              </p>
            ))
          )}
          {staleEvidence.length > 0 && (
            <div className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
              <div className="mb-1 flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Stale evidence detected
              </div>
              <div className="flex flex-wrap gap-1">
                {staleEvidence.map((item) => (
                  <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5">
                    {item.source}:{item.metric} {renderStaleMarker(item.freshnessMinutes)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md bg-muted/30 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mission Controls
        </h4>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted/50"
            onClick={() => handleOverride({ type: "accept", note: "Mission accepted" })}
          >
            Accept mission
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted/50"
            onClick={() => handleOverride({ type: "reframe", note: "Need to reframe mission" })}
          >
            Reframe mission
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted/50"
            onClick={() =>
              handleOverride({ type: "deprioritize", note: "Lower priority for this cycle" })
            }
          >
            Lower priority
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted/50"
            onClick={() =>
              handleOverride({
                type: "not_my_responsibility",
                note: "This objective should be owned by another team",
              })
            }
          >
            Not my responsibility
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted/50"
            onClick={() => {
              const nextObjective = globalThis.prompt(
                "What objective should replace this mission?"
              );
              if (!nextObjective) return;
              handleOverride({
                type: "replace_objective",
                note: "User selected a different objective",
                payload: { objective: nextObjective },
              });
            }}
          >
            Use different objective
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted/50"
            onClick={() =>
              handleOverride({
                type: "snooze",
                note: "Snooze proactive refreshes for 2 hours",
                payload: { durationMinutes: 120 },
              })
            }
          >
            Snooze
          </button>
        </div>
      </section>
    </div>
  );
}

export default MorningBriefContent;
