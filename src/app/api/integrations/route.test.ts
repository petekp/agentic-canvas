import { afterEach, beforeEach, describe, expect, it } from "vitest";

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("GET /api/integrations", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports integration availability from env vars", async () => {
    setEnv({
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_USER_TOKEN: undefined,
      POSTHOG_API_KEY: "ph-key",
      POSTHOG_PROJECT_ID: "ph-project",
      VERCEL_TOKEN: undefined,
      GITHUB_TOKEN: "ghp-test",
    });

    const { GET } = await import("@/app/api/integrations/route");
    const res = await GET();
    const payload = await res.json();

    expect(payload.slack.bot).toBe(true);
    expect(payload.slack.user).toBe(false);
    expect(payload.posthog).toBe(true);
    expect(payload.vercel).toBe(false);
    expect(payload.github).toBe(true);
  });
});
