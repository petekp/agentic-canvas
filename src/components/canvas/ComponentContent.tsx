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

/** API response shape for commits */
interface CommitData {
  sha: string;
  message: string;
  author: string;
  authorAvatar?: string;
  timestamp: number;
  url: string;
}

/** API response shape for team activity */
interface TeamActivityData {
  repo: string;
  timeWindow: string;
  totalCommits: number;
  contributors: Array<{
    login: string;
    avatar: string;
    commits: number;
    lastActive: number;
    themes: string[];
    recentCommits: string[];
  }>;
  daily: Array<{ date: string; count: number }>;
}

// PostHog Analytics Types
// ============================================================================

/** API response shape for PostHog site health */
interface SiteHealthData {
  uniqueVisitors: number;
  pageviews: number;
  newVisitorRatio: number;
  daily: Array<{ date: string; visitors: number }>;
}

/** API response shape for PostHog property breakdown */
interface PropertyBreakdownData {
  properties: Array<{
    name: string;
    value: number;
    percentage: number;
  }>;
  total: number;
}

/** API response shape for PostHog top pages */
interface TopPagesData {
  pages: Array<{
    path: string;
    property: string;
    views: number;
  }>;
}

// Slack Types
// ============================================================================

/** API response shape for Slack channel activity */
interface SlackMessageData {
  ts: string;
  user: string;
  userId?: string;
  text: string;
  threadTs?: string;
  replyCount?: number;
  reactions?: Array<{ name: string; count: number }>;
  timestamp: number;
}

/** API response shape for Slack mentions */
interface SlackMentionData {
  ts: string;
  user: string;
  userId?: string;
  text: string;
  channel: string;
  channelId?: string;
  permalink?: string;
  timestamp: number;
}

/** API response shape for Slack thread watch */
interface SlackThreadData {
  parent: {
    ts: string;
    user: string;
    userId?: string;
    text: string;
    timestamp: number;
  } | null;
  replies: Array<{
    ts: string;
    user: string;
    userId?: string;
    text: string;
    reactions?: Array<{ name: string; count: number }>;
    timestamp: number;
  }>;
  replyCount: number;
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
    <div className="absolute inset-x-0 top-0 z-10 drag-handle flex items-center justify-between px-3 py-2 bg-gradient-to-b from-zinc-900/90 via-zinc-900/60 to-transparent opacity-0 group-hover/component:opacity-100 pointer-events-none group-hover/component:pointer-events-auto cursor-move transition-opacity duration-150">
      <span className="text-sm font-medium truncate text-foreground/90">
        {formatTypeId(typeId)}
      </span>
      <div className="flex items-center gap-0.5">
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
        <p className="text-muted-foreground text-xs truncate">
          <span className="truncate">{subtitle}</span>
          <span className="shrink-0"> · {formatRelativeTime(timestamp)}</span>
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
  showEndpointLabels?: boolean;
}

function SparklineBarChart({
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

// ----------------------------------------------------------------------------

interface CommitsContentProps {
  data: CommitData[];
}

function CommitsContent({ data }: CommitsContentProps) {
  const handleCommitClick = useCallback((url: string) => {
    openInNewTab(url);
  }, []);

  return (
    <div className="flex flex-col gap-1 h-full overflow-auto">
      {data.map((commit) => (
        <div
          key={commit.sha}
          className="flex items-start gap-2 text-sm py-1.5 px-1 -mx-1 rounded cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => handleCommitClick(commit.url)}
        >
          <code className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">
            {commit.sha}
          </code>
          <div className="min-w-0 flex-1">
            <p className="truncate">{commit.message}</p>
            <p className="text-xs text-muted-foreground">
              {commit.author} · {formatRelativeTime(commit.timestamp)}
            </p>
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">
          No commits in this time window
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

interface TeamActivityContentProps {
  data: TeamActivityData;
  componentId: string;
}

function TeamActivityContent({ data, componentId }: TeamActivityContentProps) {
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

// ============================================================================
// PostHog Content Renderers
// ============================================================================

interface SiteHealthContentProps {
  data: SiteHealthData;
  componentId: string;
}

function SiteHealthContent({ data, componentId }: SiteHealthContentProps) {
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

// ----------------------------------------------------------------------------

interface PropertyBreakdownContentProps {
  data: PropertyBreakdownData;
  componentId: string;
}

function PropertyBreakdownContent({
  data,
  componentId: _componentId,
}: PropertyBreakdownContentProps) {
  const { properties, total } = data;
  const maxValue = properties[0]?.value ?? 1;

  return (
    <div className="flex flex-col gap-2 h-full overflow-auto">
      <div className="text-xs text-muted-foreground">
        {total.toLocaleString()} total
      </div>
      <div className="flex flex-col gap-1.5">
        {properties.map((prop) => {
          const widthPercent = (prop.value / maxValue) * 100;
          return (
            <div key={prop.name} className="flex flex-col gap-0.5">
              <div className="flex justify-between text-sm">
                <span className="truncate">{prop.name}</span>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {prop.value.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
        {properties.length === 0 && (
          <div className="text-muted-foreground text-sm text-center py-4">
            No data available
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

interface TopPagesContentProps {
  data: TopPagesData;
}

function TopPagesContent({ data }: TopPagesContentProps) {
  const { pages } = data;

  const handlePageClick = useCallback((property: string, path: string) => {
    const url = `https://${property}${path}`;
    openInNewTab(url);
  }, []);

  return (
    <div className="flex flex-col gap-1 h-full overflow-auto">
      {pages.map((page, index) => (
        <div
          key={`${page.property}::${page.path}`}
          className="flex items-center gap-2 text-sm py-1 px-1 -mx-1 rounded cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => handlePageClick(page.property, page.path)}
        >
          <span className="text-muted-foreground w-5 text-right shrink-0">
            {index + 1}.
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate">{page.path}</p>
            <p className="text-xs text-muted-foreground truncate">
              {page.property}
            </p>
          </div>
          <span className="text-muted-foreground shrink-0">
            {page.views.toLocaleString()}
          </span>
        </div>
      ))}
      {pages.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">
          No pages tracked
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Slack Content Renderers
// ============================================================================

interface ChannelActivityContentProps {
  data: SlackMessageData[];
}

function ChannelActivityContent({ data }: ChannelActivityContentProps) {
  return (
    <div className="flex flex-col gap-2 h-full overflow-auto">
      {data.map((msg) => (
        <div
          key={msg.ts}
          className="flex flex-col gap-0.5 text-sm py-1.5 border-b border-border/50 last:border-0"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{msg.user}</span>
            <span className="text-muted-foreground text-xs shrink-0">
              {formatRelativeTime(msg.timestamp)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{msg.text}</p>
          {msg.reactions && msg.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {msg.reactions.slice(0, 5).map((r) => (
                <span
                  key={r.name}
                  className="inline-flex items-center gap-0.5 text-xs bg-muted px-1.5 py-0.5 rounded"
                >
                  :{r.name}: {r.count}
                </span>
              ))}
            </div>
          )}
          {msg.replyCount && msg.replyCount > 0 && (
            <span className="text-xs text-primary">
              {msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}
            </span>
          )}
        </div>
      ))}
      {data.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">
          No messages
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

interface MentionsContentProps {
  data: SlackMentionData[];
}

function MentionsContent({ data }: MentionsContentProps) {
  const handleMentionClick = useCallback((permalink?: string) => {
    if (permalink) {
      openInNewTab(permalink);
    }
  }, []);

  return (
    <div className="flex flex-col gap-2 h-full overflow-auto">
      {data.map((mention) => (
        <div
          key={mention.ts}
          className={`flex flex-col gap-0.5 text-sm py-1.5 border-b border-border/50 last:border-0 ${
            mention.permalink ? "cursor-pointer hover:bg-muted/50 -mx-1 px-1 rounded" : ""
          }`}
          onClick={() => handleMentionClick(mention.permalink)}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{mention.user}</span>
            <span className="text-muted-foreground text-xs">in #{mention.channel}</span>
            <span className="text-muted-foreground text-xs shrink-0 ml-auto">
              {formatRelativeTime(mention.timestamp)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{mention.text}</p>
        </div>
      ))}
      {data.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">
          No mentions
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

interface ThreadWatchContentProps {
  data: SlackThreadData;
}

function ThreadWatchContent({ data }: ThreadWatchContentProps) {
  const { parent, replies } = data;

  if (!parent) {
    return (
      <div className="text-muted-foreground text-sm text-center py-4">
        Thread not found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-auto">
      {/* Parent message */}
      <div className="flex flex-col gap-1 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-medium">{parent.user}</span>
          <span className="text-muted-foreground text-xs">
            {formatRelativeTime(parent.timestamp)}
          </span>
        </div>
        <p className="text-sm">{parent.text}</p>
      </div>

      {/* Replies */}
      <div className="flex flex-col gap-2 flex-1 overflow-auto">
        {replies.map((reply) => (
          <div
            key={reply.ts}
            className="flex flex-col gap-0.5 text-sm pl-3 border-l-2 border-muted"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{reply.user}</span>
              <span className="text-muted-foreground text-xs shrink-0">
                {formatRelativeTime(reply.timestamp)}
              </span>
            </div>
            <p className="text-muted-foreground">{reply.text}</p>
            {reply.reactions && reply.reactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {reply.reactions.slice(0, 3).map((r) => (
                  <span
                    key={r.name}
                    className="inline-flex items-center gap-0.5 text-xs bg-muted px-1.5 py-0.5 rounded"
                  >
                    :{r.name}: {r.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {replies.length === 0 && (
          <div className="text-muted-foreground text-sm text-center py-2">
            No replies yet
          </div>
        )}
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

    case "github.commits":
      return <CommitsContent data={data as CommitData[]} />;

    case "github.team-activity":
      return (
        <TeamActivityContent
          data={data as TeamActivityData}
          componentId={componentId}
        />
      );

    // PostHog Analytics Components
    case "posthog.site-health":
      return (
        <SiteHealthContent
          data={data as SiteHealthData}
          componentId={componentId}
        />
      );

    case "posthog.property-breakdown":
      return (
        <PropertyBreakdownContent
          data={data as PropertyBreakdownData}
          componentId={componentId}
        />
      );

    case "posthog.top-pages":
      return <TopPagesContent data={data as TopPagesData} />;

    // Slack Components
    case "slack.channel-activity":
      return <ChannelActivityContent data={data as SlackMessageData[]} />;

    case "slack.mentions":
      return <MentionsContent data={data as SlackMentionData[]} />;

    case "slack.thread-watch":
      return <ThreadWatchContent data={data as SlackThreadData} />;

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
    <div className="group/component relative h-full">
      {/* Chrome overlay - appears on hover */}
      <ComponentHeader
        typeId={component.typeId}
        onRefresh={refresh}
        onRemove={handleRemove}
      />

      {/* Full-bleed content */}
      <div className="h-full p-3 overflow-auto">
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
