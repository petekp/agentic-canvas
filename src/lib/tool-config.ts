import {
  inferSlackChannelFromText,
  inferSlackUserFromText,
  normalizeComponentConfig,
} from "@/lib/component-config";

type Config = Record<string, unknown> | undefined;

const GITHUB_USERNAME_REGEX =
  /\b(?:activity|events?|feed)[^.!?\n]{0,60}\b(?:by|from|for)\s+@?([a-z\d](?:[a-z\d-]{0,37}))/i;

function inferGitHubUsernameFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(GITHUB_USERNAME_REGEX);
  const username = match?.[1]?.trim();
  return username ? username : null;
}

export function resolveConfigFromChat(
  typeId: string,
  config: Config,
  lastUserMessage?: string | null
): Config {
  const normalized = normalizeComponentConfig(typeId, config);

  if (typeId === "slack.channel-activity" || typeId === "slack.thread-watch") {
    const hasChannel = normalized?.channelId !== undefined || normalized?.channelName !== undefined;
    if (!hasChannel && lastUserMessage) {
      const inferred = inferSlackChannelFromText(lastUserMessage);
      if (inferred?.channelId || inferred?.channelName) {
        return { ...(normalized ?? {}), ...inferred };
      }
    }
  }

  if (typeId === "slack.mentions") {
    const hasUser = normalized?.userId !== undefined || normalized?.userQuery !== undefined;
    if (!hasUser && lastUserMessage) {
      const inferred = inferSlackUserFromText(lastUserMessage);
      if (inferred?.userId || inferred?.userQuery) {
        return { ...(normalized ?? {}), ...inferred };
      }
    }
  }

  if (typeId === "github.activity-timeline") {
    const hasUsername = normalized?.username !== undefined;
    if (!hasUsername && lastUserMessage) {
      const inferredUsername = inferGitHubUsernameFromText(lastUserMessage);
      if (inferredUsername) {
        return { ...(normalized ?? {}), username: inferredUsername };
      }
    }
  }

  return normalized;
}
