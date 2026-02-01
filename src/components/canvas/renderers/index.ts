// Content renderers index - provides dynamic imports for code-splitting
// This allows each renderer to be loaded on-demand (bundle-dynamic-imports)

export { LoadingState, ErrorState, IdleState } from "./shared";

// Re-export types
export type * from "./types";

// Dynamic imports for content renderers
// These are loaded on-demand when needed, reducing initial bundle size
export const renderers = {
  "github.stat-tile": () => import("./StatTileContent"),
  "github.pr-list": () => import("./PRListContent"),
  "github.issue-grid": () => import("./IssueGridContent"),
  "github.activity-timeline": () => import("./ActivityTimelineContent"),
  "github.my-activity": () => import("./MyActivityContent"),
  "github.commits": () => import("./CommitsContent"),
  "github.team-activity": () => import("./TeamActivityContent"),
  "posthog.site-health": () => import("./SiteHealthContent"),
  "posthog.property-breakdown": () => import("./PropertyBreakdownContent"),
  "posthog.top-pages": () => import("./TopPagesContent"),
  "slack.channel-activity": () => import("./ChannelActivityContent"),
  "slack.mentions": () => import("./MentionsContent"),
  "slack.thread-watch": () => import("./ThreadWatchContent"),
} as const;

export type RendererTypeId = keyof typeof renderers;
