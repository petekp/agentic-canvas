import {
  inferSlackChannelFromText,
  inferSlackUserFromText,
  normalizeComponentConfig,
} from "@/lib/component-config";

type Config = Record<string, unknown> | undefined;

const GITHUB_USERNAME_REGEX =
  /\b(?:activity|events?|feed)[^.!?\n]{0,60}\b(?:by|from|for)\s+@?([a-z\d](?:[a-z\d-]{0,37}))/i;
const LIMIT_REGEX = /\blimit\b\s*(?:to|=|:)?\s*(\d{1,3})\b/i;

function inferGitHubUsernameFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(GITHUB_USERNAME_REGEX);
  const username = match?.[1]?.trim();
  return username ? username : null;
}

function inferLimitFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(LIMIT_REGEX);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveConfigFromChat(
  typeId: string,
  config: Config,
  lastUserMessage?: string | null
): Config {
  const normalized = normalizeComponentConfig(typeId, config);
  let resolved = normalized;

  if (typeId === "slack.channel-activity" || typeId === "slack.thread-watch") {
    const hasChannel = resolved?.channelId !== undefined || resolved?.channelName !== undefined;
    if (!hasChannel && lastUserMessage) {
      const inferred = inferSlackChannelFromText(lastUserMessage);
      if (inferred?.channelId || inferred?.channelName) {
        resolved = { ...(resolved ?? {}), ...inferred };
      }
    }

    if (typeId === "slack.channel-activity") {
      const hasLimit = resolved?.limit !== undefined;
      if (!hasLimit && lastUserMessage) {
        const inferredLimit = inferLimitFromText(lastUserMessage);
        if (inferredLimit !== null) {
          resolved = { ...(resolved ?? {}), limit: inferredLimit };
        }
      }
    }
  }

  if (typeId === "slack.mentions") {
    const hasUser = resolved?.userId !== undefined || resolved?.userQuery !== undefined;
    if (!hasUser && lastUserMessage) {
      const inferred = inferSlackUserFromText(lastUserMessage);
      if (inferred?.userId || inferred?.userQuery) {
        resolved = { ...(resolved ?? {}), ...inferred };
      }
    }
  }

  if (typeId === "github.activity-timeline") {
    const hasUsername = resolved?.username !== undefined;
    if (!hasUsername && lastUserMessage) {
      const inferredUsername = inferGitHubUsernameFromText(lastUserMessage);
      if (inferredUsername) {
        resolved = { ...(resolved ?? {}), username: inferredUsername };
      }
    }
  }

  return resolved;
}
