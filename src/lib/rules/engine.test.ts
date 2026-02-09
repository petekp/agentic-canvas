import { describe, expect, it } from "vitest";
import { applyRulesToItems } from "./registry";
import { previewRules } from "./preview";
import { compilePreference } from "./compiler";
import type { Rule, RuleContext } from "./types";

const ctx: RuleContext = {
  userId: "user_1",
  now: Date.now(),
  scope: "component",
};

describe("rules engine", () => {
  it("applies limit rule", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const rules: Rule[] = [
      {
        id: "limit",
        type: "filter.limit",
        phase: "limit",
        target: "slack.mentions",
        params: { count: 2 },
      },
    ];

    const result = applyRulesToItems(items, rules, "slack.mentions", ctx);
    expect(result.items.length).toBe(2);
    expect(result.appliedRuleIds).toContain("limit");
  });

  it("scores via LLM classifier and sorts by score then recent", () => {
    const items = [
      { id: 1, text: "hello", timestamp: 10, _llmKey: "a" },
      { id: 2, text: "can you review this?", timestamp: 5, _llmKey: "b" },
      { id: 3, text: "any updates?", timestamp: 20, _llmKey: "c" },
    ];

    const rules: Rule[] = [
      {
        id: "score-llm",
        type: "score.llm_classifier",
        phase: "score",
        target: "slack.mentions",
        params: { instruction: "Prioritize questions." },
      },
      {
        id: "sort",
        type: "sort.score_then_recent",
        phase: "sort",
        target: "slack.mentions",
      },
    ];

    const result = applyRulesToItems(items, rules, "slack.mentions", {
      ...ctx,
      signals: { llmScores: { a: 0.1, b: 0.8, c: 0.9 } },
    });
    expect(result.items[0]).toMatchObject({ id: 3 });
  });

  it("filters by keyword include", () => {
    const items = [
      { id: 1, text: "review this" },
      { id: 2, text: "hello world" },
    ];

    const rules: Rule[] = [
      {
        id: "include",
        type: "filter.keyword.include",
        phase: "filter",
        target: "slack.mentions",
        params: { keywords: ["review"] },
      },
    ];

    const result = applyRulesToItems(items, rules, "slack.mentions", ctx);
    expect(result.items.length).toBe(1);
    expect(result.items[0]).toMatchObject({ id: 1 });
  });

  it("previews explanations", () => {
    const items = [{ id: 1, text: "hello?" }];
    const rules: Rule[] = [
      {
        id: "score-llm",
        type: "score.llm_classifier",
        phase: "score",
        target: "slack.mentions",
        params: { instruction: "Prioritize questions.", weight: 2 },
      },
      {
        id: "sort",
        type: "sort.score_then_recent",
        phase: "sort",
        target: "slack.mentions",
      },
    ];

    const preview = previewRules(items, rules, "slack.mentions", ctx);
    expect(preview.explanations.length).toBe(2);
    expect(preview.explanations[0]).toMatch(/Score via LLM/i);
  });

  it("compiles a patch and applies rules", () => {
    const payload = JSON.stringify({
      target: "slack.mentions",
      rules: [
        {
          id: "limit",
          type: "filter.limit",
          phase: "limit",
          target: "slack.mentions",
          params: { count: 2 },
        },
        {
          id: "score-llm",
          type: "score.llm_classifier",
          phase: "score",
          target: "slack.mentions",
          params: { instruction: "Prioritize questions." },
        },
      ],
    });

    const compiled = compilePreference(payload);
    expect(compiled.patch).not.toBeNull();
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = applyRulesToItems(items, compiled.patch!.rules, "slack.mentions", ctx);
    expect(result.items.length).toBe(2);
  });
});
