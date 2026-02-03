import type { DataBinding } from "@/types";

export const DEFAULT_SIZES: Record<string, { cols: number; rows: number }> = {
  "github.stat-tile": { cols: 2, rows: 2 },
  "github.pr-list": { cols: 4, rows: 3 },
  "github.issue-grid": { cols: 4, rows: 3 },
  "github.activity-timeline": { cols: 3, rows: 4 },
  "github.my-activity": { cols: 4, rows: 5 },
  "github.commits": { cols: 4, rows: 4 },
  "github.team-activity": { cols: 5, rows: 5 },
  "posthog.site-health": { cols: 4, rows: 3 },
  "posthog.property-breakdown": { cols: 4, rows: 3 },
  "posthog.top-pages": { cols: 4, rows: 4 },
  "slack.channel-activity": { cols: 4, rows: 4 },
  "slack.mentions": { cols: 4, rows: 3 },
  "slack.thread-watch": { cols: 3, rows: 4 },
};

export const DEFAULT_BINDINGS: Record<string, DataBinding> = {
  "github.stat-tile": {
    source: "mock-github",
    query: { type: "stats", params: { metric: "open_prs" } },
    refreshInterval: 60000,
  },
  "github.pr-list": {
    source: "mock-github",
    query: { type: "pull_requests", params: {} },
    refreshInterval: 60000,
  },
  "github.issue-grid": {
    source: "mock-github",
    query: { type: "issues", params: {} },
    refreshInterval: 60000,
  },
  "github.activity-timeline": {
    source: "mock-github",
    query: { type: "activity", params: {} },
    refreshInterval: 60000,
  },
  "github.my-activity": {
    source: "mock-github",
    query: { type: "my_activity", params: { timeWindow: "7d", feedLimit: 10 } },
    refreshInterval: 60000,
  },
  "github.commits": {
    source: "mock-github",
    query: { type: "commits", params: { timeWindow: "7d", limit: 30 } },
    refreshInterval: 60000,
  },
  "github.team-activity": {
    source: "mock-github",
    query: { type: "team_activity", params: { timeWindow: "7d" } },
    refreshInterval: 120000,
  },
  "posthog.site-health": {
    source: "posthog",
    query: { type: "site_health", params: { timeWindow: "7d" } },
    refreshInterval: 120000,
  },
  "posthog.property-breakdown": {
    source: "posthog",
    query: { type: "property_breakdown", params: { timeWindow: "7d", metric: "visitors" } },
    refreshInterval: 120000,
  },
  "posthog.top-pages": {
    source: "posthog",
    query: { type: "top_pages", params: { timeWindow: "7d", limit: 10 } },
    refreshInterval: 120000,
  },
  "slack.channel-activity": {
    source: "slack",
    query: { type: "channel_activity", params: { limit: 20 } },
    refreshInterval: 60000,
  },
  "slack.mentions": {
    source: "slack",
    query: { type: "mentions", params: { limit: 10 } },
    refreshInterval: 60000,
  },
  "slack.thread-watch": {
    source: "slack",
    query: { type: "thread_watch", params: {} },
    refreshInterval: 30000,
  },
};

export function getDefaultSize(typeId: string): { cols: number; rows: number } | undefined {
  return DEFAULT_SIZES[typeId];
}

export function getDefaultBinding(typeId: string): DataBinding | undefined {
  return DEFAULT_BINDINGS[typeId];
}
