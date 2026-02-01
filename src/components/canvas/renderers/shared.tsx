// Shared utilities and components for content renderers
// Extracted from ComponentContent.tsx for code-splitting (bundle-dynamic-imports)

import { Loader2 } from "lucide-react";

// ============================================================================
// Constants
// ============================================================================

/** Icons for activity event types */
export const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  push: "⬆",
  commit: "⬆",
  pr: "🔀",
  review: "👀",
  issue: "📋",
  comment: "💬",
  create: "✨",
  release: "🏷",
  other: "•",
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats a timestamp as relative time (e.g., "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Opens a URL in a new tab
 */
export function openInNewTab(url: string): void {
  window.open(url, "_blank");
}

/**
 * Creates a GitHub URL for a PR or issue
 */
export function createGitHubItemUrl(
  repo: string,
  type: "pull" | "issues",
  number: number
): string {
  return `https://github.com/${repo}/${type}/${number}`;
}

// ============================================================================
// Loading States
// ============================================================================

export function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full text-destructive text-sm">
      <p>Error: {message}</p>
    </div>
  );
}

export function IdleState() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      <p>No data</p>
    </div>
  );
}

// ============================================================================
// Activity Feed Item (shared between timeline and my-activity)
// ============================================================================

interface ActivityFeedItemProps {
  id: string;
  type: string;
  message: string;
  subtitle: string;
  timestamp: number;
  url?: string;
  onItemClick?: (url: string) => void;
}

export function ActivityFeedItem({
  type,
  message,
  subtitle,
  timestamp,
  url,
  onItemClick,
}: ActivityFeedItemProps) {
  const isClickable = !!url && !!onItemClick;
  const icon = ACTIVITY_TYPE_ICONS[type] ?? ACTIVITY_TYPE_ICONS.other;

  const handleClick = () => {
    if (isClickable && url) {
      onItemClick(url);
    }
  };

  return (
    <li
      className={`flex items-start gap-2 text-sm ${
        isClickable
          ? "cursor-pointer hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded transition-colors"
          : ""
      }`}
      onClick={handleClick}
    >
      <span className="shrink-0 w-5 text-center" title={type}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate">{message}</p>
        <p className="text-muted-foreground text-xs truncate">
          <span className="truncate">{subtitle}</span>
          <span className="shrink-0"> · {formatRelativeTime(timestamp)}</span>
        </p>
      </div>
    </li>
  );
}

// ============================================================================
// Sparkline Bar Chart
// ============================================================================

interface SparklineBarChartProps {
  data: number[];
  labels?: string[];
  title?: string;
  showEndpointLabels?: boolean;
}

export function SparklineBarChart({
  data,
  labels,
  title,
  showEndpointLabels = true,
}: SparklineBarChartProps) {
  const maxValue = Math.max(...data, 1);

  return (
    <div className="px-1">
      {title && (
        <div className="text-xs text-muted-foreground mb-1">{title}</div>
      )}
      <div className="flex items-end gap-0.5 h-8">
        {data.map((value, index) => {
          const heightPercent = Math.max(4, (value / maxValue) * 100);
          const label = labels?.[index];

          return (
            <div
              key={index}
              className="flex-1 bg-primary/60 rounded-sm transition-all"
              style={{ height: `${heightPercent}%` }}
              title={label ? `${label}: ${value} activities` : undefined}
            />
          );
        })}
      </div>
      {showEndpointLabels && data.length > 1 && (
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>{data.length - 1}d ago</span>
          <span>today</span>
        </div>
      )}
    </div>
  );
}
