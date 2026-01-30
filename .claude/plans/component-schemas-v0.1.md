# Agentic Canvas: v0.1 Component Schemas

<!--
  component-schemas-v0.1.md

  Defines what each component looks like, what data it needs, and what
  actions users/AI can take on it. This is your guide when building
  the React components and mock data.

  Depends on: primitives-spec-v0.1.md (imports ComponentDefinition, DataBinding, etc.)
  Used by: store-architecture-v0.1.md (registry initialization)

  Implementation notes:
  - Config schemas are JSON Schema; use ajv or similar for validation
  - Data schemas show what the mock source returns; match these exactly
  - Actions are what the assistant can offer; wire to CanvasEvent handlers
-->

**Version:** 0.1.0
**Status:** Implementation Ready
**Last Updated:** January 2026

---

## Overview

This document defines the complete schemas for the four components in the v0.1 prototype:

1. **github.pr-list** — Pull request list with status, author, reviewers
2. **github.issue-grid** — Issue grid with labels, assignees, state
3. **github.stat-tile** — Single metric display (count, percentage)
4. **github.activity-timeline** — Chronological feed of repo activity

Each component section includes:
- Configuration schema (what the user/AI can configure)
- Data schema (what the mock GitHub source returns)
- Component definition (registry contract)
- Actions (user/AI interactions)
- Rendering notes (layout and visual guidance)

### How to Use This Document

**Building a component:** Find its section, implement the config interface, wire up the data binding, render according to the layout notes.

**Creating mock data:** Match the data schema exactly. The types use discriminated unions (e.g., `ActivityPayload`)—include the `type` field.

**Adding actions:** Each component lists what the assistant can do. Wire these to `CanvasEvent.component.action` handlers.

**Registering components:** Section 5 shows how to initialize the registry with all definitions.

---

## 1. github.pr-list

A list of pull requests with filtering and interaction capabilities.

### 1.1 Configuration Schema

```typescript
interface PRListConfig {
  repo: string;                           // Required: "owner/repo"
  state: "open" | "closed" | "all";       // Default: "open"
  limit: number;                          // Default: 10, range: 1-50
  sortBy: "created" | "updated" | "comments"; // Default: "updated"
  sortDirection: "asc" | "desc";          // Default: "desc"
  showDraft: boolean;                     // Default: true
  authorFilter?: string;                  // Optional: filter by author username
}

const prListConfigSchema: JSONSchema7 = {
  type: "object",
  properties: {
    repo: {
      type: "string",
      pattern: "^[\\w.-]+/[\\w.-]+$",
      description: "Repository in owner/repo format",
    },
    state: {
      type: "string",
      enum: ["open", "closed", "all"],
      default: "open",
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 50,
      default: 10,
    },
    sortBy: {
      type: "string",
      enum: ["created", "updated", "comments"],
      default: "updated",
    },
    sortDirection: {
      type: "string",
      enum: ["asc", "desc"],
      default: "desc",
    },
    showDraft: {
      type: "boolean",
      default: true,
    },
    authorFilter: {
      type: "string",
      description: "Filter by author username",
    },
  },
  required: ["repo"],
};
```

### 1.2 Data Schema

```typescript
interface PRListData {
  pullRequests: PullRequest[];
  pagination: {
    total: number;
    hasMore: boolean;
  };
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  url: string;

  author: GitHubUser;

  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
  mergedAt: string | null;    // ISO 8601 or null

  labels: Label[];
  assignees: GitHubUser[];
  reviewers: Reviewer[];

  stats: {
    commits: number;
    additions: number;
    deletions: number;
    changedFiles: number;
    comments: number;
  };

  checks: CheckStatus;

  // Computed for display
  age: string;                // "2 days ago", "3 hours ago"
  isStale: boolean;           // No activity in 7+ days
}

interface GitHubUser {
  login: string;
  avatarUrl: string;
  url: string;
}

interface Label {
  name: string;
  color: string;              // Hex without #
  description?: string;
}

interface Reviewer {
  user: GitHubUser;
  state: "pending" | "approved" | "changes_requested" | "commented";
}

interface CheckStatus {
  status: "pending" | "success" | "failure" | "neutral";
  total: number;
  passed: number;
  failed: number;
}
```

### 1.3 Component Definition

```typescript
const prListDefinition: ComponentDefinition<PRListConfig> = {
  typeId: "github.pr-list",
  name: "Pull Request List",
  description: "Displays GitHub pull requests with status indicators, authors, reviewers, and CI status. Supports filtering by state and author. Click a PR to see details or trigger actions.",
  category: "data",

  configSchema: prListConfigSchema,
  defaultConfig: {
    state: "open",
    limit: 10,
    sortBy: "updated",
    sortDirection: "desc",
    showDraft: true,
  },

  defaultSize: { cols: 4, rows: 3 },
  minSize: { cols: 2, rows: 2 },
  maxSize: { cols: 8, rows: 6 },

  dataBindingSchema: {
    type: "object",
    properties: {
      source: { const: "mock-github" },
      query: {
        type: "object",
        properties: {
          type: { const: "pull_requests" },
        },
      },
    },
  },

  capabilities: ["interactive", "refreshable", "filterable", "sortable"],

  actions: [
    {
      actionId: "view_details",
      label: "View Details",
      description: "Show full PR details including description and timeline",
      requiresSelection: true,
    },
    {
      actionId: "summarize",
      label: "Summarize",
      description: "Generate an AI summary of the PR changes and discussion",
      requiresSelection: true,
    },
    {
      actionId: "draft_review",
      label: "Draft Review",
      description: "AI drafts a code review based on the changes",
      requiresSelection: true,
    },
    {
      actionId: "open_in_github",
      label: "Open in GitHub",
      description: "Open the PR in a new browser tab",
      requiresSelection: true,
    },
  ],

  render: PRListComponent,
};
```

### 1.4 Mock Data Query

```typescript
// Query to mock-github data source
const prListQuery: DataQuery = {
  type: "pull_requests",
  params: {
    repo: "assistant-ui/assistant-ui",
    state: "open",
    limit: 10,
    sortBy: "updated",
    sortDirection: "desc",
  },
};
```

### 1.5 Rendering Notes

**Layout (4x3 default):**
```
┌─────────────────────────────────────────────────┐
│ Pull Requests (10)              ↻ 2m ago  ⋮    │
├─────────────────────────────────────────────────┤
│ ● #142 Fix MCP runtime crash          @alice   │
│   ✓ 3/3 checks · 2 reviewers · 3 days ago      │
├─────────────────────────────────────────────────┤
│ ○ #139 Add streaming support          @bob     │
│   ⚠ 1/2 checks · awaiting review · 5 days ago  │
├─────────────────────────────────────────────────┤
│ ◐ #137 [Draft] Refactor types         @carol   │
│   ⏳ running · 1 day ago                        │
└─────────────────────────────────────────────────┘
```

**Visual indicators:**
- ● = open, ○ = merged, ✕ = closed
- ◐ = draft
- ✓ = checks passed, ⚠ = checks failed, ⏳ = checks running
- Stale PRs (7+ days) shown with muted styling

---

## 2. github.issue-grid

A grid/card view of issues with labels and quick actions.

### 2.1 Configuration Schema

```typescript
interface IssueGridConfig {
  repo: string;                           // Required: "owner/repo"
  state: "open" | "closed" | "all";       // Default: "open"
  labels?: string[];                      // Optional: filter by labels
  milestone?: string;                     // Optional: filter by milestone
  assignee?: string;                      // Optional: filter by assignee
  limit: number;                          // Default: 20, range: 1-100
  layout: "grid" | "list";                // Default: "grid"
  groupBy?: "label" | "assignee" | "milestone"; // Optional grouping
}

const issueGridConfigSchema: JSONSchema7 = {
  type: "object",
  properties: {
    repo: {
      type: "string",
      pattern: "^[\\w.-]+/[\\w.-]+$",
      description: "Repository in owner/repo format",
    },
    state: {
      type: "string",
      enum: ["open", "closed", "all"],
      default: "open",
    },
    labels: {
      type: "array",
      items: { type: "string" },
      description: "Filter by label names",
    },
    milestone: {
      type: "string",
      description: "Filter by milestone title",
    },
    assignee: {
      type: "string",
      description: "Filter by assignee username",
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 100,
      default: 20,
    },
    layout: {
      type: "string",
      enum: ["grid", "list"],
      default: "grid",
    },
    groupBy: {
      type: "string",
      enum: ["label", "assignee", "milestone"],
    },
  },
  required: ["repo"],
};
```

### 2.2 Data Schema

```typescript
interface IssueGridData {
  issues: Issue[];
  groups?: IssueGroup[];      // Present if groupBy is set
  pagination: {
    total: number;
    hasMore: boolean;
  };
}

interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;               // Truncated to 200 chars
  state: "open" | "closed";
  url: string;

  author: GitHubUser;
  assignees: GitHubUser[];

  labels: Label[];
  milestone: Milestone | null;

  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
  closedAt: string | null;    // ISO 8601 or null

  stats: {
    comments: number;
    reactions: number;
  };

  // Computed
  age: string;
  priority: "high" | "medium" | "low" | "none";  // Inferred from labels
}

interface Milestone {
  title: string;
  dueOn: string | null;       // ISO 8601 or null
  progress: number;           // 0-100
}

interface IssueGroup {
  key: string;                // Label name, assignee login, or milestone title
  label: string;              // Display label
  color?: string;             // For label grouping
  issues: Issue[];
  count: number;
}
```

### 2.3 Component Definition

```typescript
const issueGridDefinition: ComponentDefinition<IssueGridConfig> = {
  typeId: "github.issue-grid",
  name: "Issue Grid",
  description: "Displays GitHub issues in a grid or list layout. Supports filtering by labels, milestone, and assignee. Can group issues by category. Click an issue to see details.",
  category: "data",

  configSchema: issueGridConfigSchema,
  defaultConfig: {
    state: "open",
    limit: 20,
    layout: "grid",
  },

  defaultSize: { cols: 6, rows: 4 },
  minSize: { cols: 3, rows: 2 },
  maxSize: { cols: 12, rows: 8 },

  dataBindingSchema: {
    type: "object",
    properties: {
      source: { const: "mock-github" },
      query: {
        type: "object",
        properties: {
          type: { const: "issues" },
        },
      },
    },
  },

  capabilities: ["interactive", "refreshable", "filterable", "sortable"],

  actions: [
    {
      actionId: "view_details",
      label: "View Details",
      description: "Show full issue details including comments",
      requiresSelection: true,
    },
    {
      actionId: "summarize_thread",
      label: "Summarize Thread",
      description: "AI summarizes the issue discussion",
      requiresSelection: true,
    },
    {
      actionId: "draft_response",
      label: "Draft Response",
      description: "AI drafts a response to the issue",
      requiresSelection: true,
    },
    {
      actionId: "find_related",
      label: "Find Related",
      description: "Find related issues and PRs",
      requiresSelection: true,
    },
    {
      actionId: "open_in_github",
      label: "Open in GitHub",
      description: "Open the issue in a new browser tab",
      requiresSelection: true,
    },
  ],

  render: IssueGridComponent,
};
```

### 2.4 Rendering Notes

**Grid Layout (6x4 default):**
```
┌──────────────────────────────────────────────────────────────┐
│ Issues (47 open)                              ↻ 5m ago  ⋮   │
├────────────────────┬────────────────────┬────────────────────┤
│ #108               │ #105               │ #102               │
│ MCP runtime crash  │ Docs: Quick Start  │ Voice input lag    │
│ 🔴 bug  🟡 v0.9    │ 📖 docs            │ 🟢 enhancement     │
│ @alice · 3 days    │ unassigned · 1w    │ @bob · 2 weeks     │
├────────────────────┼────────────────────┼────────────────────┤
│ #99                │ #97                │ #95                │
│ Add retry logic    │ Improve error msg  │ Type inference     │
│ 🟢 enhancement     │ 🔴 bug             │ 🔵 typescript      │
│ @carol · 3 weeks   │ @alice · 1 month   │ @dave · 1 month    │
└────────────────────┴────────────────────┴────────────────────┘
```

**Visual indicators:**
- Label colors as pills/badges
- Priority issues highlighted (border or background)
- Unassigned issues with dashed border

---

## 3. github.stat-tile

A single metric display with optional trend indicator.

### 3.1 Configuration Schema

```typescript
interface StatTileConfig {
  repo: string;                           // Required: "owner/repo"
  metric: StatMetric;                     // Required: which metric to show
  compareWindow?: "day" | "week" | "month"; // Optional: show trend vs period
  thresholds?: {                          // Optional: color thresholds
    warning?: number;
    critical?: number;
  };
}

type StatMetric =
  | "open_prs"
  | "open_issues"
  | "stale_prs"        // PRs with no activity in 7+ days
  | "stale_issues"     // Issues with no activity in 30+ days
  | "pending_reviews"  // PRs awaiting your review
  | "stars"
  | "forks"
  | "contributors"
  | "commits_week"     // Commits in last 7 days
  | "releases_month";  // Releases in last 30 days

const statTileConfigSchema: JSONSchema7 = {
  type: "object",
  properties: {
    repo: {
      type: "string",
      pattern: "^[\\w.-]+/[\\w.-]+$",
      description: "Repository in owner/repo format",
    },
    metric: {
      type: "string",
      enum: [
        "open_prs",
        "open_issues",
        "stale_prs",
        "stale_issues",
        "pending_reviews",
        "stars",
        "forks",
        "contributors",
        "commits_week",
        "releases_month",
      ],
      description: "Which metric to display",
    },
    compareWindow: {
      type: "string",
      enum: ["day", "week", "month"],
      description: "Show trend compared to this period",
    },
    thresholds: {
      type: "object",
      properties: {
        warning: { type: "number" },
        critical: { type: "number" },
      },
      description: "Thresholds for warning/critical colors",
    },
  },
  required: ["repo", "metric"],
};
```

### 3.2 Data Schema

```typescript
interface StatTileData {
  metric: StatMetric;
  value: number;
  label: string;              // Human-readable: "Open PRs"

  trend?: {
    direction: "up" | "down" | "flat";
    delta: number;            // Absolute change
    percentage: number;       // Percentage change
    window: string;           // "vs last week"
  };

  status: "normal" | "warning" | "critical";

  breakdown?: StatBreakdown[];  // Optional drill-down data

  lastUpdated: string;        // ISO 8601
}

interface StatBreakdown {
  label: string;
  value: number;
  percentage: number;         // Of total
}
```

### 3.3 Component Definition

```typescript
const statTileDefinition: ComponentDefinition<StatTileConfig> = {
  typeId: "github.stat-tile",
  name: "Stat Tile",
  description: "Displays a single repository metric with optional trend indicator. Good for dashboards and quick status checks. Supports thresholds for warning/critical states.",
  category: "metric",

  configSchema: statTileConfigSchema,
  defaultConfig: {},

  defaultSize: { cols: 2, rows: 2 },
  minSize: { cols: 1, rows: 1 },
  maxSize: { cols: 4, rows: 3 },

  dataBindingSchema: {
    type: "object",
    properties: {
      source: { const: "mock-github" },
      query: {
        type: "object",
        properties: {
          type: { const: "stats" },
        },
      },
    },
  },

  capabilities: ["refreshable", "expandable"],

  actions: [
    {
      actionId: "view_breakdown",
      label: "View Breakdown",
      description: "Show detailed breakdown of this metric",
    },
    {
      actionId: "explain_trend",
      label: "Explain Trend",
      description: "AI explains what's driving this metric's trend",
    },
  ],

  render: StatTileComponent,
};
```

### 3.4 Rendering Notes

**Default Layout (2x2):**
```
┌─────────────────────┐
│ Open PRs            │
│                     │
│      12             │
│                     │
│  ↑ 3 vs last week   │
└─────────────────────┘
```

**Compact Layout (1x1):**
```
┌──────────┐
│ PRs: 12  │
│    ↑ 3   │
└──────────┘
```

**Visual states:**
- Normal: default styling
- Warning: amber/yellow accent
- Critical: red accent with attention indicator

---

## 4. github.activity-timeline

A chronological feed of repository activity.

### 4.1 Configuration Schema

```typescript
interface ActivityTimelineConfig {
  repo: string;                           // Required: "owner/repo"
  types: ActivityType[];                  // Default: ["push", "pr", "issue"]
  limit: number;                          // Default: 20, range: 1-100
  authorFilter?: string;                  // Optional: filter by author
  since?: string;                         // Optional: ISO date, show activity after
  groupByDate: boolean;                   // Default: true, group by day
}

type ActivityType =
  | "push"              // Commits pushed
  | "pr"                // PR opened, closed, merged
  | "pr_review"         // Review submitted
  | "issue"             // Issue opened, closed
  | "issue_comment"     // Comment on issue
  | "release"           // Release published
  | "fork"              // Repository forked
  | "star";             // Repository starred

const activityTimelineConfigSchema: JSONSchema7 = {
  type: "object",
  properties: {
    repo: {
      type: "string",
      pattern: "^[\\w.-]+/[\\w.-]+$",
      description: "Repository in owner/repo format",
    },
    types: {
      type: "array",
      items: {
        type: "string",
        enum: ["push", "pr", "pr_review", "issue", "issue_comment", "release", "fork", "star"],
      },
      default: ["push", "pr", "issue"],
      description: "Activity types to show",
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 100,
      default: 20,
    },
    authorFilter: {
      type: "string",
      description: "Filter by author username",
    },
    since: {
      type: "string",
      format: "date-time",
      description: "Show activity after this date",
    },
    groupByDate: {
      type: "boolean",
      default: true,
    },
  },
  required: ["repo"],
};
```

### 4.2 Data Schema

```typescript
interface ActivityTimelineData {
  activities: Activity[];
  groups?: ActivityGroup[];   // Present if groupByDate is true
  pagination: {
    total: number;
    hasMore: boolean;
    oldestDate: string;
  };
}

interface Activity {
  id: string;
  type: ActivityType;
  timestamp: string;          // ISO 8601
  actor: GitHubUser;

  // Type-specific payload
  payload: ActivityPayload;

  // Computed
  relativeTime: string;       // "2 hours ago"
  icon: string;               // Icon identifier
}

type ActivityPayload =
  | PushPayload
  | PRPayload
  | PRReviewPayload
  | IssuePayload
  | IssueCommentPayload
  | ReleasePayload
  | ForkPayload
  | StarPayload;

interface PushPayload {
  type: "push";
  ref: string;                // "refs/heads/main"
  branch: string;             // "main"
  commits: {
    sha: string;
    message: string;
    url: string;
  }[];
  commitCount: number;
}

interface PRPayload {
  type: "pr";
  action: "opened" | "closed" | "merged" | "reopened";
  number: number;
  title: string;
  url: string;
}

interface PRReviewPayload {
  type: "pr_review";
  action: "submitted";
  state: "approved" | "changes_requested" | "commented";
  prNumber: number;
  prTitle: string;
  url: string;
}

interface IssuePayload {
  type: "issue";
  action: "opened" | "closed" | "reopened";
  number: number;
  title: string;
  url: string;
}

interface IssueCommentPayload {
  type: "issue_comment";
  issueNumber: number;
  issueTitle: string;
  body: string;               // Truncated to 100 chars
  url: string;
}

interface ReleasePayload {
  type: "release";
  action: "published";
  tagName: string;
  name: string;
  url: string;
  prerelease: boolean;
}

interface ForkPayload {
  type: "fork";
  forkFullName: string;
  url: string;
}

interface StarPayload {
  type: "star";
  action: "created";
  totalStars: number;
}

interface ActivityGroup {
  date: string;               // "2026-01-30"
  label: string;              // "Today", "Yesterday", "January 28"
  activities: Activity[];
  count: number;
}
```

### 4.3 Component Definition

```typescript
const activityTimelineDefinition: ComponentDefinition<ActivityTimelineConfig> = {
  typeId: "github.activity-timeline",
  name: "Activity Timeline",
  description: "Shows a chronological feed of repository activity including commits, PRs, issues, and releases. Supports filtering by activity type and author. Good for staying up to date with project activity.",
  category: "timeline",

  configSchema: activityTimelineConfigSchema,
  defaultConfig: {
    types: ["push", "pr", "issue"],
    limit: 20,
    groupByDate: true,
  },

  defaultSize: { cols: 4, rows: 4 },
  minSize: { cols: 2, rows: 3 },
  maxSize: { cols: 6, rows: 8 },

  dataBindingSchema: {
    type: "object",
    properties: {
      source: { const: "mock-github" },
      query: {
        type: "object",
        properties: {
          type: { const: "activity" },
        },
      },
    },
  },

  capabilities: ["interactive", "refreshable", "filterable"],

  actions: [
    {
      actionId: "view_details",
      label: "View Details",
      description: "Show full details of this activity",
      requiresSelection: true,
    },
    {
      actionId: "summarize_day",
      label: "Summarize Day",
      description: "AI summarizes all activity for a day",
      params: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
        },
      },
    },
    {
      actionId: "summarize_week",
      label: "Summarize Week",
      description: "AI summarizes all activity for the past week",
    },
  ],

  render: ActivityTimelineComponent,
};
```

### 4.4 Rendering Notes

**Default Layout (4x4):**
```
┌────────────────────────────────────────────────┐
│ Activity                          ↻ 1m ago  ⋮ │
├────────────────────────────────────────────────┤
│ Today                                          │
│ ├─ 🔀 alice merged PR #142          2h ago    │
│ │     Fix MCP runtime crash                   │
│ ├─ 💬 bob commented on #108         3h ago    │
│ │     "I can reproduce this..."               │
│ └─ 📦 carol pushed 3 commits        5h ago    │
│       main: Add streaming support             │
├────────────────────────────────────────────────┤
│ Yesterday                                      │
│ ├─ 🎉 Release v0.8.2 published      10:30 AM  │
│ └─ 🐛 dave opened issue #109        9:15 AM   │
│       Type inference regression               │
└────────────────────────────────────────────────┘
```

**Icons by activity type:**
- 🔀 = PR merged
- 📋 = PR opened/closed
- ✅ = PR approved
- 🐛 = Issue opened
- ✔️ = Issue closed
- 💬 = Comment
- 📦 = Push
- 🎉 = Release
- ⭐ = Star
- 🍴 = Fork

---

## 5. Component Registry Implementation

### 5.1 Registry Initialization

```typescript
// registry.ts
import { ComponentRegistry, ComponentDefinition } from "./types";

class ComponentRegistryImpl implements ComponentRegistry {
  private definitions = new Map<string, ComponentDefinition>();

  register(definition: ComponentDefinition): void {
    if (this.definitions.has(definition.typeId)) {
      console.warn(`Component ${definition.typeId} already registered, replacing`);
    }
    this.definitions.set(definition.typeId, definition);
  }

  unregister(typeId: string): void {
    this.definitions.delete(typeId);
  }

  get(typeId: string): ComponentDefinition | undefined {
    return this.definitions.get(typeId);
  }

  getAll(): ComponentDefinition[] {
    return Array.from(this.definitions.values());
  }

  getByCategory(category: string): ComponentDefinition[] {
    return this.getAll().filter((d) => d.category === category);
  }

  validateConfig(typeId: string, config: unknown): ValidationResult {
    const definition = this.get(typeId);
    if (!definition) {
      return { valid: false, errors: [{ path: "", message: "Unknown component type", code: "UNKNOWN_TYPE" }] };
    }
    // Use ajv or similar for JSON Schema validation
    return validateJsonSchema(definition.configSchema, config);
  }

  validateDataBinding(typeId: string, binding: DataBinding): ValidationResult {
    const definition = this.get(typeId);
    if (!definition?.dataBindingSchema) {
      return { valid: true };
    }
    return validateJsonSchema(definition.dataBindingSchema, binding);
  }
}

// Initialize with v0.1 components
export function createRegistry(): ComponentRegistry {
  const registry = new ComponentRegistryImpl();

  registry.register(prListDefinition);
  registry.register(issueGridDefinition);
  registry.register(statTileDefinition);
  registry.register(activityTimelineDefinition);

  return registry;
}
```

### 5.2 Type Exports

```typescript
// types/components.ts
export type {
  PRListConfig,
  PRListData,
  PullRequest,

  IssueGridConfig,
  IssueGridData,
  Issue,

  StatTileConfig,
  StatTileData,
  StatMetric,

  ActivityTimelineConfig,
  ActivityTimelineData,
  Activity,
  ActivityType,
  ActivityPayload,
};
```

---

## 6. AI Context Generation

How component summaries are generated for assistant context.

### 6.1 Summary Templates

```typescript
function generatePRListSummary(data: PRListData, config: PRListConfig): ComponentSummary {
  const openCount = data.pullRequests.filter(pr => pr.state === "open").length;
  const needsReview = data.pullRequests.filter(pr =>
    pr.reviewers.every(r => r.state === "pending")
  ).length;

  return {
    summary: `Showing ${data.pullRequests.length} ${config.state} PRs for ${config.repo}. ${needsReview} awaiting review.`,
    highlights: [
      `${openCount} open PRs`,
      needsReview > 0 ? `${needsReview} need review` : null,
      data.pullRequests.some(pr => pr.isStale) ? "Some PRs are stale" : null,
    ].filter(Boolean) as string[],
    actions: ["view_details", "summarize", "draft_review", "open_in_github"],
  };
}

function generateIssueGridSummary(data: IssueGridData, config: IssueGridConfig): ComponentSummary {
  const highPriority = data.issues.filter(i => i.priority === "high").length;

  return {
    summary: `Showing ${data.issues.length} ${config.state} issues for ${config.repo}.${config.labels?.length ? ` Filtered by: ${config.labels.join(", ")}.` : ""}`,
    highlights: [
      `${data.pagination.total} total issues`,
      highPriority > 0 ? `${highPriority} high priority` : null,
      config.groupBy ? `Grouped by ${config.groupBy}` : null,
    ].filter(Boolean) as string[],
    actions: ["view_details", "summarize_thread", "draft_response", "find_related"],
  };
}

function generateStatTileSummary(data: StatTileData, config: StatTileConfig): ComponentSummary {
  const trendText = data.trend
    ? `${data.trend.direction === "up" ? "↑" : data.trend.direction === "down" ? "↓" : "→"} ${data.trend.delta} ${data.trend.window}`
    : "";

  return {
    summary: `${data.label}: ${data.value}${trendText ? ` (${trendText})` : ""} for ${config.repo}.`,
    highlights: [
      data.status !== "normal" ? `Status: ${data.status}` : null,
      data.trend ? `Trend: ${data.trend.percentage}% ${data.trend.direction}` : null,
    ].filter(Boolean) as string[],
    actions: ["view_breakdown", "explain_trend"],
  };
}

function generateActivityTimelineSummary(data: ActivityTimelineData, config: ActivityTimelineConfig): ComponentSummary {
  const todayCount = data.groups?.find(g => g.label === "Today")?.count ?? 0;

  return {
    summary: `Showing ${data.activities.length} recent activities for ${config.repo}. Types: ${config.types.join(", ")}.`,
    highlights: [
      todayCount > 0 ? `${todayCount} activities today` : null,
      `Showing ${config.types.length} activity types`,
    ].filter(Boolean) as string[],
    actions: ["view_details", "summarize_day", "summarize_week"],
  };
}
```

---

## 7. Mock Data Source Specification

### 7.1 Query Interface

```typescript
interface MockGitHubSource extends DataSource {
  id: "mock-github";
  name: "Mock GitHub";
  description: "Simulated GitHub data for prototype testing";

  queries: [
    {
      type: "pull_requests";
      paramsSchema: typeof prListConfigSchema;
      resultSchema: PRListData;
    },
    {
      type: "issues";
      paramsSchema: typeof issueGridConfigSchema;
      resultSchema: IssueGridData;
    },
    {
      type: "stats";
      paramsSchema: typeof statTileConfigSchema;
      resultSchema: StatTileData;
    },
    {
      type: "activity";
      paramsSchema: typeof activityTimelineConfigSchema;
      resultSchema: ActivityTimelineData;
    },
  ];
}
```

### 7.2 Mock Data Generation

For the prototype, mock data should:
- Use realistic repository names (assistant-ui/assistant-ui, assistant-ui/tool-ui)
- Include 10-20 PRs, 30-50 issues per repo
- Vary timestamps over the past 30 days
- Include a mix of states (open, closed, merged)
- Have consistent user avatars and usernames
- Include realistic labels (bug, enhancement, docs, etc.)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | Jan 2026 | Initial component schemas |
