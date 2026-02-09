// component-registry.ts
//
// Centralized configuration mapping component types to their renderers and defaults.
//
// TWO REGISTRIES:
// 1. CONTENT_RENDERERS: typeId → lazy-loaded React component
//    Used by ComponentContent to render the right UI for each component type.
//    Lazy loading keeps the initial bundle small - renderer code loads on demand.
//
// 2. COMPONENT_TYPES: Configuration for the "Add Component" dropdown
//    Includes default sizes, query types, and categories for grouping.
//
// ADDING A NEW COMPONENT TYPE:
// 1. Create the renderer in src/components/canvas/renderers/
// 2. Add entry to CONTENT_RENDERERS with lazy(() => import(...))
// 3. Add entry to COMPONENT_TYPES with defaults
// 4. Update CATEGORIES if introducing a new category
// 5. Add tool documentation in ai-tools.ts for AI awareness
//
// WHY LAZY LOADING:
// Each renderer may import heavy dependencies (charts, data grids). Lazy loading
// ensures we only pay the bundle cost when that component type is actually used.

import { lazy, type LazyExoticComponent, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  User,
  GitPullRequest,
  BarChart3,
  MessageSquare,
  Layers,
  Sparkles,
  Triangle,
} from "lucide-react";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Content renderer type - uses any to allow flexible prop signatures
 * Type safety is enforced at the call site via explicit type assertions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContentRenderer = LazyExoticComponent<ComponentType<any>>;

/**
 * Configuration for a component type shown in the dropdown
 */
export interface ComponentTypeConfig {
  typeId: string;
  label: string;
  category: "personal" | "github" | "posthog" | "slack" | "vercel" | "briefing";
  config: Record<string, unknown>;
  size: { cols: number; rows: number };
  queryType: string;
  source?: string;
}

/**
 * Category metadata for grouping in dropdown
 */
export interface CategoryConfig {
  id: "personal" | "github" | "posthog" | "slack" | "vercel" | "briefing";
  label: string;
  icon: LucideIcon;
}

// ============================================================================
// Content Renderers Registry
// ============================================================================

/**
 * Maps typeId to lazy-loaded renderer component
 * Each renderer handles its own data typing internally
 */
export const CONTENT_RENDERERS: Record<string, ContentRenderer> = {
  // GitHub components
  "github.stat-tile": lazy(
    () => import("@/components/canvas/renderers/StatTileContent")
  ),
  "github.pr-list": lazy(
    () => import("@/components/canvas/renderers/PRListContent")
  ),
  "github.issue-grid": lazy(
    () => import("@/components/canvas/renderers/IssueGridContent")
  ),
  "github.activity-timeline": lazy(
    () => import("@/components/canvas/renderers/ActivityTimelineContent")
  ),
  "github.my-activity": lazy(
    () => import("@/components/canvas/renderers/MyActivityContent")
  ),
  "github.commits": lazy(
    () => import("@/components/canvas/renderers/CommitsContent")
  ),
  "github.team-activity": lazy(
    () => import("@/components/canvas/renderers/TeamActivityContent")
  ),

  // PostHog analytics components
  "posthog.site-health": lazy(
    () => import("@/components/canvas/renderers/SiteHealthContent")
  ),
  "posthog.property-breakdown": lazy(
    () => import("@/components/canvas/renderers/PropertyBreakdownContent")
  ),
  "posthog.top-pages": lazy(
    () => import("@/components/canvas/renderers/TopPagesContent")
  ),

  // Slack components
  "slack.channel-activity": lazy(
    () => import("@/components/canvas/renderers/ChannelActivityContent")
  ),
  "slack.mentions": lazy(
    () => import("@/components/canvas/renderers/MentionsContent")
  ),
  "slack.thread-watch": lazy(
    () => import("@/components/canvas/renderers/ThreadWatchContent")
  ),

  // Vercel components
  "vercel.deployments": lazy(
    () => import("@/components/canvas/renderers/DeploymentsContent")
  ),
  "vercel.project-status": lazy(
    () => import("@/components/canvas/renderers/ProjectStatusContent")
  ),

  // Briefing components
  "briefing.recommendations": lazy(
    () => import("@/components/canvas/renderers/BriefingRecommendationsContent")
  ),
};

// ============================================================================
// Component Types Configuration
// ============================================================================

/**
 * Category definitions for dropdown grouping
 */
export const CATEGORIES: CategoryConfig[] = [
  { id: "personal", label: "My Stuff", icon: User },
  { id: "github", label: "GitHub (All)", icon: GitPullRequest },
  { id: "posthog", label: "PostHog", icon: BarChart3 },
  { id: "slack", label: "Slack", icon: MessageSquare },
  { id: "vercel", label: "Vercel", icon: Triangle },
  { id: "briefing", label: "Briefing", icon: Sparkles },
];

/**
 * Component types with defaults for the "Add Component" dropdown
 * rowHeight=80, so: 2 rows=160px, 3 rows=240px, 4 rows=320px, 5 rows=400px
 */
export const COMPONENT_TYPES: ComponentTypeConfig[] = [
  // === My Stuff (Personal Filters) ===
  {
    typeId: "github.pr-list",
    label: "My PRs",
    category: "personal",
    config: {
      repo: "assistant-ui/assistant-ui",
      state: "open",
      limit: 5,
      filter: "authored",
    },
    size: { cols: 4, rows: 4 },
    queryType: "pull_requests",
  },
  {
    typeId: "github.pr-list",
    label: "PRs to Review",
    category: "personal",
    config: {
      repo: "assistant-ui/assistant-ui",
      state: "open",
      limit: 5,
      filter: "review_requested",
    },
    size: { cols: 4, rows: 4 },
    queryType: "pull_requests",
  },
  {
    typeId: "github.issue-grid",
    label: "My Issues",
    category: "personal",
    config: {
      repo: "assistant-ui/assistant-ui",
      state: "open",
      limit: 6,
      filter: "assigned",
    },
    size: { cols: 4, rows: 4 },
    queryType: "issues",
  },
  {
    typeId: "github.my-activity",
    label: "My Activity",
    category: "personal",
    config: { timeWindow: "7d", feedLimit: 8 },
    size: { cols: 4, rows: 5 },
    queryType: "my_activity",
  },

  // === GitHub (All) ===
  {
    typeId: "github.stat-tile",
    label: "Stat Tile",
    category: "github",
    config: { repo: "assistant-ui/assistant-ui", metric: "open_prs" },
    size: { cols: 2, rows: 2 },
    queryType: "stats",
  },
  {
    typeId: "github.pr-list",
    label: "All PRs",
    category: "github",
    config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 5 },
    size: { cols: 4, rows: 4 },
    queryType: "pull_requests",
  },
  {
    typeId: "github.issue-grid",
    label: "All Issues",
    category: "github",
    config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 6 },
    size: { cols: 4, rows: 4 },
    queryType: "issues",
  },
  {
    typeId: "github.activity-timeline",
    label: "Activity Timeline",
    category: "github",
    config: { repo: "assistant-ui/assistant-ui", limit: 8 },
    size: { cols: 3, rows: 4 },
    queryType: "activity",
  },
  {
    typeId: "github.commits",
    label: "Commits",
    category: "github",
    config: { repo: "assistant-ui/assistant-ui", timeWindow: "7d", limit: 20 },
    size: { cols: 4, rows: 4 },
    queryType: "commits",
  },
  {
    typeId: "github.team-activity",
    label: "Team Activity",
    category: "github",
    config: { repo: "assistant-ui/assistant-ui", timeWindow: "7d" },
    size: { cols: 4, rows: 5 },
    queryType: "team_activity",
  },

  // === PostHog Analytics ===
  {
    typeId: "posthog.site-health",
    label: "Site Health",
    category: "posthog",
    config: { timeWindow: "7d" },
    size: { cols: 3, rows: 3 },
    queryType: "site_health",
    source: "posthog",
  },
  {
    typeId: "posthog.property-breakdown",
    label: "Property Breakdown",
    category: "posthog",
    config: { timeWindow: "7d", metric: "visitors" },
    size: { cols: 3, rows: 4 },
    queryType: "property_breakdown",
    source: "posthog",
  },
  {
    typeId: "posthog.top-pages",
    label: "Top Pages",
    category: "posthog",
    config: { timeWindow: "7d", limit: 8 },
    size: { cols: 4, rows: 4 },
    queryType: "top_pages",
    source: "posthog",
  },

  // === Slack ===
  {
    typeId: "slack.channel-activity",
    label: "Channel Activity",
    category: "slack",
    config: { channelName: "general", limit: 10 },
    size: { cols: 4, rows: 4 },
    queryType: "channel_activity",
    source: "slack",
  },
  {
    typeId: "slack.mentions",
    label: "My Mentions",
    category: "slack",
    config: { limit: 8 },
    size: { cols: 4, rows: 4 },
    queryType: "mentions",
    source: "slack",
  },
  {
    typeId: "slack.thread-watch",
    label: "Thread Watch",
    category: "slack",
    config: {},
    size: { cols: 3, rows: 4 },
    queryType: "thread_watch",
    source: "slack",
  },

  // === Vercel ===
  {
    typeId: "vercel.deployments",
    label: "Deployments",
    category: "vercel",
    config: { limit: 10 },
    size: { cols: 4, rows: 3 },
    queryType: "deployments",
    source: "vercel",
  },
  {
    typeId: "vercel.project-status",
    label: "Project Status",
    category: "vercel",
    config: {},
    size: { cols: 2, rows: 2 },
    queryType: "project_info",
    source: "vercel",
  },
  {
    typeId: "briefing.recommendations",
    label: "AI Recommendations",
    category: "briefing",
    config: {},
    size: { cols: 6, rows: 4 },
    queryType: "recommendations",
    source: "briefing",
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get component types filtered by category
 */
export function getComponentTypesByCategory(
  category: ComponentTypeConfig["category"]
): ComponentTypeConfig[] {
  return COMPONENT_TYPES.filter((t) => t.category === category);
}

/**
 * Get a renderer component by typeId
 * Returns undefined if not found
 */
export function getRenderer(typeId: string): ContentRenderer | undefined {
  return CONTENT_RENDERERS[typeId];
}

/**
 * Check if a renderer exists for a typeId
 */
export function hasRenderer(typeId: string): boolean {
  return typeId in CONTENT_RENDERERS;
}

/**
 * Get the default icon for component types in dropdown
 */
export function getDefaultIcon(): LucideIcon {
  return Layers;
}
