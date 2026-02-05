export const DEFAULT_SLACK_MENTIONS_LIMIT = 100;

export function applySlackMentionsChannelActivityDefaults(
  config: Record<string, unknown> | undefined
): Record<string, unknown> {
  const next = { ...(config ?? {}) };

  if (next.includeThreadReplies === undefined) {
    next.includeThreadReplies = true;
  }

  if (next.limit === undefined) {
    next.limit = DEFAULT_SLACK_MENTIONS_LIMIT;
  }

  return next;
}

