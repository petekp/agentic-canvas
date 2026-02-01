// Proactive Greeting - Generates context-aware greetings based on canvas state
// See: .claude/plans/canvas-awareness.md

import type { ComponentInstance } from "@/types";
import type { RecentChange } from "@/lib/canvas-context";

// ============================================================================
// Types
// ============================================================================

export interface GreetingContent {
  greeting: string;
  insights: string[];
  suggestedActions?: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Gets time-based greeting prefix
 */
function getTimeGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 6) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good evening";
}

/**
 * Extracts insights from component data
 */
function extractComponentInsights(components: ComponentInstance[]): string[] {
  const insights: string[] = [];

  for (const component of components) {
    if (component.dataState.status !== "ready" || !component.dataState.data) {
      continue;
    }

    const data = component.dataState.data as Record<string, unknown>;

    // PR List insights
    if (component.typeId === "github.pr-list" && Array.isArray(data.items)) {
      const openPRs = data.items.filter(
        (pr: { state?: string }) => pr.state === "open"
      ).length;

      if (openPRs >= 5) {
        insights.push(`You have ${openPRs} open PRs - that's quite a few!`);
      } else if (openPRs === 0) {
        insights.push("No open PRs right now - your queue is clear.");
      }

      // Check for PRs awaiting review
      const config = component.config as { filter?: string } | undefined;
      if (config?.filter === "review_requested" && openPRs > 0) {
        insights.push(`${openPRs} PR${openPRs > 1 ? "s" : ""} waiting for your review.`);
      }
    }

    // Issue Grid insights
    if (component.typeId === "github.issue-grid" && Array.isArray(data.items)) {
      const openIssues = data.items.filter(
        (issue: { state?: string }) => issue.state === "open"
      ).length;

      if (openIssues >= 10) {
        insights.push(`${openIssues} open issues to track.`);
      }
    }

    // Site Health insights (PostHog)
    if (component.typeId === "posthog.site-health") {
      const visitors = data.uniqueVisitors as number | undefined;
      const pageviews = data.pageviews as number | undefined;

      if (visitors && visitors > 1000) {
        insights.push(`Strong traffic: ${visitors.toLocaleString()} visitors this week.`);
      }

      if (pageviews && visitors) {
        const pagesPerVisitor = pageviews / visitors;
        if (pagesPerVisitor > 3) {
          insights.push("Good engagement - visitors are exploring multiple pages.");
        }
      }
    }

    // Stat Tile insights
    if (component.typeId === "github.stat-tile") {
      const value = data.value as number | undefined;
      const title = data.title as string | undefined;
      const trend = data.trend as string | undefined;

      if (value !== undefined && title) {
        if (trend === "up") {
          insights.push(`${title} is trending up (${value}).`);
        } else if (trend === "down" && value > 0) {
          insights.push(`${title} has decreased to ${value}.`);
        }
      }
    }

    // My Activity insights
    if (component.typeId === "github.my-activity" && data.stats) {
      const stats = data.stats as {
        commits?: number;
        prsOpened?: number;
        reviews?: number;
      };

      if (stats.commits && stats.commits > 10) {
        insights.push(`You've been productive - ${stats.commits} commits recently!`);
      }

      if (stats.reviews && stats.reviews > 5) {
        insights.push(`Active reviewer: ${stats.reviews} code reviews.`);
      }
    }
  }

  return insights;
}

/**
 * Extracts insights from recent changes
 */
function extractRecentActivityInsights(changes: RecentChange[]): string[] {
  const insights: string[] = [];

  if (changes.length === 0) return insights;

  // Count by source
  const bySources = changes.reduce(
    (acc, c) => {
      acc[c.source] = (acc[c.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (bySources.assistant && bySources.assistant >= 3) {
    insights.push(`I made ${bySources.assistant} changes since we last spoke.`);
  }

  if (bySources.user && bySources.user >= 2) {
    insights.push(`You've been busy - ${bySources.user} recent changes.`);
  }

  return insights;
}

/**
 * Generates suggested actions based on canvas state
 */
function generateSuggestedActions(
  components: ComponentInstance[],
  _changes: RecentChange[]
): string[] {
  const suggestions: string[] = [];

  if (components.length === 0) {
    suggestions.push("Add your first component: try 'Show my open PRs'");
    return suggestions;
  }

  // Check for missing component types
  const typeIds = new Set(components.map((c) => c.typeId));

  if (!typeIds.has("github.stat-tile")) {
    suggestions.push("Add a stat tile to track a key metric");
  }

  if (!typeIds.has("github.pr-list") && !typeIds.has("github.issue-grid")) {
    suggestions.push("Add a PR or Issue list for better visibility");
  }

  // Check for data loading issues
  const errorComponents = components.filter((c) => c.dataState.status === "error");
  if (errorComponents.length > 0) {
    suggestions.push("Some components have data errors - check your API keys");
  }

  return suggestions.slice(0, 2); // Limit to 2 suggestions
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Generates a context-aware greeting based on canvas state and recent changes
 */
export function generateGreeting(
  components: ComponentInstance[],
  recentChanges: RecentChange[]
): GreetingContent {
  const timeGreeting = getTimeGreeting();

  // Base greeting based on component count
  let greeting: string;
  if (components.length === 0) {
    greeting = `${timeGreeting}! Your canvas is empty. What would you like to track?`;
  } else if (components.length === 1) {
    greeting = `${timeGreeting}! You have 1 component on your canvas.`;
  } else {
    greeting = `${timeGreeting}! You have ${components.length} components on your canvas.`;
  }

  // Gather insights
  const componentInsights = extractComponentInsights(components);
  const activityInsights = extractRecentActivityInsights(recentChanges);
  const insights = [...componentInsights, ...activityInsights].slice(0, 3);

  // Generate suggestions
  const suggestedActions = generateSuggestedActions(components, recentChanges);

  return {
    greeting,
    insights,
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
  };
}

/**
 * Formats the greeting content into a single message string
 */
export function formatGreetingMessage(content: GreetingContent): string {
  const parts: string[] = [content.greeting];

  if (content.insights.length > 0) {
    parts.push("");
    parts.push(...content.insights.map((i) => `- ${i}`));
  }

  if (content.suggestedActions && content.suggestedActions.length > 0) {
    parts.push("");
    parts.push("**Suggestions:**");
    parts.push(...content.suggestedActions.map((s) => `- ${s}`));
  }

  return parts.join("\n");
}
