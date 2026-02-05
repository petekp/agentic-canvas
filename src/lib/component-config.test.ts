import { describe, expect, it } from "vitest";
import {
  inferSlackChannelFromText,
  resolveComponentConfig,
} from "@/lib/component-config";

describe("component config resolution", () => {
  it("infers channelName from last user message when missing", () => {
    const resolved = resolveComponentConfig("slack.channel-activity", undefined, {
      lastUserMessage: "#general",
    });

    expect(resolved?.channelName).toBe("general");
  });

  it("maps channel_name and channel to channelName", () => {
    const resolved = resolveComponentConfig("slack.channel-activity", {
      channel_name: "#random",
      channel: "#ignored",
    });

    expect(resolved?.channelName).toBe("random");
  });

  it("prefers explicit channel config over inferred", () => {
    const resolved = resolveComponentConfig(
      "slack.channel-activity",
      { channelName: "engineering" },
      { lastUserMessage: "#general" }
    );

    expect(resolved?.channelName).toBe("engineering");
  });

  it("parses slack channel links", () => {
    const parsed = inferSlackChannelFromText("<#C123ABC45|general>");
    expect(parsed).toEqual({ channelId: "C123ABC45", channelName: "general" });
  });
});
