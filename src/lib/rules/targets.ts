import type { DataBinding } from "@/types";
import type { RuleTarget } from "./types";

export function resolveRuleTargetForBinding(binding: DataBinding): RuleTarget | null {
  const queryType = binding.query?.type;
  if (!queryType) return null;

  if (binding.source === "slack") {
    if (queryType === "mentions") return "slack.mentions";
    if (queryType === "channel_activity") return "slack.channel_activity";
  }

  if (binding.source === "vercel") {
    if (queryType === "deployments") return "vercel.deployments";
  }

  if (binding.source === "github" || binding.source === "mock-github") {
    if (queryType === "pull_requests") return "github.prs";
    if (queryType === "issues") return "github.issues";
  }

  return null;
}
