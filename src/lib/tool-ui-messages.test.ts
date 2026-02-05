import { describe, expect, it } from "vitest";
import { formatAddFilteredComponentToolMessage } from "./tool-ui-messages";

describe("formatAddFilteredComponentToolMessage", () => {
  it("prompts for Slack user first when mentions intent and channel is missing", () => {
    const message = formatAddFilteredComponentToolMessage({
      result: { success: false, missingFields: ["channelId"] },
      mentionIntent: true,
      hasMentionsUser: false,
    });

    expect(message?.tone).toBe("prompt");
    expect(message?.message).toMatch(/slack user/i);
    expect(message?.message).not.toMatch(/slack channel/i);
  });

  it("prompts for channels (and mentions all-channels) after user is selected", () => {
    const message = formatAddFilteredComponentToolMessage({
      result: { success: false, missingFields: ["channelId"] },
      mentionIntent: true,
      hasMentionsUser: true,
    });

    expect(message?.tone).toBe("prompt");
    expect(message?.message).toMatch(/slack channel/i);
    expect(message?.message).toMatch(/all available channels/i);
  });

  it("falls back to generic tool error messaging when not a mentions intent", () => {
    const message = formatAddFilteredComponentToolMessage({
      result: { success: false, missingFields: ["channelId"] },
      mentionIntent: false,
      hasMentionsUser: false,
    });

    expect(message?.tone).toBe("error");
    expect(message?.message).toMatch(/which slack channel/i);
  });
});

