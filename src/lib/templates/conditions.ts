import type { CanvasContext, ConditionExpression, GenerationIntent, StateSnapshot } from "@/types";

export interface ConditionContext {
  state: StateSnapshot;
  context: CanvasContext;
  intent?: GenerationIntent;
  params?: Record<string, unknown>;
}

function getPathValue(root: unknown, path: string): unknown {
  if (!root) return undefined;
  const parts = path.split(".").filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function resolveToken(token: string, ctx: ConditionContext): unknown {
  if (token.startsWith("state.")) {
    return getPathValue(ctx.state, token.slice("state.".length));
  }
  if (token.startsWith("context.")) {
    return getPathValue(ctx.context, token.slice("context.".length));
  }
  if (token.startsWith("intent.")) {
    return ctx.intent ? getPathValue(ctx.intent, token.slice("intent.".length)) : undefined;
  }
  if (token.startsWith("params.")) {
    return ctx.params ? getPathValue(ctx.params, token.slice("params.".length)) : undefined;
  }
  return undefined;
}

function compareNumbers(
  op: "gt" | "lt",
  left: unknown,
  right: number | string
): boolean {
  const leftNum = typeof left === "number" ? left : Number(left);
  const rightNum = typeof right === "number" ? right : Number(right);
  if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) return false;
  return op === "gt" ? leftNum > rightNum : leftNum < rightNum;
}

export function evaluateCondition(expression: ConditionExpression, ctx: ConditionContext): boolean {
  if (expression.op === "and") {
    return expression.conditions.every((condition) => evaluateCondition(condition, ctx));
  }
  if (expression.op === "or") {
    return expression.conditions.some((condition) => evaluateCondition(condition, ctx));
  }

  const left = resolveToken(expression.left, ctx) ?? expression.left;

  switch (expression.op) {
    case "gt":
    case "lt":
      return compareNumbers(expression.op, left, expression.right);
    case "eq":
      return left === expression.right;
    default:
      return false;
  }
}
