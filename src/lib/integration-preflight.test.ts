import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertIntegrationAvailable,
  getIntegrationStatus,
  resetIntegrationStatusCache,
} from "@/lib/integration-preflight";

describe("integration preflight", () => {
  beforeEach(() => {
    resetIntegrationStatusCache();
    vi.restoreAllMocks();
  });

  it("throws when slack user token missing for mentions", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        slack: { bot: true, user: false },
        posthog: false,
        vercel: false,
        github: false,
      }),
    })) as unknown as typeof fetch;

    await expect(assertIntegrationAvailable("slack.mentions")).rejects.toThrow(/xoxp/i);
  });

  it("allows slack channel activity when bot token present", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        slack: { bot: true, user: false },
        posthog: false,
        vercel: false,
        github: false,
      }),
    })) as unknown as typeof fetch;

    await expect(assertIntegrationAvailable("slack.channel-activity")).resolves.toBeUndefined();
  });

  it("caches integration status", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        slack: { bot: true, user: true },
        posthog: true,
        vercel: true,
        github: true,
      }),
    }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await getIntegrationStatus();
    const second = await getIntegrationStatus();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});
