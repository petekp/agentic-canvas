"use client";

// Renders a component instance on the canvas
// Handles positioning, sizing, and basic interactions

import { useCallback } from "react";
import { useCanvas, useComponentData } from "@/hooks";
import type { ComponentInstance, GridConfig } from "@/types";

interface ComponentRendererProps {
  component: ComponentInstance;
  grid: GridConfig;
}

export function ComponentRenderer({ component, grid }: ComponentRendererProps) {
  const { removeComponent } = useCanvas();
  const { dataState, refresh } = useComponentData(component.id);

  const { position, size, typeId, config } = component;
  const { cellWidth, cellHeight, gap } = grid;

  // Calculate pixel position and size
  const x = position.col * (cellWidth + gap);
  const y = position.row * (cellHeight + gap);
  const width = size.cols * cellWidth + (size.cols - 1) * gap;
  const height = size.rows * cellHeight + (size.rows - 1) * gap;

  const handleRemove = useCallback(() => {
    removeComponent(component.id);
  }, [component.id, removeComponent]);

  // Don't render until grid dimensions are set
  if (cellWidth === 0 || cellHeight === 0) {
    return null;
  }

  return (
    <div
      className="absolute rounded-lg border border-[var(--grid-line)] bg-[var(--background)] shadow-sm overflow-hidden transition-shadow hover:shadow-md"
      style={{
        left: x,
        top: y,
        width,
        height,
      }}
    >
      {/* Component header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--grid-color)] bg-[var(--grid-color)]/50">
        <span className="text-sm font-medium truncate">{formatTypeId(typeId)}</span>
        <div className="flex gap-1">
          <button
            onClick={refresh}
            className="p-1 rounded hover:bg-[var(--grid-line)] transition-colors"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
          <button
            onClick={handleRemove}
            className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
            title="Remove"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Component content */}
      <div className="p-3 h-[calc(100%-41px)] overflow-auto">
        {dataState.status === "loading" && (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--grid-line)] border-t-[var(--foreground)]" />
          </div>
        )}

        {dataState.status === "error" && (
          <div className="flex items-center justify-center h-full text-red-500 text-sm">
            <p>Error: {dataState.error.message}</p>
          </div>
        )}

        {dataState.status === "idle" && (
          <div className="flex items-center justify-center h-full text-[var(--foreground)]/50 text-sm">
            <p>No data</p>
          </div>
        )}

        {dataState.status === "ready" && (
          <ComponentContent typeId={typeId} config={config} data={dataState.data} />
        )}
      </div>
    </div>
  );
}

// Simple content renderer based on component type
function ComponentContent({
  typeId,
  config,
  data,
}: {
  typeId: string;
  config: Record<string, unknown>;
  data: unknown;
}) {
  // v0.1: Simple JSON display, replace with proper component renderers
  switch (typeId) {
    case "github.stat-tile":
      return <StatTileContent config={config} data={data as { value: number; trend: number }} />;
    case "github.pr-list":
      return <PRListContent data={data as Array<{ id: string; title: string; author: string; state: string }> } />;
    case "github.issue-grid":
      return <IssueGridContent data={data as Array<{ id: string; title: string; state: string; labels: string[] }> } />;
    default:
      return (
        <pre className="text-xs overflow-auto whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

// Stat tile renderer
function StatTileContent({
  config,
  data,
}: {
  config: Record<string, unknown>;
  data: { value: number; trend: number };
}) {
  const metric = (config.metric as string) ?? "unknown";
  const trendColor = data.trend > 0 ? "text-green-500" : data.trend < 0 ? "text-red-500" : "";

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-3xl font-bold">{data.value}</p>
      <p className="text-sm text-[var(--foreground)]/70 capitalize">{metric.replace(/_/g, " ")}</p>
      {data.trend !== 0 && (
        <p className={`text-sm ${trendColor}`}>
          {data.trend > 0 ? "+" : ""}
          {data.trend}
        </p>
      )}
    </div>
  );
}

// PR list renderer
function PRListContent({
  data,
}: {
  data: Array<{ id: string; title: string; author: string; state: string }>;
}) {
  return (
    <ul className="space-y-2">
      {data.map((pr) => (
        <li key={pr.id} className="flex items-start gap-2 text-sm">
          <span
            className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${
              pr.state === "open" ? "bg-green-500" : pr.state === "merged" ? "bg-purple-500" : "bg-gray-500"
            }`}
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{pr.title}</p>
            <p className="text-[var(--foreground)]/50 text-xs">{pr.author}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Issue grid renderer
function IssueGridContent({
  data,
}: {
  data: Array<{ id: string; title: string; state: string; labels: string[] }>;
}) {
  return (
    <ul className="space-y-2">
      {data.map((issue) => (
        <li key={issue.id} className="text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 w-2 h-2 rounded-full ${
                issue.state === "open" ? "bg-green-500" : "bg-gray-500"
              }`}
            />
            <p className="truncate">{issue.title}</p>
          </div>
          {issue.labels.length > 0 && (
            <div className="flex gap-1 mt-1 ml-4">
              {issue.labels.slice(0, 3).map((label) => (
                <span
                  key={label}
                  className="px-1.5 py-0.5 text-xs rounded bg-[var(--grid-color)]"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// Helper to format type ID for display
function formatTypeId(typeId: string): string {
  return typeId
    .split(".")
    .pop()
    ?.replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? typeId;
}

// Icons
function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
