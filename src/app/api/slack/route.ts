// Slack API Route - fetches real data from Slack
// Keeps token server-side for security

import { NextRequest } from "next/server";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_API = "https://slack.com/api";
const SLACK_USER_MENTION_REGEX = /<@([A-Z0-9]+)>/g;

interface SlackRequest {
  type:
    | "channel_activity"
    | "mentions"
    | "thread_watch"
    | "user_lookup"
    | "user_list"
    | "channel_list";
  params: {
    channelId?: string;
    channelName?: string;
    userId?: string;
    threadTs?: string;
    limit?: number;
    includeThreadReplies?: boolean;
    threadRepliesLimit?: number;
    query?: string;
  };
}

// Slack API response types
interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: {
    display_name?: string;
    image_48?: string;
    email?: string;
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

interface SlackMentionInfo {
  userId: string;
  username?: string;
  displayName?: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private?: boolean;
  is_member?: boolean;
  is_archived?: boolean;
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
      case "user_lookup":
        data = await fetchUsersByQuery(params, headers);
        ttl = 300000;
        break;
      case "user_list":
        data = await fetchUserList(params, headers);
        ttl = 300000;
        break;
      case "channel_list":
        data = await fetchChannelList(params, headers);
        ttl = 300000;
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
  const res = await fetch(
    `${SLACK_API}/conversations.list?limit=200&types=public_channel,private_channel`,
    {
      headers,
    }
  );

  if (!res.ok) return undefined;

  const data = await res.json();
  if (!data.ok) return undefined;

  const channel = data.channels?.find(
    (c: SlackChannel) => c.name === channelName.replace(/^#/, "")
  );
  return channel?.id;
}

async function fetchChannelList(
  params: SlackRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 200;
  const res = await fetch(
    `${SLACK_API}/conversations.list?limit=${limit}&exclude_archived=true&types=public_channel,private_channel`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  const channels: SlackChannel[] = data.channels ?? [];
  return channels
    .filter((channel) => !channel.is_archived)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      isMember: Boolean(channel.is_member),
      isPrivate: Boolean(channel.is_private),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

async function fetchUsersList(
  headers: HeadersInit
): Promise<SlackUser[] | null> {
  try {
    const res = await fetch(`${SLACK_API}/users.list?limit=200`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return data.members ?? [];
  } catch {
    return null;
  }
}

function scoreUserMatch(query: string, user: SlackUser): number {
  const normalized = query.toLowerCase();
  const username = user.name?.toLowerCase() ?? "";
  const displayName = user.profile?.display_name?.toLowerCase() ?? "";
  const realName = user.real_name?.toLowerCase() ?? "";
  const email = user.profile?.email?.toLowerCase() ?? "";

  if (username === normalized) return 100;
  if (displayName === normalized || realName === normalized) return 90;
  if (username.startsWith(normalized)) return 70;
  if (displayName.startsWith(normalized) || realName.startsWith(normalized)) return 60;
  if (username.includes(normalized)) return 50;
  if (displayName.includes(normalized) || realName.includes(normalized)) return 40;
  if (email && email.startsWith(normalized)) return 30;
  return 0;
}

// Build user cache for batch lookups
async function buildUserCache(
  userIds: string[],
  headers: HeadersInit
): Promise<Map<string, SlackUser>> {
  const cache = new Map<string, SlackUser>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const missing = new Set(uniqueIds);

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
      if (user) {
        cache.set(batch[idx], user);
        missing.delete(batch[idx]);
      }
    });
  }

  if (missing.size > 0) {
    const users = await fetchUsersList(headers);
    if (users) {
      users.forEach((user) => {
        if (missing.has(user.id)) {
          cache.set(user.id, user);
          missing.delete(user.id);
        }
      });
    }
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

function extractMentionIds(text: string | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(SLACK_USER_MENTION_REGEX)]
    .map((match) => match[1])
    .filter(Boolean);
}

function buildMentionMetadata(
  text: string | undefined,
  userCache: Map<string, SlackUser>
): SlackMentionInfo[] {
  const ids = extractMentionIds(text);
  const uniqueIds = [...new Set(ids)];

  return uniqueIds.map((id) => {
    const user = userCache.get(id);
    return {
      userId: id,
      username: user?.name,
      displayName: user ? getUserDisplayName(user) : undefined,
    };
  });
}

function replaceMentionsWithNames(
  text: string,
  userCache: Map<string, SlackUser>
): string {
  return text.replace(SLACK_USER_MENTION_REGEX, (_, id) => {
    const user = userCache.get(id);
    if (!user) return `<@${id}>`;
    const name = getUserDisplayName(user);
    return name && name !== "Unknown" ? `@${name}` : `<@${id}>`;
  });
}

async function fetchThreadReplyMessages(
  channelId: string,
  threadTs: string,
  limit: number | undefined,
  headers: HeadersInit
): Promise<SlackMessage[]> {
  try {
    const limitParam = limit ? `&limit=${limit}` : "";
    const res = await fetch(
      `${SLACK_API}/conversations.replies?channel=${channelId}&ts=${threadTs}${limitParam}`,
      { headers }
    );

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.ok) return [];

    const messages: SlackMessage[] = data.messages ?? [];
    // First message is the parent, rest are replies
    return messages.filter((msg) => msg.ts !== threadTs);
  } catch {
    return [];
  }
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
    if (data.error === "not_in_channel") {
      const channelLabel = params.channelName ? `#${params.channelName.replace(/^#/, "")}` : "the channel";
      throw new Error(
        `Slack bot is not a member of ${channelLabel}. Invite the app to the channel or choose another channel.`
      );
    }
    throw new Error(`Slack API error: ${data.error}`);
  }

  const messages: SlackMessage[] = data.messages ?? [];
  const includeThreadReplies = Boolean(params.includeThreadReplies);
  const threadRepliesLimit = params.threadRepliesLimit ?? 20;

  let expandedMessages = messages;

  if (includeThreadReplies) {
    const parents = messages.filter((m) => (m.reply_count ?? 0) > 0);
    const repliesByParent = new Map<string, SlackMessage[]>();

    for (const parent of parents) {
      const replies = await fetchThreadReplyMessages(
        channelId,
        parent.ts,
        threadRepliesLimit,
        headers
      );
      if (replies.length > 0) {
        repliesByParent.set(parent.ts, replies);
      }
    }

    expandedMessages = messages.flatMap((msg) => [
      msg,
      ...(repliesByParent.get(msg.ts) ?? []),
    ]);
  }

  const seen = new Set<string>();
  const dedupedMessages = expandedMessages.filter((msg) => {
    if (seen.has(msg.ts)) return false;
    seen.add(msg.ts);
    return true;
  });

  // Build user cache for display names (authors + mentions)
  const userIds = dedupedMessages.map((m) => m.user).filter(Boolean) as string[];
  const mentionIds = dedupedMessages.flatMap((m) => extractMentionIds(m.text));
  const lookupIds = [...userIds, ...mentionIds];
  const userCache = await buildUserCache(lookupIds, headers);

  return dedupedMessages
    .filter((m) => !m.subtype || m.subtype === "bot_message")
    .map((msg) => ({
      ts: msg.ts,
      user: getUserDisplayName(userCache.get(msg.user ?? "")),
      userId: msg.user,
      text: replaceMentionsWithNames(msg.text, userCache),
      mentions: buildMentionMetadata(msg.text, userCache),
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

async function fetchUsersByQuery(
  params: SlackRequest["params"],
  headers: HeadersInit
) {
  const query = params.query?.trim();
  const limit = params.limit ?? 5;

  if (!query) {
    throw new Error("User lookup requires a query string.");
  }

  const res = await fetch(`${SLACK_API}/users.list?limit=200`, { headers });
  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.ok) {
    if (data.error === "missing_scope") {
      throw new Error("Slack user lookup requires the users:read scope.");
    }
    if (data.error === "not_allowed_token_type") {
      throw new Error("Slack user lookup requires a token with users:read scope.");
    }
    throw new Error(`Slack API error: ${data.error}`);
  }

  const members: SlackUser[] = data.members ?? [];
  const normalizedQuery = query.replace(/^@/, "").toLowerCase();

  return members
    .filter((user) => !user.deleted)
    .map((user) => ({
      user,
      score: scoreUserMatch(normalizedQuery, user),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ user }) => {
      const displayName = getUserDisplayName(user);
      return {
        userId: user.id,
        username: user.name,
        displayName: displayName !== "Unknown" ? displayName : undefined,
      };
    });
}

async function fetchUserList(
  params: SlackRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 30;
  const res = await fetch(`${SLACK_API}/users.list?limit=200`, { headers });
  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.ok) {
    if (data.error === "missing_scope") {
      throw new Error("Slack user lookup requires the users:read scope.");
    }
    if (data.error === "not_allowed_token_type") {
      throw new Error("Slack user lookup requires a token with users:read scope.");
    }
    throw new Error(`Slack API error: ${data.error}`);
  }

  const members: SlackUser[] = data.members ?? [];

  return members
    .filter((user) => !user.deleted && !user.is_bot)
    .map((user) => ({
      userId: user.id,
      username: user.name,
      displayName: getUserDisplayName(user) !== "Unknown" ? getUserDisplayName(user) : undefined,
    }))
    .sort((a, b) => {
      const left = (a.displayName || a.username || "").toLowerCase();
      const right = (b.displayName || b.username || "").toLowerCase();
      return left.localeCompare(right);
    })
    .slice(0, limit);
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
    if (data.error === "not_in_channel") {
      const channelLabel = params.channelName ? `#${params.channelName.replace(/^#/, "")}` : "the channel";
      throw new Error(
        `Slack bot is not a member of ${channelLabel}. Invite the app to the channel or choose another channel.`
      );
    }
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
