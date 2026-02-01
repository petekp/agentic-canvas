"use client";

import { useMemo, useCallback } from "react";
import { StatsDisplay, type StatItem } from "@/components/tool-ui/stats-display";
import { ActivityFeedItem, SparklineBarChart, openInNewTab } from "./shared";
import type { MyActivityData } from "./types";

interface MyActivityContentProps {
  data: MyActivityData;
  componentId: string;
}

export function MyActivityContent({ data, componentId }: MyActivityContentProps) {
  const { stats, daily, feed } = data;

  const statItems: StatItem[] = useMemo(
    () => [
      {
        key: "commits",
        label: "Commits",
        value: stats.commits,
        format: { kind: "number" },
      },
      {
        key: "prs_opened",
        label: "PRs",
        value: stats.prsOpened,
        format: { kind: "number" },
      },
      {
        key: "reviews",
        label: "Reviews",
        value: stats.reviews,
        format: { kind: "number" },
      },
      {
        key: "issues",
        label: "Issues",
        value: stats.issuesOpened,
        format: { kind: "number" },
      },
      {
        key: "comments",
        label: "Comments",
        value: stats.comments,
        format: { kind: "number" },
      },
    ],
    [stats]
  );

  const sparklineData = useMemo(() => daily.map((d) => d.count), [daily]);
  const sparklineLabels = useMemo(() => daily.map((d) => d.date), [daily]);
  const hasActivity = sparklineData.some((count) => count > 0);

  const handleFeedClick = useCallback((url: string) => {
    openInNewTab(url);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <StatsDisplay id={`my-activity-stats-${componentId}`} stats={statItems} />

      {hasActivity && (
        <SparklineBarChart
          data={sparklineData}
          labels={sparklineLabels}
          title="Activity"
        />
      )}

      <div className="flex-1 overflow-auto">
        <ul className="space-y-2">
          {feed.map((item) => (
            <ActivityFeedItem
              key={item.id}
              id={item.id}
              type={item.type}
              message={item.message}
              subtitle={item.repo}
              timestamp={item.timestamp}
              url={item.url}
              onItemClick={handleFeedClick}
            />
          ))}
          {feed.length === 0 && (
            <li className="text-muted-foreground text-sm text-center py-4">
              No recent activity
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default MyActivityContent;
