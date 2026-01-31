"use client";

// Component content renderer - renders the interior of a canvas component
// Positioning is handled by react-grid-layout, this just handles content

import { useCallback } from "react";
import { useCanvas, useComponentData } from "@/hooks";
import type { ComponentInstance } from "@/types";
import {
  StatsDisplay,
  type StatItem,
  DataTable,
  type Column,
} from "@/components/tool-ui";
import { Button } from "@/components/ui/button";
import { RefreshCw, X, Loader2 } from "lucide-react";

interface ComponentContentProps {
  component: ComponentInstance;
  isSelected?: boolean;
}

export function ComponentContent({ component, isSelected: _isSelected }: ComponentContentProps) {
  const { removeComponent } = useCanvas();
  const { dataState, refresh } = useComponentData(component.id);

  const { typeId, config } = component;

  const handleRemove = useCallback(() => {
    removeComponent(component.id);
  }, [component.id, removeComponent]);

  return (
    <div className="group/component flex flex-col h-full">
      {/* Component header - acts as drag handle, visible on hover */}
      <div className="drag-handle flex items-center justify-between px-3 py-1.5 border-b border-transparent group-hover/component:border-border bg-transparent group-hover/component:bg-muted/50 cursor-move transition-all duration-150">
        <span className="text-sm font-medium truncate opacity-0 group-hover/component:opacity-100 transition-opacity duration-150">
          {formatTypeId(typeId)}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/component:opacity-100 transition-opacity duration-150">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={refresh}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleRemove}
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Component content */}
      <div className="flex-1 p-3 overflow-auto">
        {dataState.status === "loading" && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {dataState.status === "error" && (
          <div className="flex items-center justify-center h-full text-destructive text-sm">
            <p>Error: {dataState.error.message}</p>
          </div>
        )}

        {dataState.status === "idle" && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <p>No data</p>
          </div>
        )}

        {dataState.status === "ready" && (
          <DataContent
            typeId={typeId}
            config={config}
            data={dataState.data}
            label={component.meta.label}
            componentId={component.id}
          />
        )}
      </div>
    </div>
  );
}

// Data content renderer based on component type
function DataContent({
  typeId,
  config,
  data,
  label,
  componentId,
}: {
  typeId: string;
  config: Record<string, unknown>;
  data: unknown;
  label?: string;
  componentId: string;
}) {
  switch (typeId) {
    case "github.stat-tile":
      return (
        <StatTileContent
          config={config}
          data={data as { value: number; trend: number }}
          label={label}
          componentId={componentId}
        />
      );
    case "github.pr-list":
      return (
        <PRListContent
          data={data as Array<{
            id: string;
            number: number;
            title: string;
            author: string;
            state: string;
            labels: string[];
            createdAt: number;
            updatedAt: number;
          }>}
          componentId={componentId}
        />
      );
    case "github.issue-grid":
      return (
        <IssueGridContent
          data={data as Array<{
            id: string;
            number: number;
            title: string;
            author: string;
            state: string;
            labels: string[];
            createdAt: number;
          }>}
          componentId={componentId}
        />
      );
    case "github.activity-timeline":
      return (
        <ActivityTimelineContent
          data={
            data as Array<{
              id: string;
              type: string;
              actor: string;
              message: string;
              timestamp: number;
            }>
          }
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

// Stat tile renderer using tool-ui StatsDisplay
function StatTileContent({
  config,
  data,
  label,
  componentId,
}: {
  config: Record<string, unknown>;
  data: { value: number; trend: number; sparkline?: number[] };
  label?: string;
  componentId: string;
}) {
  // Use config.metric if available, otherwise fall back to label
  const metric = (config.metric as string) ?? label ?? "unknown";
  const metricLabel = metric.replace(/_/g, " ");

  // Build stat item for StatsDisplay
  const stat: StatItem = {
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
    // Add sparkline if available
    ...(data.sparkline && data.sparkline.length >= 2 && {
      sparkline: {
        data: data.sparkline,
        color: "var(--foreground)",
      },
    }),
  };

  return (
    <StatsDisplay
      id={`stats-${componentId}`}
      stats={[stat]}
    />
  );
}

// PR data row type
interface PRRow {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  updatedAt: string;
}

// PR list renderer using DataTable
function PRListContent({
  data,
  componentId,
}: {
  data: Array<{
    id: string;
    number: number;
    title: string;
    author: string;
    state: string;
    labels: string[];
    createdAt: number;
    updatedAt: number;
  }>;
  componentId: string;
}) {
  const columns: Column<PRRow>[] = [
    { key: "number", label: "#", width: "50px", sortable: true },
    { key: "title", label: "Title", truncate: true, priority: "primary" },
    { key: "author", label: "Author", hideOnMobile: true },
    { key: "state", label: "State", format: { kind: "badge" } },
    { key: "updatedAt", label: "Updated", format: { kind: "date", dateFormat: "relative" }, align: "right" },
  ];

  const rows: PRRow[] = data.map((pr) => ({
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    state: pr.state,
    labels: pr.labels,
    updatedAt: new Date(pr.updatedAt).toISOString(),
  }));

  return (
    <DataTable
      id={`pr-list-${componentId}`}
      columns={columns}
      data={rows}
      rowIdKey="id"
      emptyMessage="No pull requests"
      defaultSort={{ by: "updatedAt", direction: "desc" }}
    />
  );
}

// Issue data row type
interface IssueRow {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  createdAt: string;
}

// Issue grid renderer using DataTable
function IssueGridContent({
  data,
  componentId,
}: {
  data: Array<{
    id: string;
    number: number;
    title: string;
    author: string;
    state: string;
    labels: string[];
    createdAt: number;
  }>;
  componentId: string;
}) {
  const columns: Column<IssueRow>[] = [
    { key: "number", label: "#", width: "50px", sortable: true },
    { key: "title", label: "Title", truncate: true, priority: "primary" },
    { key: "author", label: "Author", hideOnMobile: true },
    { key: "state", label: "State", format: { kind: "badge" } },
    { key: "createdAt", label: "Created", format: { kind: "date", dateFormat: "relative" }, align: "right" },
  ];

  const rows: IssueRow[] = data.map((issue) => ({
    id: issue.id,
    number: issue.number,
    title: issue.title,
    author: issue.author,
    state: issue.state,
    labels: issue.labels,
    createdAt: new Date(issue.createdAt).toISOString(),
  }));

  return (
    <DataTable
      id={`issue-list-${componentId}`}
      columns={columns}
      data={rows}
      rowIdKey="id"
      emptyMessage="No issues"
      defaultSort={{ by: "createdAt", direction: "desc" }}
    />
  );
}

// Activity timeline renderer
function ActivityTimelineContent({
  data,
}: {
  data: Array<{ id: string; type: string; actor: string; message: string; timestamp: number }>;
}) {
  const typeIcons: Record<string, string> = {
    push: "⬆",
    pr: "🔀",
    issue: "📋",
    comment: "💬",
    release: "🏷",
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <ul className="space-y-2">
      {data.map((activity) => (
        <li key={activity.id} className="flex items-start gap-2 text-sm">
          <span className="shrink-0 w-5 text-center" title={activity.type}>
            {typeIcons[activity.type] ?? "•"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate">{activity.message}</p>
            <p className="text-muted-foreground text-xs">
              {activity.actor} · {formatTime(activity.timestamp)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Helper to format type ID for display
function formatTypeId(typeId: string): string {
  return (
    typeId
      .split(".")
      .pop()
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? typeId
  );
}

