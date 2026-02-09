export type RulePhase =
  | "filter"
  | "score"
  | "sort"
  | "limit"
  | "trigger"
  | "route"
  | "compose"
  | "suppress";

export type RuleTarget =
  | "slack.mentions"
  | "slack.channel_activity"
  | "github.prs"
  | "github.issues"
  | "vercel.deployments"
  | "assistant.suggestions"
  | "space.template"
  | "space.layout"
  | "notifications";

export type RuleType =
  | "filter.limit"
  | "filter.channel.include"
  | "filter.keyword.include"
  | "filter.keyword.exclude"
  | "sort.recent"
  | "sort.score_then_recent"
  | "score.llm_classifier";

export interface Rule {
  id?: string;
  type: RuleType;
  phase: RulePhase;
  target: RuleTarget;
  priority?: number;
  enabled?: boolean;
  params?: Record<string, unknown>;
}

export interface RuleBlock {
  rules: Rule[];
}

export interface RulePack {
  version: "v1";
  global?: RuleBlock;
  integrations?: {
    slack?: {
      mentions?: RuleBlock;
      channel_activity?: RuleBlock;
    };
    github?: {
      prs?: RuleBlock;
      issues?: RuleBlock;
    };
    vercel?: {
      deployments?: RuleBlock;
    };
  };
}

export interface RuleContext {
  userId: string;
  now: number;
  scope: "global" | "workspace" | "space" | "component";
  signals?: Record<string, unknown>;
}

export interface RuleApplicationResult<T = unknown> {
  items: T[];
  appliedRuleIds: string[];
}
