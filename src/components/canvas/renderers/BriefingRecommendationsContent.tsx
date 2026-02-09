"use client";

import { useMemo } from "react";
import {
  Sparkles,
  GitPullRequest,
  AlertTriangle,
  MessageSquare,
  Package,
  ShieldAlert,
} from "lucide-react";
import type { BriefingRecommendationsData } from "./types";
import { openInNewTab } from "./shared";

interface BriefingRecommendationsContentProps {
  data: BriefingRecommendationsData;
  componentId: string;
}

const ICONS = {
  pr: GitPullRequest,
  issue: ShieldAlert,
  deploy: Package,
  slack: MessageSquare,
  alert: AlertTriangle,
} as const;

const PRIORITY_STYLES: Record<
  "high" | "medium" | "low",
  { label: string; className: string }
> = {
  high: { label: "High", className: "text-red-400 bg-red-500/10" },
  medium: { label: "Medium", className: "text-amber-400 bg-amber-500/10" },
  low: { label: "Low", className: "text-emerald-400 bg-emerald-500/10" },
};

function formatGeneratedAt(timestamp: number | undefined) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function BriefingRecommendationsContent({ data }: BriefingRecommendationsContentProps) {
  const sections = data?.sections ?? [];
  const hasItems = sections.some((section) => section.items?.length > 0);

  const generatedAt = useMemo(
    () => formatGeneratedAt(data?.generatedAt),
    [data?.generatedAt]
  );

  if (!data || (!data.summary && !hasItems)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-sm text-muted-foreground gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <div className="max-w-[220px]">
          <p className="font-medium text-foreground">Your briefing space is ready.</p>
          <p className="text-xs">Ask me to catch you up when you&apos;re ready.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Morning Briefing</span>
          </div>
          {data.sinceLabel && (
            <p className="text-xs text-muted-foreground">{data.sinceLabel}</p>
          )}
        </div>
        {generatedAt && (
          <span className="text-[10px] text-muted-foreground">{generatedAt}</span>
        )}
      </div>

      {data.summary && (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground">
          {data.summary}
        </div>
      )}

      <div className="flex-1 overflow-auto pr-1">
        <div className="flex flex-col gap-3">
          {sections.map((section, index) => (
            <div key={`${section.title}-${index}`} className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </div>
              <div className="flex flex-col gap-2">
                {section.items.map((item, itemIndex) => {
                  const Icon = ICONS[item.icon] ?? AlertTriangle;
                  const priority = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low;
                  const isClickable = Boolean(item.actionUrl);

                  return (
                    <div
                      key={`${section.title}-${itemIndex}`}
                      className={`flex items-start gap-2 rounded-md border border-transparent bg-muted/30 px-2 py-2 text-sm ${
                        isClickable
                          ? "cursor-pointer hover:border-primary/40 hover:bg-muted/50"
                          : ""
                      }`}
                      onClick={() => {
                        if (item.actionUrl) {
                          openInNewTab(item.actionUrl);
                        }
                      }}
                    >
                      <span className="mt-0.5">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="flex-1 text-pretty text-foreground">
                        {item.text}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${priority.className}`}
                      >
                        {priority.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {sections.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No briefing items yet. Ask me to generate a summary when you&apos;re ready.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BriefingRecommendationsContent;
