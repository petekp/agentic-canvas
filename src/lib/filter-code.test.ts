import { describe, expect, it } from "vitest";
import { normalizeFilterCodeForType } from "@/lib/filter-code";

function runTransform(code: string, data: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function("data", code);
  return fn(data);
}

describe("normalizeFilterCodeForType", () => {
  it("rewrites github activity actor.login filters to match actor string shape", () => {
    const original =
      "return data.filter(activity => activity.actor.login === 'petekp')";
    const normalized = normalizeFilterCodeForType(
      "github.activity-timeline",
      original
    );

    const input = [
      { id: "1", actor: "petekp" },
      { id: "2", actor: "someone-else" },
      { id: "3", actor: { login: "petekp" } },
    ];

    const result = runTransform(normalized, input) as Array<{ id: string }>;
    expect(result.map((item) => item.id)).toEqual(["1", "3"]);
  });

  it("keeps non-github filter code unchanged", () => {
    const original = "return data.filter(item => item.value > 1)";
    expect(normalizeFilterCodeForType("slack.channel-activity", original)).toBe(
      original
    );
  });
});

