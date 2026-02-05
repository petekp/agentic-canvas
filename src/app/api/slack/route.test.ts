import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

describe("Slack API route", () => {
  const originalToken = process.env.SLACK_BOT_TOKEN;

  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
  });

  afterEach(() => {
    process.env.SLACK_BOT_TOKEN = originalToken;
    vi.restoreAllMocks();
  });

  it("returns a helpful error message when bot is not in channel", async () => {
    const { POST } = await import("@/app/api/slack/route");
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes("conversations.list")) {
        return jsonResponse({
          ok: true,
          channels: [{ id: "C123", name: "general" }],
        });
      }
      if (urlString.includes("conversations.history")) {
        return jsonResponse({ ok: false, error: "not_in_channel" });
      }
      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "channel_activity",
        params: { channelName: "general", limit: 5 },
      }),
    });

    const res = await POST(req as unknown as Request);
    const payload = await res.json();

    expect(res.status).toBe(500);
    expect(payload.error).toMatch(/not in|not a member/i);
    expect(payload.error).toMatch(/invite|add/i);
  });

  it("returns available channels for channel_list", async () => {
    const { POST } = await import("@/app/api/slack/route");
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes("conversations.list")) {
        return jsonResponse({
          ok: true,
          channels: [
            {
              id: "C123",
              name: "general",
              is_member: true,
              is_private: false,
              is_archived: false,
            },
            {
              id: "C999",
              name: "archived",
              is_member: true,
              is_private: false,
              is_archived: true,
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "channel_list",
        params: {},
      }),
    });

    const res = await POST(req as unknown as Request);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data).toEqual([
      { id: "C123", name: "general", isMember: true, isPrivate: false },
    ]);
  });

  it("expands user mentions in channel activity text", async () => {
    const { POST } = await import("@/app/api/slack/route");
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes("conversations.list")) {
        return jsonResponse({
          ok: true,
          channels: [{ id: "C123", name: "general" }],
        });
      }
      if (urlString.includes("conversations.history")) {
        return jsonResponse({
          ok: true,
          messages: [
            {
              ts: "1710000000.000100",
              user: "U111",
              text: "Hey <@U222> you have a mention",
            },
          ],
        });
      }
      if (urlString.includes("users.info?user=U111")) {
        return jsonResponse({
          ok: true,
          user: { id: "U111", name: "alice", profile: { display_name: "alice" } },
        });
      }
      if (urlString.includes("users.info?user=U222")) {
        return jsonResponse({
          ok: true,
          user: { id: "U222", name: "pete", profile: { display_name: "pete" } },
        });
      }
      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "channel_activity",
        params: { channelName: "general", limit: 5 },
      }),
    });

    const res = await POST(req as unknown as Request);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data[0].text).toContain("@pete");
  });

  it("includes thread replies when includeThreadReplies is true", async () => {
    const { POST } = await import("@/app/api/slack/route");
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes("conversations.list")) {
        return jsonResponse({
          ok: true,
          channels: [{ id: "C123", name: "general" }],
        });
      }
      if (urlString.includes("conversations.history")) {
        return jsonResponse({
          ok: true,
          messages: [
            {
              ts: "1710000000.000100",
              user: "U111",
              text: "Parent message",
              reply_count: 1,
            },
          ],
        });
      }
      if (urlString.includes("conversations.replies")) {
        return jsonResponse({
          ok: true,
          messages: [
            {
              ts: "1710000000.000100",
              user: "U111",
              text: "Parent message",
            },
            {
              ts: "1710000001.000200",
              user: "U222",
              text: "Thread reply",
              thread_ts: "1710000000.000100",
            },
          ],
        });
      }
      if (urlString.includes("users.info?user=U111")) {
        return jsonResponse({
          ok: true,
          user: { id: "U111", name: "alice", profile: { display_name: "alice" } },
        });
      }
      if (urlString.includes("users.info?user=U222")) {
        return jsonResponse({
          ok: true,
          user: { id: "U222", name: "bob", profile: { display_name: "bob" } },
        });
      }
      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "channel_activity",
        params: { channelName: "general", limit: 5, includeThreadReplies: true },
      }),
    });

    const res = await POST(req as unknown as Request);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.some((msg: { ts: string }) => msg.ts === "1710000001.000200")).toBe(true);
  });

  it("adds mention metadata to channel activity", async () => {
    const { POST } = await import("@/app/api/slack/route");
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes("conversations.list")) {
        return jsonResponse({
          ok: true,
          channels: [{ id: "C123", name: "general" }],
        });
      }
      if (urlString.includes("conversations.history")) {
        return jsonResponse({
          ok: true,
          messages: [
            {
              ts: "1710000000.000100",
              user: "U111",
              text: "Hey <@U222> check this out",
            },
          ],
        });
      }
      if (urlString.includes("users.info?user=U111")) {
        return jsonResponse({
          ok: true,
          user: { id: "U111", name: "alice", profile: { display_name: "alice" } },
        });
      }
      if (urlString.includes("users.info?user=U222")) {
        return jsonResponse({
          ok: true,
          user: { id: "U222", name: "pete", profile: { display_name: "Pete" } },
        });
      }
      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "channel_activity",
        params: { channelName: "general", limit: 5 },
      }),
    });

    const res = await POST(req as unknown as Request);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data[0].mentions).toEqual([
      { userId: "U222", username: "pete", displayName: "Pete" },
    ]);
  });

  it("falls back to users.list when user info lookup fails", async () => {
    const { POST } = await import("@/app/api/slack/route");
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes("conversations.list")) {
        return jsonResponse({
          ok: true,
          channels: [{ id: "C123", name: "general" }],
        });
      }
      if (urlString.includes("conversations.history")) {
        return jsonResponse({
          ok: true,
          messages: [
            {
              ts: "1710000000.000100",
              user: "U111",
              text: "Hey <@U222> check this out",
            },
          ],
        });
      }
      if (urlString.includes("users.info?user=U111")) {
        return jsonResponse({
          ok: true,
          user: { id: "U111", name: "alice", profile: { display_name: "alice" } },
        });
      }
      if (urlString.includes("users.info?user=U222")) {
        return jsonResponse({ ok: false, error: "missing_scope" });
      }
      if (urlString.includes("users.list")) {
        return jsonResponse({
          ok: true,
          members: [
            { id: "U222", name: "pete", profile: { display_name: "Pete" } },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "channel_activity",
        params: { channelName: "general", limit: 5 },
      }),
    });

    const res = await POST(req as unknown as Request);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data[0].text).toContain("@Pete");
    expect(payload.data[0].mentions).toEqual([
      { userId: "U222", username: "pete", displayName: "Pete" },
    ]);
  });

  it("supports user lookup by query", async () => {
    const { POST } = await import("@/app/api/slack/route");
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes("users.list")) {
        return jsonResponse({
          ok: true,
          members: [
            { id: "U111", name: "alice", profile: { display_name: "Alice" } },
            { id: "U222", name: "pete", profile: { display_name: "Pete" } },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "user_lookup",
        params: { query: "pete", limit: 5 },
      }),
    });

    const res = await POST(req as unknown as Request);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data[0]).toEqual({
      userId: "U222",
      username: "pete",
      displayName: "Pete",
    });
  });

  it("returns active users for user_list", async () => {
    const { POST } = await import("@/app/api/slack/route");
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.includes("users.list")) {
        return jsonResponse({
          ok: true,
          members: [
            { id: "U111", name: "alice", profile: { display_name: "Alice" } },
            { id: "U222", name: "zed", profile: { display_name: "Zed" } },
            { id: "U333", name: "bot", is_bot: true, profile: { display_name: "Bot" } },
            { id: "U444", name: "ghost", deleted: true, profile: { display_name: "Ghost" } },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${urlString}`);
    }) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "user_list",
        params: { limit: 10 },
      }),
    });

    const res = await POST(req as unknown as Request);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data).toEqual([
      { userId: "U111", username: "alice", displayName: "Alice" },
      { userId: "U222", username: "zed", displayName: "Zed" },
    ]);
  });
});
