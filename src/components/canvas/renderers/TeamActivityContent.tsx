"use client";

import { useMemo } from "react";
import { SparklineBarChart } from "./shared";
import type { TeamActivityData } from "./types";

interface TeamActivityContentProps {
  data: TeamActivityData;
  componentId: string;
}

export function TeamActivityContent({ data }: TeamActivityContentProps) {
  const { contributors, daily, totalCommits } = data;

  const sparklineData = useMemo(() => daily.map((d) => d.count), [daily]);
  const sparklineLabels = useMemo(() => daily.map((d) => d.date), [daily]);
  const hasActivity = sparklineData.some((count) => count > 0);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Summary header */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {totalCommits} commits from {contributors.length} contributors
        </span>
      </div>

      {/* Activity sparkline */}
      {hasActivity && (
        <SparklineBarChart
          data={sparklineData}
          labels={sparklineLabels}
          title="Commit activity"
        />
      )}

      {/* Contributors list */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-3">
          {contributors.map((contributor) => (
            <div
              key={contributor.login}
              className="flex flex-col gap-1 p-2 rounded-md bg-muted/30"
            >
              <div className="flex items-center gap-2">
                {contributor.avatar && (
                  <img
                    src={contributor.avatar}
                    alt={contributor.login}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <span className="font-medium">{contributor.login}</span>
                <span className="text-muted-foreground text-xs ml-auto">
                  {contributor.commits} commits
                </span>
              </div>

              {/* Work themes */}
              {contributor.themes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contributor.themes.map((theme) => (
                    <span
                      key={theme}
                      className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              )}

              {/* Recent commits preview */}
              <div className="text-xs text-muted-foreground">
                {contributor.recentCommits.slice(0, 2).map((msg, i) => (
                  <p key={i} className="truncate">
                    • {msg}
                  </p>
                ))}
              </div>
            </div>
          ))}
          {contributors.length === 0 && (
            <div className="text-muted-foreground text-sm text-center py-4">
              No activity in this time window
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TeamActivityContent;
