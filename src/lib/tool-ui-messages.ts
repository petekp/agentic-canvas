type ToolResultRecord = Record<string, unknown>;

export function getToolMissingFields(result?: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const record = result as ToolResultRecord;
  if (record.success !== false) return [];
  const missingFields = Array.isArray(record.missingFields)
    ? (record.missingFields as string[])
    : [];
  return missingFields.filter((field) => typeof field === "string");
}

export function formatToolErrorMessage(result?: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as ToolResultRecord;
  if (record.success === false) {
    const missingFields = getToolMissingFields(record);
    if (missingFields.length > 0) {
      if (missingFields.includes("channelId") || missingFields.includes("channelName")) {
        return "Which Slack channel should I use? (e.g. #general)";
      }
      if (missingFields.includes("userId") || missingFields.includes("userQuery")) {
        return "Which Slack user should I use?";
      }
      if (missingFields.includes("threadTs")) {
        return "Which Slack thread should I watch? Share the thread link or timestamp, plus the channel.";
      }
      return `I still need ${missingFields.join(", ")} to continue.`;
    }

    const rawAction = typeof record.action === "string" ? record.action : null;
    const rawAssistant = typeof record.assistantMessage === "string" ? record.assistantMessage : null;
    const rawError = typeof record.error === "string" ? record.error : null;

    const sanitized = (value: string | null) =>
      value
        ? value
            .replace(/^Action needed:\s*/i, "")
            .replace(/\bAsk the user\b/gi, "Please")
        : null;

    const action = sanitized(rawAction);
    const assistantMessage = sanitized(rawAssistant);
    const error = sanitized(rawError);

    if (action) return action;
    if (assistantMessage && assistantMessage !== error) return assistantMessage;
    if (error) return error;

    return "I couldn't complete that request. What should I try instead?";
  }

  return null;
}

export function isSlackChannelMissing(result: unknown): boolean {
  const missingFields = getToolMissingFields(result);
  return missingFields.some((field) => field === "channelId" || field === "channelName");
}

export type ToolDisplayMessage = {
  tone: "prompt" | "error";
  message: string;
};

export function formatAddFilteredComponentToolMessage({
  result,
  mentionIntent,
  hasMentionsUser,
}: {
  result?: unknown;
  mentionIntent: boolean;
  hasMentionsUser: boolean;
}): ToolDisplayMessage | null {
  const channelMissing = result ? isSlackChannelMissing(result) : false;

  if (mentionIntent && channelMissing) {
    if (!hasMentionsUser) {
      return {
        tone: "prompt",
        message: "Select the Slack user whose mentions you want to see.",
      };
    }
    return {
      tone: "prompt",
      message:
        'Select one or more Slack channels to check (or choose "All available channels"). ' +
        "If you don't see a channel, invite the Slack app to it and try again.",
    };
  }

  const errorMessage = formatToolErrorMessage(result);
  if (!errorMessage) return null;
  return { tone: "error", message: errorMessage };
}
