"use client";

// Component content renderer - renders the interior of a canvas component
// Positioning is handled by react-grid-layout, this just handles content

import { useCallback, useMemo } from "react";
import { useCanvas, useComponentData } from "@/hooks";
import type { ComponentInstance, DataLoadingState } from "@/types";
import {
  StatsDisplay,
  type StatItem,
  DataTable,
  type Column,
} from "@/components/tool-ui";
import { Button } from "@/components/ui/button";
import { RefreshCw, X, Loader2 } from "lucide-react";

// ============================================================================
// Type Definitions
// ============================================================================

interface ComponentContentProps {
  component: ComponentInstance;
  isSelected?: boolean;
}

/** API response shape for stat tiles */
interface StatTileData {
  value: number;
  trend: number;
  sparkline?: number[];
}

/** API response shape for pull requests */
interface PRData {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  createdAt: number;
  updatedAt: number;
}

/** Table row shape for PR list (with ISO date string) */
interface PRRow {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  updatedAt: string;
}

/** API response shape for issues */
interface IssueData {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  createdAt: number;
}

/** Table row shape for issue grid (with ISO date string) */
interface IssueRow {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  createdAt: string;
}

/** API response shape for activity timeline */
interface ActivityData {
  id: string;
  type: string;
  actor: string;
  message: string;
  timestamp: number;
}

/** API response shape for my activity */
interface MyActivityData {
  username: string;
  timeWindow: string;
  stats: {
    prsOpened: number;
    prsMerged: number;
    commits: number;
    reviews: number;
    issuesOpened: number;
    comments: number;
  };
  daily: Array<{ date: string; count: number }>;
  feed: Array<{
    id: string;
    type: string;
    repo: string;
    message: string;
    url?: string;
    timestamp: number;
  }>;
}

// ============================================================================
// Shared Constants
// ============================================================================

/** Icons for activity event types */
const ACTIVITY_TYPE_ICONS: Record<string, string> = {
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
// Shared Utilities
// ============================================================================

/**
 * Formats a timestamp as relative time (e.g., "5m ago", "2h ago", "3d ago")
 */
function formatRelativeTime(timestamp: number): string {
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
 * Formats a type ID for display (e.g., "github.pr-list" -> "Pr List")
 */
function formatTypeId(typeId: string): string {
  const lastSegment = typeId.split(".").pop() ?? typeId;
  return lastSegment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Opens a URL in a new tab
 */
function openInNewTab(url: string): void {
  window.open(url, "_blank");
}

/**
 * Creates a GitHub URL for a PR or issue
 */
function createGitHubItemUrl(
  repo: string,
  type: "pull" | "issues",
  number: number
): string {
  return `https://github.com/${repo}/${type}/${number}`;
}

// ============================================================================
// Sub-Components: Loading States
// ============================================================================

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full text-destructive text-sm">
      <p>Error: {message}</p>
    </div>
  );
}

function IdleState() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      <p>No data</p>
    </div>
  );
}

// ============================================================================
// Sub-Components: Header
// ============================================================================

interface ComponentHeaderProps {
  typeId: string;
  onRefresh: () => void;
  onRemove: () => void;
}

function ComponentHeader({ typeId, onRefresh, onRemove }: ComponentHeaderProps) {
  return (
    <div className="drag-handle flex items-center justify-between px-3 py-1.5 border-b border-transparent group-hover/component:border-border bg-transparent group-hover/component:bg-muted/50 cursor-move transition-all duration-150">
      <span className="text-sm font-medium truncate opacity-0 group-hover/component:opacity-100 transition-opacity duration-150">
        {formatTypeId(typeId)}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover/component:opacity-100 transition-opacity duration-150">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRefresh}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onRemove}
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-Components: Activity Feed (shared between timeline and my-activity)
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

function ActivityFeedItem({
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
        <p className="text-muted-foreground text-xs">
          {subtitle} · {formatRelativeTime(timestamp)}
        </p>
      </div>
    </li>
  );
}

// ============================================================================
// Sub-Components: Sparkline Bar Chart
// ============================================================================

interface SparklineBarChartProps {
  data: number[];
  labels?: string[];
  title?: string;
}

function SparklineBarChart({ data, labels, title }: SparklineBarChartProps) {
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
    </div>
  );
}

// ============================================================================
// Content Renderers
// ============================================================================

interface StatTileContentProps {
  config: Record<string, unknown>;
  data: StatTileData;
  label?: string;
  componentId: string;
}

function StatTileContent({
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

// ----------------------------------------------------------------------------

interface PRListContentProps {
  data: PRData[];
  repo: string;
  componentId: string;
}

function PRListContent({ data, repo, componentId }: PRListContentProps) {
  const columns: Column<PRRow>[] = useMemo(
    () => [
      { key: "number", label: "#", width: "50px", sortable: true },
      { key: "title", label: "Title", truncate: true, priority: "primary" },
      { key: "author", label: "Author", hideOnMobile: true },
      { key: "state", label: "State", format: { kind: "badge" } },
      {
        key: "updatedAt",
        label: "Updated",
        format: { kind: "date", dateFormat: "relative" },
        align: "right",
      },
    ],
    []
  );

  const rows: PRRow[] = useMemo(
    () =>
      data.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        state: pr.state,
        labels: pr.labels,
        updatedAt: new Date(pr.updatedAt).toISOString(),
      })),
    [data]
  );

  const handleRowClick = useCallback(
    (row: PRRow) => {
      if (repo) {
        openInNewTab(createGitHubItemUrl(repo, "pull", row.number));
      }
    },
    [repo]
  );

  return (
    <DataTable
      id={`pr-list-${componentId}`}
      columns={columns}
      data={rows}
      rowIdKey="id"
      emptyMessage="No pull requests"
      defaultSort={{ by: "updatedAt", direction: "desc" }}
      onRowClick={handleRowClick}
    />
  );
}

// ----------------------------------------------------------------------------

interface IssueGridContentProps {
  data: IssueData[];
  repo: string;
  componentId: string;
}

function IssueGridContent({ data, repo, componentId }: IssueGridContentProps) {
  const columns: Column<IssueRow>[] = useMemo(
    () => [
      { key: "number", label: "#", width: "50px", sortable: true },
      { key: "title", label: "Title", truncate: true, priority: "primary" },
      { key: "author", label: "Author", hideOnMobile: true },
      { key: "state", label: "State", format: { kind: "badge" } },
      {
        key: "createdAt",
        label: "Created",
        format: { kind: "date", dateFormat: "relative" },
        align: "right",
      },
    ],
    []
  );

  const rows: IssueRow[] = useMemo(
    () =>
      data.map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        author: issue.author,
        state: issue.state,
        labels: issue.labels,
        createdAt: new Date(issue.createdAt).toISOString(),
      })),
    [data]
  );

  const handleRowClick = useCallback(
    (row: IssueRow) => {
      if (repo) {
        openInNewTab(createGitHubItemUrl(repo, "issues", row.number));
      }
    },
    [repo]
  );

  return (
    <DataTable
      id={`issue-list-${componentId}`}
      columns={columns}
      data={rows}
      rowIdKey="id"
      emptyMessage="No issues"
      defaultSort={{ by: "createdAt", direction: "desc" }}
      onRowClick={handleRowClick}
    />
  );
}

// ----------------------------------------------------------------------------

interface ActivityTimelineContentProps {
  data: ActivityData[];
}

function ActivityTimelineContent({ data }: ActivityTimelineContentProps) {
  return (
    <ul className="space-y-2">
      {data.map((activity) => (
        <ActivityFeedItem
          key={activity.id}
          id={activity.id}
          type={activity.type}
          message={activity.message}
          subtitle={activity.actor}
          timestamp={activity.timestamp}
        />
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------------

interface MyActivityContentProps {
  data: MyActivityData;
  componentId: string;
}

function MyActivityContent({ data, componentId }: MyActivityContentProps) {
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
        label: "PRs Opened",
        value: stats.prsOpened,
        format: { kind: "number" },
      },
      {
        key: "prs_merged",
        label: "PRs Merged",
        value: stats.prsMerged,
        format: { kind: "number" },
      },
      {
        key: "reviews",
        label: "Reviews",
        value: stats.reviews,
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

// ============================================================================
// Data Content Router
// ============================================================================

interface DataContentProps {
  typeId: string;
  config: Record<string, unknown>;
  data: unknown;
  label?: string;
  componentId: string;
}

function DataContent({
  typeId,
  config,
  data,
  label,
  componentId,
}: DataContentProps) {
  switch (typeId) {
    case "github.stat-tile":
      return (
        <StatTileContent
          config={config}
          data={data as StatTileData}
          label={label}
          componentId={componentId}
        />
      );

    case "github.pr-list":
      return (
        <PRListContent
          data={data as PRData[]}
          repo={(config.repo as string) ?? ""}
          componentId={componentId}
        />
      );

    case "github.issue-grid":
      return (
        <IssueGridContent
          data={data as IssueData[]}
          repo={(config.repo as string) ?? ""}
          componentId={componentId}
        />
      );

    case "github.activity-timeline":
      return <ActivityTimelineContent data={data as ActivityData[]} />;

    case "github.my-activity":
      return (
        <MyActivityContent
          data={data as MyActivityData}
          componentId={componentId}
        />
      );

    default:
      return (
        <pre className="text-xs overflow-auto whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

// ============================================================================
// Content State Renderer
// ============================================================================

interface ContentStateProps {
  dataState: DataLoadingState;
  typeId: string;
  config: Record<string, unknown>;
  label?: string;
  componentId: string;
}

function ContentState({
  dataState,
  typeId,
  config,
  label,
  componentId,
}: ContentStateProps) {
  switch (dataState.status) {
    case "loading":
      return <LoadingState />;

    case "error":
      return <ErrorState message={dataState.error.message} />;

    case "idle":
      return <IdleState />;

    case "ready":
    case "stale":
      return (
        <DataContent
          typeId={typeId}
          config={config}
          data={dataState.data}
          label={label}
          componentId={componentId}
        />
      );

    default:
      return <IdleState />;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function ComponentContent({
  component,
  isSelected: _isSelected,
}: ComponentContentProps) {
  const { removeComponent } = useCanvas();
  const { dataState, refresh } = useComponentData(component.id);

  const handleRemove = useCallback(() => {
    removeComponent(component.id);
  }, [component.id, removeComponent]);

  return (
    <div className="group/component flex flex-col h-full">
      <ComponentHeader
        typeId={component.typeId}
        onRefresh={refresh}
        onRemove={handleRemove}
      />

      <div className="flex-1 p-3 overflow-auto">
        <ContentState
          dataState={dataState}
          typeId={component.typeId}
          config={component.config}
          label={component.meta.label}
          componentId={component.id}
        />
      </div>
    </div>
  );
}
