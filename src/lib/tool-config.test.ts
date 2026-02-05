import { describe, expect, it } from "vitest";
import { resolveConfigFromChat } from "@/lib/tool-config";

describe("resolveConfigFromChat", () => {
  it("infers slack channelName from the last user message", () => {
    const resolved = resolveConfigFromChat(
      "slack.channel-activity",
      undefined,
      "#general"
    );

    expect(resolved).toMatchObject({ channelName: "general" });
  });

  it("infers slack channelId from the last user message", () => {
    const resolved = resolveConfigFromChat(
      "slack.channel-activity",
      undefined,
      "use C012ABCD12 for this"
    );

    expect(resolved).toMatchObject({ channelId: "C012ABCD12" });
  });

  it("does not override existing config", () => {
    const resolved = resolveConfigFromChat(
      "slack.channel-activity",
      { channelName: "random" },
      "#general"
    );

    expect(resolved).toMatchObject({ channelName: "random" });
  });

  it("leaves config unchanged for other component types", () => {
    const resolved = resolveConfigFromChat(
      "github.pr-list",
      { repo: "octo/repo" },
      "#general"
    );

    expect(resolved).toMatchObject({ repo: "octo/repo" });
  });

  it("infers slack userQuery from the last user message", () => {
    const resolved = resolveConfigFromChat(
      "slack.mentions",
      undefined,
      "show mentions for @pete"
    );

    expect(resolved).toMatchObject({ userQuery: "pete" });
  });

  it("infers slack userId from the last user message", () => {
    const resolved = resolveConfigFromChat(
      "slack.mentions",
      undefined,
      "check mentions for <@U123ABC456>"
    );

    expect(resolved).toMatchObject({ userId: "U123ABC456" });
  });
});
