import type { Rule, RuleContext, RulePhase, RuleTarget } from "./types";
import { applyRulesToItems, getRuleEntry } from "./registry";

export interface RulePreviewResult<T = unknown> {
  before: T[];
  after: T[];
  appliedRuleIds: string[];
  explanations: string[];
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

export function previewRules<T = unknown>(
  items: T[],
  rules: Rule[],
  target: RuleTarget,
  ctx: RuleContext,
  phaseOrder: RulePhase[] = DEFAULT_PHASE_ORDER
): RulePreviewResult<T> {
  const before = items.slice();
  const result = applyRulesToItems(items, rules, target, ctx, phaseOrder);
  const explanations = rules
    .filter((rule) => rule.enabled !== false && rule.target === target)
    .map((rule) => {
      const entry = getRuleEntry(rule.type);
      return entry?.explain(rule) ?? rule.type;
    });

  return {
    before,
    after: result.items,
    appliedRuleIds: result.appliedRuleIds,
    explanations,
  };
}
