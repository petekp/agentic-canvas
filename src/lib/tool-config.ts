import {
  inferSlackChannelFromText,
  inferSlackUserFromText,
  normalizeComponentConfig,
} from "@/lib/component-config";

type Config = Record<string, unknown> | undefined;

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

  return normalized;
}
