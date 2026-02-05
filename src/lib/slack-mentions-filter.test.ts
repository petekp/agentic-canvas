import { describe, expect, it } from "vitest";
import { buildSlackMentionsFilterCode } from "@/lib/slack-mentions-filter";

describe("buildSlackMentionsFilterCode", () => {
  it("filters by userId", () => {
    const code = buildSlackMentionsFilterCode({ userId: "U123ABC456" });
    expect(code).toContain("u?.userId === 'U123ABC456'");
    expect(code).toContain("m?.mentions?.some");
  });

  it("adds username fallback when provided", () => {
    const code = buildSlackMentionsFilterCode({
      userId: "U123ABC456",
      username: "pete",
    });
    expect(code).toContain("u?.userId === 'U123ABC456'");
    expect(code).toContain("u?.username === 'pete'");
    expect(code).toContain("||");
  });

  it("escapes quotes and backslashes", () => {
    const code = buildSlackMentionsFilterCode({
      userId: "U123ABC\\'456",
      username: "pe\\'te",
    });
    expect(code).toContain("u?.userId === 'U123ABC\\\\\\'456'");
    expect(code).toContain("u?.username === 'pe\\\\\\'te'");
  });
});

