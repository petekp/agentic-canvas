export type ComponentConfig = Record<string, unknown> | undefined;

export interface ComponentConfigContext {
  lastUserMessage?: string | null;
}

const SLACK_CHANNEL_LINK_REGEX = /<#([CG][A-Z0-9]{8,})\|([^>]+)>/;
const SLACK_CHANNEL_ID_REGEX = /\b[CG][A-Z0-9]{8,}\b/;
const SLACK_CHANNEL_NAME_REGEX = /#([a-z0-9][a-z0-9_-]{0,78})/gi;
const SLACK_CHANNEL_NAME_ONLY_REGEX = /^#?([a-z0-9][a-z0-9_-]{0,78})$/i;
const SLACK_USER_LINK_REGEX = /<@([UW][A-Z0-9]{8,})(?:\|[^>]+)?>/;
const SLACK_USER_ID_REGEX = /\b[UW][A-Z0-9]{8,}\b/;
const SLACK_USER_HANDLE_REGEX = /@([a-z0-9][a-z0-9._-]{0,80})/gi;
const SLACK_USER_SPECIAL_HANDLES = new Set(["here", "channel", "everyone"]);

function sanitizeChannelName(value: string): string {
  return value.replace(/^#/, "").trim();
}

function sanitizeUserQuery(value: string): string {
  return value.replace(/^@/, "").trim();
}

function isSlackUserId(value: string): boolean {
  return SLACK_USER_ID_REGEX.test(value);
}

export function inferSlackChannelFromText(
  text: string | null | undefined
): { channelId?: string; channelName?: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const linkMatch = trimmed.match(SLACK_CHANNEL_LINK_REGEX);
  if (linkMatch) {
    return {
      channelId: linkMatch[1],
      channelName: sanitizeChannelName(linkMatch[2]),
    };
  }

  const nameMatches = [...trimmed.matchAll(SLACK_CHANNEL_NAME_REGEX)];
  if (nameMatches.length > 0) {
    return { channelName: sanitizeChannelName(nameMatches[0][1]) };
  }

  const idMatch = trimmed.match(SLACK_CHANNEL_ID_REGEX);
  if (idMatch) {
    return { channelId: idMatch[0] };
  }

  const nameOnlyMatch = trimmed.match(SLACK_CHANNEL_NAME_ONLY_REGEX);
  if (nameOnlyMatch) {
    return { channelName: sanitizeChannelName(nameOnlyMatch[1]) };
  }

  return null;
}

export function inferSlackUserFromText(
  text: string | null | undefined
): { userId?: string; userQuery?: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const linkMatch = trimmed.match(SLACK_USER_LINK_REGEX);
  if (linkMatch) {
    return { userId: linkMatch[1] };
  }

  const idMatch = trimmed.match(SLACK_USER_ID_REGEX);
  if (idMatch) {
    return { userId: idMatch[0] };
  }

  const handleMatches = [...trimmed.matchAll(SLACK_USER_HANDLE_REGEX)];
  for (const match of handleMatches) {
    const handle = sanitizeUserQuery(match[1]);
    if (!handle || SLACK_USER_SPECIAL_HANDLES.has(handle.toLowerCase())) continue;
    return { userQuery: handle };
  }

  return null;
}

export function normalizeComponentConfig(
  typeId: string,
  config?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!config) return config;
  const normalized = { ...config };

  if (
    typeId === "slack.channel-activity" ||
    typeId === "slack.thread-watch"
  ) {
    if (normalized.channelName === undefined) {
      if (typeof normalized.channel_name === "string") {
        normalized.channelName = normalized.channel_name;
      } else if (typeof normalized.channel === "string") {
        normalized.channelName = normalized.channel;
      }
    }

    if (normalized.channelId === undefined && typeof normalized.channel_id === "string") {
      normalized.channelId = normalized.channel_id;
    }

    if (typeof normalized.channelName === "string") {
      normalized.channelName = sanitizeChannelName(normalized.channelName);
    }

    if (typeId === "slack.channel-activity") {
      if (normalized.includeThreadReplies === undefined) {
        if (typeof normalized.include_thread_replies === "boolean") {
          normalized.includeThreadReplies = normalized.include_thread_replies;
        } else if (typeof normalized.include_thread_replies === "string") {
          normalized.includeThreadReplies =
            normalized.include_thread_replies.toLowerCase() === "true";
        }
      }

      if (normalized.threadRepliesLimit === undefined) {
        if (typeof normalized.thread_replies_limit === "number") {
          normalized.threadRepliesLimit = normalized.thread_replies_limit;
        } else if (typeof normalized.thread_replies_limit === "string") {
          const parsed = Number(normalized.thread_replies_limit);
          if (!Number.isNaN(parsed)) normalized.threadRepliesLimit = parsed;
        }
      }
    }
  }

  if (typeId === "slack.mentions") {
    if (normalized.userId === undefined && typeof normalized.user_id === "string") {
      normalized.userId = normalized.user_id;
    }

    if (normalized.userQuery === undefined) {
      if (typeof normalized.username === "string") {
        normalized.userQuery = normalized.username;
      } else if (typeof normalized.user === "string") {
        normalized.userQuery = normalized.user;
      } else if (typeof normalized.handle === "string") {
        normalized.userQuery = normalized.handle;
      }
    }

    if (typeof normalized.userQuery === "string") {
      const cleaned = sanitizeUserQuery(normalized.userQuery);
      normalized.userQuery = cleaned;
      if (normalized.userId === undefined && isSlackUserId(cleaned)) {
        normalized.userId = cleaned;
      }
    }
  }

  return normalized;
}

export function resolveComponentConfig(
  typeId: string,
  config?: Record<string, unknown>,
  context?: ComponentConfigContext
): Record<string, unknown> | undefined {
  const normalized = normalizeComponentConfig(typeId, config);

  if (
    (typeId === "slack.channel-activity" || typeId === "slack.thread-watch") &&
    !(normalized?.channelId || normalized?.channelName)
  ) {
    const inferred = inferSlackChannelFromText(context?.lastUserMessage ?? "");
    if (inferred) {
      return {
        ...(normalized ?? {}),
        ...inferred,
      };
    }
  }

  if (typeId === "slack.mentions" && !(normalized?.userId || normalized?.userQuery)) {
    const inferred = inferSlackUserFromText(context?.lastUserMessage ?? "");
    if (inferred) {
      return {
        ...(normalized ?? {}),
        ...inferred,
      };
    }
  }

  return normalized;
}
