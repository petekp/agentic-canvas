import type { TemplateDefinition } from "@/types";
import { registerTemplate } from "./registry";

// Derived from /Users/petepetrash/Code/aui/tool-ui/components/tool-ui/stats-display
const statsDisplayTemplate: TemplateDefinition = {
  id: "tool-ui/stats-display/monitor-v1",
  version: "1.0.0",
  name: "Stat Display Monitor",
  description: "Single metric with sparkline and delta, based on tool-ui stats-display.",
  category: "monitor",
  parameters: [
    { key: "repo", type: "string", default: "assistant-ui/assistant-ui" },
    {
      key: "metric",
      type: "enum",
      enumValues: ["open_prs", "open_issues", "merged_prs", "open_prs_review"],
      default: "open_prs",
      description: "GitHub metric to display",
    },
    { key: "label", type: "string", default: "Open PRs" },
  ],
  constraints: {
    preferredAspect: "square",
    maxCognitiveLoad: 0.35,
    maxVisualDensity: 0.4,
  },
  selection: {
    baseScore: 0.2,
    rules: [
      {
        when: { op: "eq", left: "state.mode", right: "monitor" },
        weight: 0.5,
        reason: "Monitor mode favors glanceable metrics",
      },
      {
        when: { op: "gt", left: "state.timePressure", right: 0.6 },
        weight: 0.2,
        reason: "High time pressure prefers single KPI",
      },
    ],
  },
  output: {
    components: [
      {
        typeId: "github.stat-tile",
        config: { repo: "$repo", metric: "$metric" },
        dataBinding: {
          source: "mock-github",
          query: { type: "stats", params: { repo: "$repo", metric: "$metric" } },
          refreshInterval: 30000,
        },
        meta: { label: "$label" },
      },
    ],
  },
  root: {
    id: "root",
    type: "stack",
    props: { direction: "column", gap: 8, padding: 12 },
    children: [
      { id: "eyebrow", type: "label", props: { content: "$label" } },
      {
        id: "metric",
        type: "metric",
        dataRef: "stat",
        props: { label: "$label" },
      },
      {
        id: "spark",
        type: "chart",
        dataRef: "trend",
        props: { kind: "spark" },
      },
    ],
  },
};

// Derived from /Users/petepetrash/Code/aui/tool-ui/components/tool-ui/data-table
const prReviewTableTemplate: TemplateDefinition = {
  id: "tool-ui/data-table/pr-review-v1",
  version: "1.0.0",
  name: "PR Review Table",
  description: "Sortable pull request table based on tool-ui data-table.",
  category: "review",
  parameters: [
    { key: "repo", type: "string", default: "assistant-ui/assistant-ui" },
    { key: "limit", type: "number", min: 3, max: 20, default: 8 },
    {
      key: "filter",
      type: "enum",
      enumValues: ["review_requested", "authored", "all"],
      default: "review_requested",
    },
    { key: "label", type: "string", default: "PRs Needing Review" },
  ],
  constraints: {
    preferredAspect: "wide",
    maxCognitiveLoad: 0.6,
    maxVisualDensity: 0.6,
  },
  selection: {
    baseScore: 0.15,
    rules: [
      {
        when: { op: "eq", left: "state.mode", right: "review" },
        weight: 0.6,
        reason: "Review mode aligns with tabular scanning",
      },
      {
        when: { op: "gt", left: "state.focus", right: 0.5 },
        weight: 0.2,
        reason: "Sustained focus supports table review",
      },
    ],
  },
  output: {
    components: [
      {
        typeId: "github.pr-list",
        config: {
          repo: "$repo",
          limit: "$limit",
          filter: "$filter",
          state: "open",
        },
        dataBinding: {
          source: "mock-github",
          query: {
            type: "pull_requests",
            params: { repo: "$repo", limit: "$limit", filter: "$filter", state: "open" },
          },
          refreshInterval: 60000,
        },
        meta: { label: "$label" },
      },
    ],
  },
  root: {
    id: "root",
    type: "stack",
    props: { direction: "column", gap: 10, padding: 12 },
    children: [
      { id: "title", type: "heading", props: { content: "$label" } },
      {
        id: "table",
        type: "list",
        dataRef: "rows",
        props: { limit: "$limit", density: "compact" },
      },
    ],
  },
};

// Derived from /Users/petepetrash/Code/aui/tool-ui/components/tool-ui/data-table
const issueTriageTableTemplate: TemplateDefinition = {
  id: "tool-ui/data-table/issue-triage-v1",
  version: "1.0.0",
  name: "Issue Triage Table",
  description: "Sortable issue table based on tool-ui data-table.",
  category: "focus",
  parameters: [
    { key: "repo", type: "string", default: "assistant-ui/assistant-ui" },
    { key: "limit", type: "number", min: 4, max: 20, default: 8 },
    {
      key: "filter",
      type: "enum",
      enumValues: ["assigned", "mentioned", "created", "all"],
      default: "assigned",
    },
    { key: "label", type: "string", default: "My Issues" },
  ],
  constraints: {
    preferredAspect: "wide",
    maxCognitiveLoad: 0.55,
    maxVisualDensity: 0.6,
  },
  selection: {
    baseScore: 0.2,
    rules: [
      {
        when: { op: "eq", left: "state.mode", right: "execute" },
        weight: 0.4,
        reason: "Execute mode favors task triage",
      },
      {
        when: { op: "gt", left: "state.timePressure", right: 0.5 },
        weight: 0.2,
        reason: "Time pressure prioritizes actionable issues",
      },
    ],
  },
  output: {
    components: [
      {
        typeId: "github.issue-grid",
        config: {
          repo: "$repo",
          limit: "$limit",
          filter: "$filter",
          state: "open",
        },
        dataBinding: {
          source: "mock-github",
          query: {
            type: "issues",
            params: { repo: "$repo", limit: "$limit", filter: "$filter", state: "open" },
          },
          refreshInterval: 60000,
        },
        meta: { label: "$label" },
      },
    ],
  },
  root: {
    id: "root",
    type: "stack",
    props: { direction: "column", gap: 10, padding: 12 },
    children: [
      { id: "title", type: "heading", props: { content: "$label" } },
      {
        id: "table",
        type: "list",
        dataRef: "rows",
        props: { limit: "$limit", density: "compact" },
      },
    ],
  },
};

const morningBriefingTemplate: TemplateDefinition = {
  id: "briefing/morning-v1",
  version: "1.0.0",
  name: "Morning Briefing",
  description: "A focused daily briefing space for OSS maintainers.",
  category: "monitor",
  parameters: [
    { key: "repos", type: "json", default: [] },
    { key: "primaryRepo", type: "string", default: "assistant-ui/assistant-ui" },
    { key: "slackUserId", type: "string" },
    { key: "slackChannels", type: "json", default: [] },
    { key: "vercelProjectId", type: "string" },
    { key: "vercelTeamId", type: "string" },
  ],
  constraints: {
    preferredAspect: "wide",
    maxCognitiveLoad: 0.8,
    maxVisualDensity: 0.7,
  },
  selection: {
    baseScore: 0,
    rules: [],
  },
  output: {
    components: [
      {
        typeId: "briefing.recommendations",
        config: {
          repos: "$repos",
          slackUserId: "$slackUserId",
          slackChannels: "$slackChannels",
          vercelProjectId: "$vercelProjectId",
          vercelTeamId: "$vercelTeamId",
        },
        dataBinding: {
          source: "briefing",
          query: {
            type: "recommendations",
            params: {
              repos: "$repos",
              slackUserId: "$slackUserId",
              slackChannels: "$slackChannels",
              vercelProjectId: "$vercelProjectId",
              vercelTeamId: "$vercelTeamId",
            },
          },
          refreshInterval: 300000,
        },
        size: { cols: 6, rows: 4 },
        position: { col: 0, row: 0 },
        meta: { label: "Morning Briefing" },
      },
      {
        typeId: "vercel.deployments",
        config: {
          projectId: "$vercelProjectId",
          teamId: "$vercelTeamId",
          limit: 10,
        },
        dataBinding: {
          source: "vercel",
          query: {
            type: "deployments",
            params: {
              projectId: "$vercelProjectId",
              teamId: "$vercelTeamId",
              limit: 10,
            },
          },
          refreshInterval: 30000,
        },
        size: { cols: 6, rows: 3 },
        position: { col: 6, row: 0 },
        meta: { label: "Deployments" },
      },
      {
        typeId: "github.team-activity",
        config: { repo: "$primaryRepo", timeWindow: "7d" },
        dataBinding: {
          source: "mock-github",
          query: { type: "team_activity", params: { repo: "$primaryRepo", timeWindow: "7d" } },
          refreshInterval: 120000,
        },
        size: { cols: 6, rows: 5 },
        position: { col: 6, row: 3 },
        meta: { label: "Team Activity" },
      },
      {
        typeId: "github.pr-list",
        config: {
          repo: "$primaryRepo",
          state: "open",
          filter: "review_requested",
          limit: 5,
        },
        dataBinding: {
          source: "mock-github",
          query: {
            type: "pull_requests",
            params: {
              repo: "$primaryRepo",
              state: "open",
              filter: "review_requested",
              limit: 5,
            },
          },
          refreshInterval: 60000,
        },
        size: { cols: 4, rows: 4 },
        position: { col: 0, row: 4 },
        meta: { label: "PRs Needing Review" },
      },
      {
        typeId: "github.issue-grid",
        config: { repo: "$primaryRepo", state: "open", limit: 6 },
        dataBinding: {
          source: "mock-github",
          query: {
            type: "issues",
            params: { repo: "$primaryRepo", state: "open", limit: 6 },
          },
          refreshInterval: 60000,
        },
        size: { cols: 4, rows: 4 },
        position: { col: 4, row: 4 },
        meta: { label: "Open Issues" },
      },
      {
        typeId: "slack.mentions",
        config: { userId: "$slackUserId", limit: 10 },
        dataBinding: {
          source: "slack",
          query: { type: "mentions", params: { userId: "$slackUserId", limit: 10 } },
          refreshInterval: 60000,
        },
        size: { cols: 4, rows: 4 },
        position: { col: 8, row: 4 },
        meta: { label: "Mentions" },
      },
    ],
  },
  root: {
    id: "root",
    type: "grid",
    props: { gap: 16 },
    children: [],
  },
};

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  statsDisplayTemplate,
  prReviewTableTemplate,
  issueTriageTableTemplate,
  morningBriefingTemplate,
];

let registered = false;

export function registerDefaultTemplates(): void {
  if (registered) return;
  for (const template of DEFAULT_TEMPLATES) {
    registerTemplate(template);
  }
  registered = true;
}

export function getDefaultTemplates(): TemplateDefinition[] {
  return DEFAULT_TEMPLATES;
}
