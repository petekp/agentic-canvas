"use client";

import { useMemo } from "react";
import { StatsDisplay, type StatItem } from "@/components/tool-ui/stats-display";
import { SparklineBarChart } from "./shared";
import type { SiteHealthData } from "./types";

interface SiteHealthContentProps {
  data: SiteHealthData;
  componentId: string;
}

export function SiteHealthContent({ data, componentId }: SiteHealthContentProps) {
  const { uniqueVisitors, pageviews, newVisitorRatio, daily } = data;

  const statItems: StatItem[] = useMemo(
    () => [
      {
        key: "visitors",
        label: "Visitors",
        value: uniqueVisitors,
        format: { kind: "number", compact: uniqueVisitors >= 1000 },
      },
      {
        key: "pageviews",
        label: "Pageviews",
        value: pageviews,
        format: { kind: "number", compact: pageviews >= 1000 },
      },
      {
        key: "new_ratio",
        label: "New",
        value: Math.round(newVisitorRatio * 100),
        format: { kind: "number" },
      },
    ],
    [uniqueVisitors, pageviews, newVisitorRatio]
  );

  const sparklineData = useMemo(() => daily.map((d) => d.visitors), [daily]);
  const sparklineLabels = useMemo(() => daily.map((d) => d.date), [daily]);
  const hasData = sparklineData.some((v) => v > 0);

  return (
    <div className="flex flex-col gap-4 h-full">
      <StatsDisplay id={`site-health-stats-${componentId}`} stats={statItems} />

      {hasData && (
        <SparklineBarChart
          data={sparklineData}
          labels={sparklineLabels}
          title="Daily visitors"
        />
      )}
    </div>
  );
}

export default SiteHealthContent;
