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
    const prevGithub = process.env.GITHUB_TOKEN;

    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    delete process.env.SLACK_USER_TOKEN;
    delete process.env.GITHUB_TOKEN;

    const prompt = createSystemPrompt({ canvas: makeCanvas() });
    expect(prompt).toContain("## Integrations");
    expect(prompt).toMatch(/Slack bot token:\s*available/i);
    expect(prompt).toMatch(/Slack user token:\s*unavailable/i);
    expect(prompt).toMatch(/GitHub token:\s*unavailable/i);
    expect(prompt).toContain("required for all github.* components");
    expect(prompt).toContain("do not add GitHub components");
    expect(prompt).toContain('If the user explicitly says "this space"');
    expect(prompt).toContain("If the user gives an explicit component ID");
    expect(prompt).toContain('call remove_component({ component_id: "cmp_ABC123" })');
    expect(prompt).toContain("prefer generate_template in the current space");

    process.env.SLACK_BOT_TOKEN = prevSlackBot;
    if (prevSlackUser === undefined) {
      delete process.env.SLACK_USER_TOKEN;
    } else {
      process.env.SLACK_USER_TOKEN = prevSlackUser;
    }
    if (prevGithub === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = prevGithub;
    }
  });
});
