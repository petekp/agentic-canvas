export interface IntegrationStatus {
  slack: { bot: boolean; user: boolean };
  posthog: boolean;
  vercel: boolean;
  github: boolean;
}

const CACHE_TTL_MS = 30000;
let cachedStatus: IntegrationStatus | null = null;
let cachedAt = 0;

export function resetIntegrationStatusCache() {
  cachedStatus = null;
  cachedAt = 0;
}

async function fetchIntegrationStatus(): Promise<IntegrationStatus> {
  const res = await fetch("/api/integrations", { method: "GET" });
  if (!res.ok) {
    throw new Error(
      "Action needed: Integration status is unavailable. Ask the user to retry in a moment."
    );
  }
  return res.json();
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const now = Date.now();
  if (cachedStatus && now - cachedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }
  const status = await fetchIntegrationStatus();
  cachedStatus = status;
  cachedAt = now;
  return status;
}

function getRequirement(typeId: string): "slack-bot" | "slack-user" | "posthog" | "vercel" | "github" | null {
  if (typeId.startsWith("posthog.")) return "posthog";
  if (typeId.startsWith("vercel.")) return "vercel";
  if (typeId.startsWith("github.")) return "github";
  if (typeId === "slack.mentions") return "slack-user";
  if (typeId.startsWith("slack.")) return "slack-bot";
  return null;
}

export async function assertIntegrationAvailable(typeId: string): Promise<void> {
  const requirement = getRequirement(typeId);
  if (!requirement) return;

  const status = await getIntegrationStatus();

  if (requirement === "slack-bot" && !status.slack.bot) {
    throw new Error(
      "Slack isn't connected yet. Do you want to connect Slack now, or use a different data source?"
    );
  }

  if (requirement === "slack-user" && !status.slack.user) {
    throw new Error(
      "Slack mentions require a user OAuth token (xoxp-). Do you have one, or should I use channel activity for specific channels?"
    );
  }

  if (requirement === "posthog" && !status.posthog) {
    throw new Error(
      "PostHog isn't connected yet. Do you want to connect PostHog now?"
    );
  }

  if (requirement === "vercel" && !status.vercel) {
    throw new Error(
      "Vercel isn't connected yet. Do you want to connect Vercel now?"
    );
  }

  if (requirement === "github" && !status.github) {
    throw new Error(
      "GitHub isn't connected yet. Do you want to connect GitHub now?"
    );
  }
}
