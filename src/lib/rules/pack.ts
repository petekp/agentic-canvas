import { current, isDraft } from "immer";
import type { Rule, RulePack, RuleTarget } from "./types";

const INTEGRATION_TARGETS: Record<
  RuleTarget,
  { integration: "slack" | "github" | "vercel"; block: string } | null
> = {
  "slack.mentions": { integration: "slack", block: "mentions" },
  "slack.channel_activity": { integration: "slack", block: "channel_activity" },
  "github.prs": { integration: "github", block: "prs" },
  "github.issues": { integration: "github", block: "issues" },
  "vercel.deployments": { integration: "vercel", block: "deployments" },
  "assistant.suggestions": null,
  "space.template": null,
  "space.layout": null,
  notifications: null,
};

export function createEmptyRulePack(): RulePack {
  return { version: "v1" };
}

function ensureRulePack(pack?: RulePack): RulePack {
  if (!pack) return createEmptyRulePack();
  const base = isDraft(pack) ? current(pack) : pack;
  return structuredClone(base);
}

function removeTargetRules(rules: Rule[] | undefined, target: RuleTarget): Rule[] {
  if (!rules || rules.length === 0) return [];
  return rules.filter((rule) => rule.target !== target);
}

export function setRulesForTarget(
  pack: RulePack | undefined,
  target: RuleTarget,
  rules: Rule[]
): RulePack {
  const next = ensureRulePack(pack);
  const mapping = INTEGRATION_TARGETS[target];

  if (mapping) {
    next.integrations ??= {};
    next.integrations[mapping.integration] ??= {};
    (next.integrations[mapping.integration] as Record<string, { rules: Rule[] }>)[mapping.block] = {
      rules,
    };

    if (next.global?.rules) {
      next.global.rules = removeTargetRules(next.global.rules, target);
    }

    return next;
  }

  next.global ??= { rules: [] };
  const filtered = removeTargetRules(next.global.rules, target);
  next.global.rules = [...filtered, ...rules];
  return next;
}

export function getRulesForTarget(pack: RulePack | undefined, target: RuleTarget): Rule[] {
  if (!pack) return [];

  const globalRules = pack.global?.rules?.filter((rule) => rule.target === target) ?? [];
  const mapping = INTEGRATION_TARGETS[target];

  if (!mapping) {
    return globalRules;
  }

  const integrationContainer = pack.integrations?.[mapping.integration] as
    | Record<string, { rules: Rule[] }>
    | undefined;
  const integrationRules = integrationContainer?.[mapping.block]?.rules ?? [];
  return [...globalRules, ...integrationRules];
}

export function listRulesByTarget(pack: RulePack | undefined): Map<RuleTarget, Rule[]> {
  const entries = new Map<RuleTarget, Rule[]>();
  if (!pack) return entries;

  const allTargets = Object.keys(INTEGRATION_TARGETS) as RuleTarget[];
  for (const target of allTargets) {
    const rules = getRulesForTarget(pack, target);
    if (rules.length > 0) {
      entries.set(target, rules);
    }
  }
  return entries;
}
