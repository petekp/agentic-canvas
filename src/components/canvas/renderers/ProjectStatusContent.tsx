"use client";

import { useMemo } from "react";
import { formatRelativeTime, openInNewTab } from "./shared";
import type { VercelProjectData } from "./types";

interface ProjectStatusContentProps {
  data: VercelProjectData;
  componentId: string;
}

// State to visual display mapping
const STATE_INDICATORS: Record<string, { color: string; label: string }> = {
  READY: { color: "bg-emerald-500", label: "Live" },
  BUILDING: { color: "bg-amber-500 animate-pulse", label: "Building" },
  ERROR: { color: "bg-red-500", label: "Error" },
  QUEUED: { color: "bg-blue-500", label: "Queued" },
};

export function ProjectStatusContent({ data }: ProjectStatusContentProps) {
  const statusInfo = useMemo(() => {
    if (!data.latestProduction) {
      return { color: "bg-zinc-500", label: "No Deploy" };
    }
    return STATE_INDICATORS[data.latestProduction.state] ?? STATE_INDICATORS.READY;
  }, [data.latestProduction]);

  const handleClick = () => {
    if (data.latestProduction?.url) {
      openInNewTab(data.latestProduction.url);
    }
  };

  return (
    <div
      className={`h-full flex flex-col justify-between ${
        data.latestProduction?.url ? "cursor-pointer" : ""
      }`}
      onClick={handleClick}
    >
      {/* Top: Project name and framework */}
      <div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusInfo.color}`} />
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {statusInfo.label}
          </span>
        </div>
        <div className="mt-1 text-lg font-semibold truncate">{data.name}</div>
        <div className="text-xs text-muted-foreground">
          {data.framework ?? "unknown framework"}
        </div>
      </div>

      {/* Bottom: Latest deployment info */}
      <div className="text-xs text-muted-foreground">
        {data.latestProduction ? (
          <>
            <div className="truncate">
              {data.latestProduction.url && (
                <span className="text-primary hover:underline">
                  {data.latestProduction.url.replace("https://", "")}
                </span>
              )}
            </div>
            <div>{formatRelativeTime(data.latestProduction.createdAt)}</div>
          </>
        ) : (
          <div>No production deployment</div>
        )}
      </div>
    </div>
  );
}

export default ProjectStatusContent;
