import type { CanvasContext, StateSnapshot, TemplateDefinition, TemplateSelection } from "@/types";
import { evaluateCondition, type ConditionContext } from "./conditions";

export interface TemplateScore {
  template: TemplateDefinition;
  score: number;
  reasons: string[];
}

function scoreSelection(
  selection: TemplateSelection,
  ctx: ConditionContext
): { score: number; reasons: string[] } {
  let score = selection.baseScore ?? 0;
  const reasons: string[] = [];

  for (const rule of selection.rules) {
    if (evaluateCondition(rule.when, ctx)) {
      score += rule.weight;
      reasons.push(rule.reason);
    }
  }

  return { score, reasons };
}

export function scoreTemplate(
  template: TemplateDefinition,
  state: StateSnapshot,
  context: CanvasContext
): TemplateScore {
  const { score, reasons } = scoreSelection(template.selection, { state, context });
  return { template, score, reasons };
}

export interface SelectTemplatesOptions {
  limit?: number;
  category?: TemplateDefinition["category"];
}

export function selectTemplates(
  templates: TemplateDefinition[],
  state: StateSnapshot,
  context: CanvasContext,
  options: SelectTemplatesOptions = {}
): TemplateScore[] {
  const { limit = 3, category } = options;
  const filtered = category ? templates.filter((t) => t.category === category) : templates;

  const scored = filtered
    .map((template) => scoreTemplate(template, state, context))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, Math.max(1, limit));
}

export function selectTopTemplate(
  templates: TemplateDefinition[],
  state: StateSnapshot,
  context: CanvasContext,
  options: SelectTemplatesOptions = {}
): TemplateScore | null {
  const [top] = selectTemplates(templates, state, context, { ...options, limit: 1 });
  return top ?? null;
}
