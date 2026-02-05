import { describe, expect, it } from "vitest";
import { createSystemPrompt } from "@/lib/ai-tools";
import type { Canvas } from "@/types";

function makeCanvas(): Canvas {
  return {
    grid: {
      columns: 12,
      rows: 8,
      gap: 24,
      cellWidth: 120,
      cellHeight: 120,
    },
    components: [],
  } as Canvas;
}

describe("createSystemPrompt", () => {
  it("escapes backticks in guidelines so prompt compiles", () => {
    const prompt = createSystemPrompt({ canvas: makeCanvas() });
    expect(prompt).toContain("success: false");
    expect(prompt).toContain("missingFields");
  });

  it("documents Slack mentions fallback channel picker UX", () => {
    const prompt = createSystemPrompt({ canvas: makeCanvas() });
    expect(prompt).toContain("add_filtered_component");
    expect(prompt).toContain("All available channels");
  });

  it("includes integration availability hints so the assistant can pick fallbacks", () => {
    const prevSlackBot = process.env.SLACK_BOT_TOKEN;
    const prevSlackUser = process.env.SLACK_USER_TOKEN;

    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    delete process.env.SLACK_USER_TOKEN;

    const prompt = createSystemPrompt({ canvas: makeCanvas() });
    expect(prompt).toContain("## Integrations");
    expect(prompt).toMatch(/Slack bot token:\s*available/i);
    expect(prompt).toMatch(/Slack user token:\s*unavailable/i);

    process.env.SLACK_BOT_TOKEN = prevSlackBot;
    if (prevSlackUser === undefined) {
      delete process.env.SLACK_USER_TOKEN;
    } else {
      process.env.SLACK_USER_TOKEN = prevSlackUser;
    }
  });
});
