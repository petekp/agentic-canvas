import { describe, expect, it } from "vitest";
import { applySlackMentionsChannelActivityDefaults } from "./slack-mentions-defaults";

describe("applySlackMentionsChannelActivityDefaults", () => {
  it("adds mention-friendly defaults when config is empty", () => {
    const next = applySlackMentionsChannelActivityDefaults(undefined);
    expect(next).toEqual({ includeThreadReplies: true, limit: 100 });
  });

  it("does not override explicit config values", () => {
    const next = applySlackMentionsChannelActivityDefaults({
      includeThreadReplies: false,
      limit: 10,
    });
    expect(next).toEqual({ includeThreadReplies: false, limit: 10 });
  });

  it("does not override templated limit values", () => {
    const next = applySlackMentionsChannelActivityDefaults({ limit: "$limit" });
    expect(next).toEqual({ includeThreadReplies: true, limit: "$limit" });
  });
});

