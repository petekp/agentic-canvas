import type {
  Rule,
  RuleApplicationResult,
  RuleContext,
  RulePhase,
  RuleTarget,
  RuleType,
} from "./types";

export interface RuleRegistryEntry {
  type: RuleType;
  phase: RulePhase;
  target: RuleTarget | RuleTarget[];
  apply: (items: unknown[], rule: Rule, ctx: RuleContext) => unknown[];
  explain: (rule: Rule) => string;
}

const DEFAULT_PHASE_ORDER: RulePhase[] = [
  "filter",
  "score",
  "sort",
  "limit",
  "trigger",
  "route",
  "compose",
  "suppress",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function getText(value: unknown): string {
  if (!isRecord(value)) return "";
  const candidates = [
    value.text,
    value.title,
    value.message,
    value.content,
  ];
  for (const entry of candidates) {
    if (typeof entry === "string") return entry;
  }
  return "";
}

function getTimestamp(value: unknown): number {
  if (!isRecord(value)) return 0;
  const candidates = [
    value.timestamp,
    value.updatedAt,
    value.createdAt,
    value.time,
    value.ts,
  ];
  for (const entry of candidates) {
    if (typeof entry === "number" && Number.isFinite(entry)) return entry;
    if (typeof entry === "string") {
      const parsed = Number(entry);
      if (!Number.isNaN(parsed)) return parsed;
      const date = Date.parse(entry);
      if (!Number.isNaN(date)) return date;
    }
  }
  return 0;
}

function withScore(item: unknown, delta: number): unknown {
  if (!isRecord(item)) return item;
  const base = typeof item._score === "number" ? item._score : 0;
  return { ...item, _score: base + delta };
}

function getParam<T>(rule: Rule, key: string, fallback: T): T {
  if (!rule.params || !(key in rule.params)) return fallback;
  return rule.params[key] as T;
}

export const RULE_REGISTRY: Record<RuleType, RuleRegistryEntry> = {
  "filter.limit": {
    type: "filter.limit",
    phase: "limit",
    target: [
      "slack.mentions",
      "slack.channel_activity",
      "github.prs",
      "github.issues",
      "vercel.deployments",
    ],
    apply: (items, rule) => {
      const count = getParam(rule, "count", 10);
      if (typeof count !== "number" || !Number.isFinite(count)) return items;
      return items.slice(0, Math.max(1, count));
    },
    explain: (rule) => {
      const count = getParam(rule, "count", 10);
      return `Limit to ${count} items.`;
    },
  },
  "filter.channel.include": {
    type: "filter.channel.include",
    phase: "filter",
    target: ["slack.mentions", "slack.channel_activity"],
    apply: (items, rule) => {
      const channels = getParam(rule, "channels", []);
      if (!Array.isArray(channels) || channels.length === 0) return items;
      const set = new Set(channels.map((c) => String(c)));
      return items.filter((item) => {
        if (!isRecord(item)) return false;
        const channel = item.channel ?? item.channelId;
        return channel ? set.has(String(channel)) : false;
      });
    },
    explain: (rule) => {
      const channels = getParam(rule, "channels", []);
      return `Include channels: ${Array.isArray(channels) ? channels.join(", ") : ""}.`;
    },
  },
  "filter.keyword.include": {
    type: "filter.keyword.include",
    phase: "filter",
    target: [
      "slack.mentions",
      "slack.channel_activity",
      "github.prs",
      "github.issues",
    ],
    apply: (items, rule) => {
      const keywords = getParam(rule, "keywords", []);
      if (!Array.isArray(keywords) || keywords.length === 0) return items;
      const needles = keywords.map((k) => String(k).toLowerCase());
      return items.filter((item) => {
        const text = getText(item).toLowerCase();
        return needles.some((needle) => text.includes(needle));
      });
    },
    explain: (rule) => {
      const keywords = getParam(rule, "keywords", []);
      return `Include keywords: ${Array.isArray(keywords) ? keywords.join(", ") : ""}.`;
    },
  },
  "filter.keyword.exclude": {
    type: "filter.keyword.exclude",
    phase: "filter",
    target: [
      "slack.mentions",
      "slack.channel_activity",
      "github.prs",
      "github.issues",
    ],
    apply: (items, rule) => {
      const keywords = getParam(rule, "keywords", []);
      if (!Array.isArray(keywords) || keywords.length === 0) return items;
      const needles = keywords.map((k) => String(k).toLowerCase());
      return items.filter((item) => {
        const text = getText(item).toLowerCase();
        return !needles.some((needle) => text.includes(needle));
      });
    },
    explain: (rule) => {
      const keywords = getParam(rule, "keywords", []);
      return `Exclude keywords: ${Array.isArray(keywords) ? keywords.join(", ") : ""}.`;
    },
  },
  "sort.recent": {
    type: "sort.recent",
    phase: "sort",
    target: [
      "slack.mentions",
      "slack.channel_activity",
      "github.prs",
      "github.issues",
      "vercel.deployments",
    ],
    apply: (items) => {
      return items.slice().sort((a, b) => getTimestamp(b) - getTimestamp(a));
    },
    explain: () => "Sort by most recent.",
  },
  "sort.score_then_recent": {
    type: "sort.score_then_recent",
    phase: "sort",
    target: [
      "slack.mentions",
      "slack.channel_activity",
      "github.prs",
      "github.issues",
    ],
    apply: (items) => {
      return items.slice().sort((a, b) => {
        const scoreA = isRecord(a) && typeof a._score === "number" ? a._score : 0;
        const scoreB = isRecord(b) && typeof b._score === "number" ? b._score : 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return getTimestamp(b) - getTimestamp(a);
      });
    },
    explain: () => "Sort by score, then recent.",
  },
  "score.llm_classifier": {
    type: "score.llm_classifier",
    phase: "score",
    target: [
      "slack.mentions",
      "slack.channel_activity",
      "github.prs",
      "github.issues",
      "vercel.deployments",
    ],
    apply: (items, rule, ctx) => {
      const weight = getParam(rule, "weight", 1);
      const scoreMap = ctx.signals?.llmScores;
      if (!scoreMap || typeof scoreMap !== "object") return items;
      return items.map((item) => {
        if (!isRecord(item)) return item;
        const key = item._llmKey ?? item.id ?? item.ts ?? item.timestamp;
        if (typeof key !== "string" && typeof key !== "number") return item;
        const score = (scoreMap as Record<string, unknown>)[String(key)];
        if (typeof score !== "number" || !Number.isFinite(score)) return item;
        return withScore(item, score * weight);
      });
    },
    explain: (rule) => {
      const instruction = getParam(rule, "instruction", "LLM classifier");
      const weight = getParam(rule, "weight", 1);
      return `Score via LLM (${instruction}) × ${weight}.`;
    },
  },
};

export function listRuleTypes(): RuleType[] {
  return Object.keys(RULE_REGISTRY) as RuleType[];
}

export function getRuleEntry(type: RuleType): RuleRegistryEntry | undefined {
  return RULE_REGISTRY[type];
}

function ruleTargetsMatch(entry: RuleRegistryEntry, target: RuleTarget): boolean {
  return Array.isArray(entry.target)
    ? entry.target.includes(target)
    : entry.target === target;
}

export function applyRulesToItems<T = unknown>(
  items: T[],
  rules: Rule[],
  target: RuleTarget,
  ctx: RuleContext,
  phaseOrder: RulePhase[] = DEFAULT_PHASE_ORDER
): RuleApplicationResult<T> {
  let current: unknown[] = items;
  const appliedRuleIds: string[] = [];

  const scoped = rules.filter((rule) => rule.enabled !== false && rule.target === target);
  const sorted = scoped.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const phase of phaseOrder) {
    for (const rule of sorted.filter((r) => r.phase === phase)) {
      const entry = getRuleEntry(rule.type);
      if (!entry || !ruleTargetsMatch(entry, target)) continue;
      current = entry.apply(current, rule, ctx);
      appliedRuleIds.push(rule.id ?? rule.type);
    }
  }

  return { items: current as T[], appliedRuleIds };
}
