import { describe, expect, it } from "vitest";
import { compilePreference } from "./compiler";
import { validatePreferencePatch } from "./validate";
import type { Rule } from "./types";

const validRules: Rule[] = [
  {
    id: "limit",
    type: "filter.limit",
    phase: "limit",
    target: "slack.mentions",
    params: { count: 3 },
  },
  {
    id: "score-llm",
    type: "score.llm_classifier",
    phase: "score",
    target: "slack.mentions",
    params: { instruction: "Prioritize questions." },
  },
];

describe("rules validation", () => {
  it("accepts a valid preference patch", () => {
    const patch = {
      target: "slack.mentions",
      rules: validRules,
      summary: "Show only the most recent mentions.",
    };

    const result = validatePreferencePatch(patch);
    expect(result.valid).toBe(true);
  });

  it("rejects a patch with unknown rule type", () => {
    const patch = {
      target: "slack.mentions",
      rules: [
        {
          id: "bad",
          type: "filter.unknown",
          phase: "filter",
          target: "slack.mentions",
        },
      ],
    };

    const result = validatePreferencePatch(patch);
    expect(result.valid).toBe(false);
    expect(result.errors && result.errors.length > 0).toBe(true);
  });

  it("compiler returns errors for invalid payload", () => {
    const result = compilePreference({ target: "slack.mentions", rules: [] });
    expect(result.patch).toBeNull();
    expect(result.errors && result.errors.length > 0).toBe(true);
  });

  it("compiler parses a JSON string payload", () => {
    const payload = JSON.stringify({
      target: "slack.mentions",
      rules: validRules,
    });

    const result = compilePreference(payload);
    expect(result.patch?.target).toBe("slack.mentions");
    expect(result.errors).toBeUndefined();
  });
});
