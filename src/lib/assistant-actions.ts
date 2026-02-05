import type { AgenticCanvasStore } from "@/store";
import type { CreateComponentPayload, ComponentId } from "@/types";

export type StoreGetter = () => AgenticCanvasStore;

interface AddComponentResult {
  componentId?: ComponentId;
  error?: string;
  assistantMessage?: string;
}

function formatDataFetchError(payload: CreateComponentPayload, message: string): string {
  const rawMessage = message ?? "Data fetch failed";
  const channelName =
    typeof payload.config?.channelName === "string"
      ? payload.config.channelName
      : typeof payload.config?.channel === "string"
        ? payload.config.channel
        : undefined;
  const channelLabel = channelName ? `#${channelName.replace(/^#/, "")}` : "that channel";

  if (/not_in_channel|not a member/i.test(rawMessage)) {
    return `The Slack app isn't a member of ${channelLabel}. Ask the user to invite the app to that channel (e.g., /invite @YourApp) or choose a channel where the app is already present. This is not fixed by changing the channel ID.`;
  }

  if (/channel not found/i.test(rawMessage)) {
    return `I couldn't find ${channelLabel}. Ask the user to confirm the channel name (e.g., #general) or provide a channel ID.`;
  }

  if (/SLACK_BOT_TOKEN not configured/i.test(rawMessage)) {
    return "Slack isn't configured yet. Ask the user to set SLACK_BOT_TOKEN or connect Slack.";
  }

  if (/User OAuth Token|xoxp-/i.test(rawMessage)) {
    return "Slack mentions require a user OAuth token (xoxp-). Ask for that token or use channel activity + a transform with specific channels.";
  }

  if (payload.dataBinding?.source === "slack") {
    return "Slack couldn't fetch data for that channel. Ask the user to confirm the channel exists and that the Slack app has access. If not, invite the app or choose another channel.";
  }

  return rawMessage;
}

function buildAssistantMessage(payload: CreateComponentPayload, errorMessage: string): string {
  const base = errorMessage.replace(/^Action needed:\s*/i, "").trim();

  if (/Slack isn't connected|SLACK_BOT_TOKEN/i.test(base)) {
    return `${base} Do you want to connect Slack now, or use a different data source?`;
  }

  if (/user OAuth token|xoxp/i.test(base)) {
    return `${base} If you'd like me to use channel activity instead, tell me which channels to scan for your mentions.`;
  }

  if (/not a member|invite the app/i.test(base)) {
    return `${base} Which channel should I use instead?`;
  }

  if (/couldn't find|channel not found/i.test(base)) {
    return `${base} Can you confirm the channel name or provide its ID?`;
  }

  if (payload.dataBinding?.source === "slack") {
    return `${base} Can you confirm the channel exists and the Slack app has access?`;
  }

  return base;
}

export async function addComponentWithFetch(
  getState: StoreGetter,
  payload: CreateComponentPayload
): Promise<AddComponentResult> {
  const store = getState();
  const result = store.addComponent(payload);
  const componentId = result.affectedComponentIds?.[0];

  if (!componentId || !payload.dataBinding) {
    return { componentId };
  }

  await store.fetchData(componentId, payload.dataBinding);

  const component = getState().canvas.components.find((c) => c.id === componentId);
  if (component?.dataState.status === "error") {
    const errorMsg = formatDataFetchError(payload, component.dataState.error?.message ?? "Data fetch failed");
    const assistantMessage = buildAssistantMessage(payload, errorMsg);
    store.removeComponent(componentId);
    return { componentId, error: errorMsg, assistantMessage };
  }

  return { componentId };
}
