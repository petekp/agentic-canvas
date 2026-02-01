// Slack API Route - fetches real data from Slack
// Keeps token server-side for security

import { NextRequest } from "next/server";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_API = "https://slack.com/api";

interface SlackRequest {
  type: "channel_activity" | "mentions" | "thread_watch";
  params: {
    channelId?: string;
    channelName?: string;
    userId?: string;
    threadTs?: string;
    limit?: number;
  };
}

// Slack API response types
interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    image_48?: string;
  };
}

interface SlackReaction {
  name: string;
  count: number;
  users?: string[];
}

interface SlackMessage {
  ts: string;
  user?: string;
  text: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: SlackReaction[];
  subtype?: string;
  bot_id?: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private?: boolean;
}

export async function POST(req: NextRequest) {
  if (!SLACK_BOT_TOKEN) {
    return Response.json(
      { error: "SLACK_BOT_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const { type, params }: SlackRequest = await req.json();

    const headers: HeadersInit = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    };

    let data: unknown;
    let ttl = 60000; // Default 1 minute cache

    switch (type) {
      case "channel_activity":
        data = await fetchChannelActivity(params, headers);
        break;
      case "mentions":
        data = await fetchMentions(params, headers);
        ttl = 60000;
        break;
      case "thread_watch":
        data = await fetchThreadReplies(params, headers);
        ttl = 30000; // 30 second cache for threads
        break;
      default:
        return Response.json({ error: "Unknown query type" }, { status: 400 });
    }

    return Response.json({ data, ttl });
  } catch (error) {
    console.error("Slack API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Slack API error" },
      { status: 500 }
    );
  }
}

// Helper to resolve channel name to ID
async function resolveChannelId(
  channelName: string,
  headers: HeadersInit
): Promise<string | undefined> {
  const res = await fetch(`${SLACK_API}/conversations.list?limit=200`, {
    headers,
  });

  if (!res.ok) return undefined;

  const data = await res.json();
  if (!data.ok) return undefined;

  const channel = data.channels?.find(
    (c: SlackChannel) => c.name === channelName.replace(/^#/, "")
  );
  return channel?.id;
}

// Fetch user info for display names
async function fetchUserInfo(
  userId: string,
  headers: HeadersInit
): Promise<SlackUser | null> {
  try {
    const res = await fetch(`${SLACK_API}/users.info?user=${userId}`, {
      headers,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.user : null;
  } catch {
    return null;
  }
}

// Build user cache for batch lookups
async function buildUserCache(
  userIds: string[],
  headers: HeadersInit
): Promise<Map<string, SlackUser>> {
  const cache = new Map<string, SlackUser>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  // Fetch in parallel (up to 10 at a time to avoid rate limits)
  const batches: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += 10) {
    batches.push(uniqueIds.slice(i, i + 10));
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((id) => fetchUserInfo(id, headers))
    );
    results.forEach((user, idx) => {
      if (user) cache.set(batch[idx], user);
    });
  }

  return cache;
}

function getUserDisplayName(user: SlackUser | undefined): string {
  if (!user) return "Unknown";
  return (
    user.profile?.display_name ||
    user.real_name ||
    user.name ||
    "Unknown"
  );
}

async function fetchChannelActivity(
  params: SlackRequest["params"],
  headers: HeadersInit
) {
  let channelId = params.channelId;
  const limit = params.limit ?? 20;

  // Resolve channel name to ID if needed
  if (!channelId && params.channelName) {
    channelId = await resolveChannelId(params.channelName, headers);
    if (!channelId) {
      throw new Error(`Channel not found: ${params.channelName}`);
    }
  }

  if (!channelId) {
    throw new Error("Either channelId or channelName is required");
  }

  const res = await fetch(
    `${SLACK_API}/conversations.history?channel=${channelId}&limit=${limit}`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  const messages: SlackMessage[] = data.messages ?? [];

  // Build user cache for display names
  const userIds = messages.map((m) => m.user).filter(Boolean) as string[];
  const userCache = await buildUserCache(userIds, headers);

  return messages
    .filter((m) => !m.subtype || m.subtype === "bot_message")
    .map((msg) => ({
      ts: msg.ts,
      user: getUserDisplayName(userCache.get(msg.user ?? "")),
      userId: msg.user,
      text: msg.text,
      threadTs: msg.thread_ts,
      replyCount: msg.reply_count ?? 0,
      reactions: msg.reactions?.map((r) => ({
        name: r.name,
        count: r.count,
      })) ?? [],
      timestamp: parseSlackTimestamp(msg.ts),
    }));
}

async function fetchMentions(
  params: SlackRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 10;

  // If no userId provided, get authenticated user
  let userId = params.userId;
  if (!userId) {
    const authRes = await fetch(`${SLACK_API}/auth.test`, { headers });
    const authData = await authRes.json();
    if (!authData.ok) {
      throw new Error("Failed to get authenticated user");
    }
    userId = authData.user_id;
  }

  // Search for messages mentioning the user
  // Note: search.messages requires a user token (xoxp-), not a bot token (xoxb-)
  const query = encodeURIComponent(`<@${userId}>`);
  const res = await fetch(
    `${SLACK_API}/search.messages?query=${query}&count=${limit}&sort=timestamp&sort_dir=desc`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.ok) {
    // Handle the case where bot tokens can't use search API
    if (data.error === "not_allowed_token_type") {
      throw new Error(
        "Mentions feature requires a User OAuth Token (xoxp-). Bot tokens cannot use the search API. " +
        "Use Channel Activity instead, or set up OAuth to get a user token."
      );
    }
    throw new Error(`Slack API error: ${data.error}`);
  }

  const matches = data.messages?.matches ?? [];

  // Build user cache
  const userIds = matches.map((m: { user?: string }) => m.user).filter(Boolean);
  const userCache = await buildUserCache(userIds, headers);

  return matches.map((match: {
    ts: string;
    user?: string;
    text: string;
    channel?: { id: string; name: string };
    permalink?: string;
  }) => ({
    ts: match.ts,
    user: getUserDisplayName(userCache.get(match.user ?? "")),
    userId: match.user,
    text: match.text,
    channel: match.channel?.name ?? "unknown",
    channelId: match.channel?.id,
    permalink: match.permalink,
    timestamp: parseSlackTimestamp(match.ts),
  }));
}

async function fetchThreadReplies(
  params: SlackRequest["params"],
  headers: HeadersInit
) {
  let channelId = params.channelId;
  const threadTs = params.threadTs;

  if (!threadTs) {
    throw new Error("threadTs is required for thread_watch");
  }

  // Resolve channel name to ID if needed
  if (!channelId && params.channelName) {
    channelId = await resolveChannelId(params.channelName, headers);
    if (!channelId) {
      throw new Error(`Channel not found: ${params.channelName}`);
    }
  }

  if (!channelId) {
    throw new Error("Either channelId or channelName is required");
  }

  const res = await fetch(
    `${SLACK_API}/conversations.replies?channel=${channelId}&ts=${threadTs}`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  const messages: SlackMessage[] = data.messages ?? [];

  // Build user cache
  const userIds = messages.map((m) => m.user).filter(Boolean) as string[];
  const userCache = await buildUserCache(userIds, headers);

  // First message is the parent, rest are replies
  const [parent, ...replies] = messages;

  return {
    parent: parent
      ? {
          ts: parent.ts,
          user: getUserDisplayName(userCache.get(parent.user ?? "")),
          userId: parent.user,
          text: parent.text,
          timestamp: parseSlackTimestamp(parent.ts),
        }
      : null,
    replies: replies.map((msg) => ({
      ts: msg.ts,
      user: getUserDisplayName(userCache.get(msg.user ?? "")),
      userId: msg.user,
      text: msg.text,
      reactions: msg.reactions?.map((r) => ({
        name: r.name,
        count: r.count,
      })) ?? [],
      timestamp: parseSlackTimestamp(msg.ts),
    })),
    replyCount: replies.length,
  };
}

// Parse Slack timestamp (e.g., "1234567890.123456") to Unix milliseconds
function parseSlackTimestamp(ts: string): number {
  return Math.floor(parseFloat(ts) * 1000);
}
