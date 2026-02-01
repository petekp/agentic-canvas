"use client";

import { useMemo } from "react";
import { StatsDisplay, type StatItem } from "@/components/tool-ui/stats-display";
import type { StatTileData } from "./types";

interface StatTileContentProps {
  config: Record<string, unknown>;
  data: StatTileData;
  label?: string;
  componentId: string;
}

export function StatTileContent({
  config,
  data,
  label,
  componentId,
}: StatTileContentProps) {
  const metric = (config.metric as string) ?? label ?? "unknown";
  const metricLabel = metric.replace(/_/g, " ");

  const stat: StatItem = useMemo(
    () => ({
      key: metric,
      label: metricLabel,
      value: data.value,
      format: { kind: "number", compact: data.value >= 1000 },
      ...(data.trend !== 0 && {
        diff: {
          value: data.trend,
          decimals: 0,
          upIsPositive: true,
        },
      }),
      ...(data.sparkline &&
        data.sparkline.length >= 2 && {
          sparkline: {
            data: data.sparkline,
            color: "var(--foreground)",
          },
        }),
    }),
    [metric, metricLabel, data.value, data.trend, data.sparkline]
  );

  return <StatsDisplay id={`stats-${componentId}`} stats={[stat]} />;
}

export default StatTileContent;
