"use client";

import { formatRelativeTime, openInNewTab } from "./shared";
import type { VercelDeploymentData } from "./types";

interface DeploymentsContentProps {
  data: VercelDeploymentData[];
  componentId: string;
}

// State to visual display mapping
const STATE_BADGES: Record<string, { label: string; className: string }> = {
  READY: { label: "Ready", className: "bg-emerald-500/20 text-emerald-400" },
  BUILDING: { label: "Building", className: "bg-amber-500/20 text-amber-400 animate-pulse" },
  QUEUED: { label: "Queued", className: "bg-blue-500/20 text-blue-400" },
  INITIALIZING: { label: "Init", className: "bg-blue-500/20 text-blue-400" },
  ERROR: { label: "Error", className: "bg-red-500/20 text-red-400" },
  CANCELED: { label: "Canceled", className: "bg-zinc-500/20 text-zinc-400" },
};

export function DeploymentsContent({ data }: DeploymentsContentProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <p>No deployments found</p>
      </div>
    );
  }

  const handleDeploymentClick = (deployment: VercelDeploymentData) => {
    if (deployment.inspectorUrl) {
      openInNewTab(deployment.inspectorUrl);
    } else if (deployment.url) {
      openInNewTab(deployment.url);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium mb-2">
        Recent Deployments
      </div>
      <ul className="space-y-1.5">
        {data.map((deployment) => {
          const badge = STATE_BADGES[deployment.state] ?? STATE_BADGES.BUILDING;
          const isClickable = deployment.inspectorUrl || deployment.url;
          const isProduction = deployment.target === "production";

          return (
            <li
              key={deployment.id}
              className={`flex items-start gap-2 p-2 rounded-md bg-muted/30 ${
                isClickable
                  ? "cursor-pointer hover:bg-muted/50 transition-colors"
                  : ""
              }`}
              onClick={() => handleDeploymentClick(deployment)}
            >
              {/* Status badge */}
              <span
                className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded ${badge.className}`}
              >
                {badge.label}
              </span>

              {/* Deployment info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {isProduction && (
                    <span className="shrink-0 text-[10px] px-1 py-0.5 bg-violet-500/20 text-violet-400 rounded">
                      prod
                    </span>
                  )}
                  {deployment.commit ? (
                    <span className="truncate text-sm">
                      {deployment.commit.message.split("\n")[0] || deployment.commit.sha}
                    </span>
                  ) : (
                    <span className="truncate text-sm">{deployment.name}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {deployment.commit && (
                    <>
                      <span className="font-mono">{deployment.commit.sha}</span>
                      <span> by {deployment.commit.author}</span>
                      <span className="mx-1">·</span>
                    </>
                  )}
                  <span>{formatRelativeTime(deployment.createdAt)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default DeploymentsContent;
