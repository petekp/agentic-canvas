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

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  statsDisplayTemplate,
  prReviewTableTemplate,
  issueTriageTableTemplate,
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
