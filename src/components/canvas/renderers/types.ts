// Type definitions for content renderers
// Extracted from ComponentContent.tsx for code-splitting

export type { MorningBriefComponentData } from "@/types";

/** API response shape for stat tiles */
export interface StatTileData {
  value: number;
  trend: number;
  sparkline?: number[];
}

/** API response shape for pull requests */
export interface PRData {
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
export interface PRRow {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  updatedAt: string;
}

/** API response shape for issues */
export interface IssueData {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  createdAt: number;
}

/** Table row shape for issue grid (with ISO date string) */
export interface IssueRow {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  labels: string[];
  createdAt: string;
}

/** API response shape for activity timeline */
export interface ActivityData {
  id: string;
  type: string;
  actor: string;
  message: string;
  timestamp: number;
}

/** API response shape for my activity */
export interface MyActivityData {
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
export interface CommitData {
  sha: string;
  message: string;
  author: string;
  authorAvatar?: string;
  timestamp: number;
  url: string;
}

/** API response shape for team activity */
export interface TeamActivityData {
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
export interface SiteHealthData {
  uniqueVisitors: number;
  pageviews: number;
  newVisitorRatio: number;
  daily: Array<{ date: string; visitors: number }>;
}

/** API response shape for PostHog property breakdown */
export interface PropertyBreakdownData {
  properties: Array<{
    name: string;
    value: number;
    percentage: number;
  }>;
  total: number;
}

/** API response shape for PostHog top pages */
export interface TopPagesData {
  pages: Array<{
    path: string;
    property: string;
    views: number;
  }>;
}

// Slack Types
// ============================================================================

/** API response shape for Slack channel activity */
export interface SlackMessageData {
  ts: string;
  user: string;
  userId?: string;
  text: string;
  mentions?: Array<{
    userId: string;
    username?: string;
    displayName?: string;
  }>;
  threadTs?: string;
  replyCount?: number;
  reactions?: Array<{ name: string; count: number }>;
  timestamp: number;
}

/** API response shape for Slack mentions */
export interface SlackMentionData {
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
export interface SlackThreadData {
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

// Vercel Types
// ============================================================================

/** API response shape for Vercel deployments */
export interface VercelDeploymentData {
  id: string;
  name: string;
  url: string | null;
  state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
  createdAt: number;
  buildingAt?: number;
  readyAt?: number;
  target: "production" | "preview";
  inspectorUrl?: string;
  commit: {
    sha: string;
    message: string;
    ref: string;
    author: string;
  } | null;
  creator: string;
}

/** API response shape for Vercel project info */
export interface VercelProjectData {
  id: string;
  name: string;
  framework: string;
  nodeVersion?: string;
  buildCommand?: string;
  outputDirectory?: string;
  rootDirectory?: string;
  link: {
    type: string;
    repo: string;
    repoId?: string;
    org: string;
  } | null;
  latestProduction: {
    id: string;
    url: string | null;
    state: string;
    createdAt: number;
  } | null;
  updatedAt: number;
  createdAt: number;
}

/** API response shape for Vercel deployment events */
export interface VercelDeploymentEventsData {
  id: string;
  name: string;
  url: string | null;
  state: string;
  target: "production" | "preview";
  createdAt: number;
  buildingAt?: number;
  readyAt?: number;
  errorCode?: string;
  errorMessage?: string;
  events: Array<{
    id: string;
    type: string;
    text: string;
    timestamp: number;
  }>;
}

// Briefing Types
// ============================================================================

export interface BriefingRecommendationsData {
  summary: string;
  sinceLabel: string;
  sections: Array<{
    title: string;
    items: Array<{
      icon: "pr" | "issue" | "deploy" | "slack" | "alert";
      text: string;
      priority: "high" | "medium" | "low";
      actionUrl?: string;
    }>;
  }>;
  generatedAt: number;
}

export type MorningBriefRendererData = import("@/types").MorningBriefComponentData;
