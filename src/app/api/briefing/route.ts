// briefing/route.ts
//
// Aggregates signals across GitHub, Slack, and Vercel for the Morning Briefing.
// Returns BriefingRecommendationsData to power the recommendations tile.

import { NextRequest } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { appendTelemetry } from "@/lib/telemetry";
import type {
  BriefingRecommendationsData,
  IssueData,
  PRData,
  SlackMentionData,
  SlackMessageData,
  TeamActivityData,
  VercelDeploymentData,
} from "@/components/canvas/renderers/types";

interface BriefingRequest {
  since?: number;
  repos?: string[];
  slackUserId?: string;
  slackChannels?: Array<{ id: string; name: string }>;
  vercelProjectId?: string;
  vercelTeamId?: string;
  generateNarrative?: boolean;
}

interface InternalResponse<T> {
  data: T;
  ttl: number;
}

interface RepoPayload<T> {
  repo: string;
  data: T;
  ttl: number;
}

interface NarrativeItem {
  icon: "pr" | "issue" | "deploy" | "slack" | "alert";
  text: string;
  priority: "high" | "medium" | "low";
  actionUrl?: string;
}

interface NarrativeResponse {
  summary?: string;
  items?: NarrativeItem[];
}

const DEFAULT_TTL = 300000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPOS = 5;
const MAX_SECTION_ITEMS = 4;
const MAX_NARRATIVE_ITEMS = 4;
const NARRATIVE_MODEL = "gpt-5.2";

const NARRATIVE_SYSTEM_PROMPT = `You are an AI chief of staff preparing a concise morning briefing.

Return ONLY a JSON object with this shape:
{
  "summary": "1-2 sentence narrative recap of the most important updates",
  "items": [
    {
      "icon": "pr|issue|deploy|slack|alert",
      "text": "Actionable recommendation or cross-source insight",
      "priority": "high|medium|low",
      "actionUrl": "optional URL"
    }
  ]
}

Rules:
- summary must be concise and specific.
- items should be 1-4 max, action-oriented, and highlight cross-source correlations when possible.
- If there are no clear actions, return an empty items array.
- No markdown, no extra keys.`;

export async function POST(req: NextRequest) {
  try {
    const body: BriefingRequest = await req.json();
    const now = Date.now();
    const since =
      typeof body.since === "number" && Number.isFinite(body.since)
        ? body.since
        : now - DAY_MS;

    const repos = Array.isArray(body.repos) ? body.repos.filter(Boolean) : [];
    const reposToFetch = repos.slice(0, MAX_REPOS);
    const primaryRepo = reposToFetch[0];
    const slackUserId = body.slackUserId?.trim();
    const slackChannels = Array.isArray(body.slackChannels)
      ? body.slackChannels.filter((channel) => channel?.id)
      : [];
    const vercelProjectId = body.vercelProjectId?.trim();
    const vercelTeamId = body.vercelTeamId?.trim();

    await appendTelemetry({
      level: "info",
      source: "api.briefing",
      event: "request",
      data: {
        since,
        repoCount: reposToFetch.length,
        repos: reposToFetch,
        slackUserId,
        slackChannels: slackChannels.map((channel) => channel.id),
        vercelProjectId,
        vercelTeamId,
        generateNarrative: body.generateNarrative !== false,
      },
    });

    const origin = new URL(req.url).origin;
    const ttlCandidates: number[] = [DEFAULT_TTL];
    const errors: string[] = [];

    const repoPrTasks = reposToFetch.map((repo) =>
      postInternal<PRData[]>(`${origin}/api/github`, {
        type: "pull_requests",
        params: {
          repo,
          state: "open",
          filter: "review_requested",
          limit: 10,
        },
      }).then((result) => ({ repo, data: result.data, ttl: result.ttl }))
    );

    const repoIssueTasks = reposToFetch.map((repo) =>
      postInternal<IssueData[]>(`${origin}/api/github`, {
        type: "issues",
        params: {
          repo,
          state: "open",
          limit: 10,
        },
      }).then((result) => ({ repo, data: result.data, ttl: result.ttl }))
    );

    const repoPrResults: RepoPayload<PRData[]>[] = [];
    const repoIssueResults: RepoPayload<IssueData[]>[] = [];

    const prSettled = await Promise.allSettled(repoPrTasks);
    prSettled.forEach((result, index) => {
      const repo = reposToFetch[index];
      if (result.status === "fulfilled") {
        repoPrResults.push(result.value);
        ttlCandidates.push(result.value.ttl);
      } else if (repo) {
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : `Failed to load PRs for ${repo}`
        );
      }
    });

    const issueSettled = await Promise.allSettled(repoIssueTasks);
    issueSettled.forEach((result, index) => {
      const repo = reposToFetch[index];
      if (result.status === "fulfilled") {
        repoIssueResults.push(result.value);
        ttlCandidates.push(result.value.ttl);
      } else if (repo) {
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : `Failed to load issues for ${repo}`
        );
      }
    });

    let teamActivity: TeamActivityData | undefined;
    if (primaryRepo) {
      const teamResult = await Promise.allSettled([
        postInternal<TeamActivityData>(`${origin}/api/github`, {
          type: "team_activity",
          params: {
            repo: primaryRepo,
            timeWindow: deriveTimeWindow(since, now),
          },
        }),
      ]);
      const result = teamResult[0];
      if (result.status === "fulfilled") {
        teamActivity = result.value.data;
        ttlCandidates.push(result.value.ttl);
      } else {
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : `Failed to load team activity for ${primaryRepo}`
        );
      }
    }

    let slackMentions: SlackMentionData[] = [];
    let slackChannelActivity: SlackMessageData[] = [];
    if (slackUserId) {
      const mentionResult = await Promise.allSettled([
        postInternal<SlackMentionData[]>(`${origin}/api/slack`, {
          type: "mentions",
          params: { userId: slackUserId, limit: 10 },
        }),
      ]);
      const result = mentionResult[0];
      if (result.status === "fulfilled") {
        slackMentions = result.value.data;
        ttlCandidates.push(result.value.ttl);
      } else {
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : "Failed to load Slack mentions"
        );
      }
    } else if (slackChannels.length > 0) {
      const firstChannel = slackChannels[0];
      const activityResult = await Promise.allSettled([
        postInternal<SlackMessageData[]>(`${origin}/api/slack`, {
          type: "channel_activity",
          params: { channelId: firstChannel.id, limit: 12 },
        }),
      ]);
      const result = activityResult[0];
      if (result.status === "fulfilled") {
        slackChannelActivity = result.value.data;
        ttlCandidates.push(result.value.ttl);
      } else {
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : "Failed to load Slack channel activity"
        );
      }
    }

    let deployments: VercelDeploymentData[] = [];
    if (vercelProjectId) {
      const deploymentsResult = await Promise.allSettled([
        postInternal<VercelDeploymentData[]>(`${origin}/api/vercel`, {
          type: "deployments",
          params: { projectId: vercelProjectId, teamId: vercelTeamId, limit: 10 },
        }),
      ]);
      const result = deploymentsResult[0];
      if (result.status === "fulfilled") {
        deployments = result.value.data;
        ttlCandidates.push(result.value.ttl);
      } else {
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : "Failed to load Vercel deployments"
        );
      }
    }

    const ttl = Math.min(...ttlCandidates.filter((value) => Number.isFinite(value)));

    const allPrs = repoPrResults.flatMap(({ repo, data }) =>
      data.map((pr) => ({ ...pr, repo }))
    );
    const allIssues = repoIssueResults.flatMap(({ repo, data }) =>
      data.map((issue) => ({ ...issue, repo }))
    );

    const prsSince = allPrs.filter((pr) => (pr.updatedAt ?? pr.createdAt) >= since);
    const issuesSince = allIssues.filter((issue) => issue.createdAt >= since);

    const prItems = prsSince
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, MAX_SECTION_ITEMS)
      .map((pr) => ({
        icon: "pr" as const,
        text: `#${pr.number} ${pr.title} (${formatRepoLabel(pr.repo)})`,
        priority: priorityFromLabels(pr.labels, "medium"),
        actionUrl: `https://github.com/${pr.repo}/pull/${pr.number}`,
      }));

    const issueItems = issuesSince
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_SECTION_ITEMS)
      .map((issue) => ({
        icon: "issue" as const,
        text: `#${issue.number} ${issue.title} (${formatRepoLabel(issue.repo)})`,
        priority: priorityFromLabels(issue.labels, "medium"),
        actionUrl: `https://github.com/${issue.repo}/issues/${issue.number}`,
      }));

    const deploymentsSince = deployments.filter((deployment) => deployment.createdAt >= since);
    const deploymentItems = deploymentsSince
      .slice(0, MAX_SECTION_ITEMS)
      .map((deployment) => ({
        icon: "deploy" as const,
        text: formatDeploymentText(deployment),
        priority: priorityFromDeployment(deployment.state),
        actionUrl: deployment.inspectorUrl ?? deployment.url ?? undefined,
      }));

    const slackMentionsSince = slackMentions.filter((mention) => mention.timestamp >= since);
    const slackItems = slackMentionsSince
      .slice(0, MAX_SECTION_ITEMS)
      .map((mention) => ({
        icon: "slack" as const,
        text: formatSlackMention(mention),
        priority: "medium" as const,
        actionUrl: mention.permalink,
      }));

    const channelActivitySince = slackChannelActivity.filter(
      (message) => message.timestamp >= since
    );
    const channelItems = channelActivitySince
      .slice(0, 3)
      .map((message) => ({
        icon: "slack" as const,
        text: formatSlackMessage(message),
        priority: "low" as const,
      }));

    const slackCombined = slackItems.length > 0 ? slackItems : channelItems;

    const sections: BriefingRecommendationsData["sections"] = [];
    if (prItems.length > 0) {
      sections.push({ title: "PRs Needing Review", items: prItems });
    }
    if (issueItems.length > 0) {
      sections.push({ title: "New Issues", items: issueItems });
    }
    if (deploymentItems.length > 0) {
      sections.push({ title: "Deployments", items: deploymentItems });
    }
    if (slackCombined.length > 0) {
      sections.push({ title: "Slack Mentions", items: slackCombined });
    }

    if (teamActivity && teamActivity.totalCommits > 0) {
      const topContributor = teamActivity.contributors[0];
      const repoLabel = primaryRepo ? formatRepoLabel(primaryRepo) : "your repo";
      const text = topContributor
        ? `${repoLabel}: ${teamActivity.totalCommits} commits. Top contributor: ${topContributor.login}.`
        : `${repoLabel}: ${teamActivity.totalCommits} commits in the last ${teamActivity.timeWindow}.`;
      sections.push({
        title: "Team Activity",
        items: [
          {
            icon: "alert" as const,
            text,
            priority: "low" as const,
            actionUrl: primaryRepo ? `https://github.com/${primaryRepo}` : undefined,
          },
        ],
      });
    }

    if (errors.length > 0) {
      sections.push({
        title: "Integrations",
        items: errors.slice(0, 3).map((message) => ({
          icon: "alert" as const,
          text: message,
          priority: "low" as const,
        })),
      });
    }

    const summaryBase = buildSummary({
      prCount: prsSince.length,
      issueCount: issuesSince.length,
      deploymentCount: deploymentsSince.length,
      slackCount: slackMentionsSince.length > 0 ? slackMentionsSince.length : channelActivitySince.length,
      repoCount: reposToFetch.length,
    });

    let summary = summaryBase;

    if (body.generateNarrative !== false && process.env.OPENAI_API_KEY) {
      const repoStats = reposToFetch.map((repo) => ({
        repo,
        prs: prsSince.filter((pr) => pr.repo === repo).length,
        issues: issuesSince.filter((issue) => issue.repo === repo).length,
      }));
      const derivedSignals = buildDerivedSignals({
        prs: prsSince.length,
        issues: issuesSince.length,
        deployments: deploymentsSince,
        slack: slackMentionsSince.length + channelActivitySince.length,
        repoStats,
      });

      const narrative = await generateNarrative({
        since,
        repos: reposToFetch,
        summary: summaryBase,
        repoStats,
        topPrs: prItems.slice(0, 3),
        topIssues: issueItems.slice(0, 3),
        deployments: deploymentItems.slice(0, 3),
        slack: slackCombined.slice(0, 3),
        signals: derivedSignals,
      });

      if (narrative?.summary) {
        summary = narrative.summary;
      }

      if (narrative?.items && narrative.items.length > 0) {
        sections.unshift({
          title: "AI Recommendations",
          items: narrative.items,
        });
      }
    }

    const response: BriefingRecommendationsData = {
      summary,
      sinceLabel: formatSinceLabel(since),
      sections,
      generatedAt: now,
    };

    await appendTelemetry({
      level: "info",
      source: "api.briefing",
      event: "response",
      data: {
        sectionCount: sections.length,
        summary,
        errors: errors.length,
        ttl,
      },
    });

    return Response.json(
      {
        data: response,
        ttl,
        ...(errors.length > 0 ? { errors } : {}),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Briefing API error:", error);
    await appendTelemetry({
      level: "error",
      source: "api.briefing",
      event: "error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Briefing API error" },
      { status: 500 }
    );
  }
}

async function postInternal<T>(url: string, body: object): Promise<InternalResponse<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Briefing API error: ${res.status} ${errorText}`);
  }

  return res.json();
}

function deriveTimeWindow(since: number, now: number): "7d" | "14d" | "30d" {
  const days = Math.max(1, Math.ceil((now - since) / DAY_MS));
  if (days <= 7) return "7d";
  if (days <= 14) return "14d";
  return "30d";
}

function formatSinceLabel(since: number): string {
  const date = new Date(since);
  if (Number.isNaN(date.getTime())) return "Since your last visit";
  return `Since ${date.toLocaleString()}`;
}

function formatRepoLabel(repo: string): string {
  const parts = repo.split("/");
  if (parts.length === 2 && parts[1]) return parts[1];
  return repo;
}

function priorityFromLabels(
  labels: string[],
  fallback: "high" | "medium" | "low"
): "high" | "medium" | "low" {
  const normalized = labels.map((label) => label.toLowerCase());
  if (normalized.some((label) => /urgent|critical|security|sev1|p0/.test(label))) {
    return "high";
  }
  if (normalized.some((label) => /bug|failure|regression/.test(label))) {
    return "medium";
  }
  return fallback;
}

function priorityFromDeployment(
  state: VercelDeploymentData["state"]
): "high" | "medium" | "low" {
  if (state === "ERROR") return "high";
  if (state === "CANCELED" || state === "INITIALIZING") return "medium";
  if (state === "BUILDING" || state === "QUEUED") return "medium";
  return "low";
}

function formatDeploymentText(deployment: VercelDeploymentData): string {
  const base = `${deployment.name} ${deployment.state.toLowerCase()}`;
  const commit = deployment.commit?.message?.trim();
  if (commit) {
    return `${base}: ${commit}`;
  }
  return base;
}

function formatSlackMention(mention: SlackMentionData): string {
  const snippet = mention.text.replace(/\s+/g, " ").trim();
  return `${mention.user} in #${mention.channel}: ${snippet}`;
}

function formatSlackMessage(message: SlackMessageData): string {
  const snippet = message.text.replace(/\s+/g, " ").trim();
  return `${message.user}: ${snippet}`;
}

function buildSummary(counts: {
  prCount: number;
  issueCount: number;
  deploymentCount: number;
  slackCount: number;
  repoCount: number;
}): string {
  const parts: string[] = [];
  if (counts.prCount > 0) parts.push(`${counts.prCount} PRs need review`);
  if (counts.issueCount > 0) parts.push(`${counts.issueCount} new issues`);
  if (counts.deploymentCount > 0) parts.push(`${counts.deploymentCount} deployments`);
  if (counts.slackCount > 0) parts.push(`${counts.slackCount} Slack mentions`);

  const prefix =
    counts.repoCount > 1 ? `Across ${counts.repoCount} repos, ` : "";

  if (parts.length === 0) {
    return `${prefix}no urgent updates since your last visit.`;
  }

  return `${prefix}since your last visit: ${parts.join(", ")}.`;
}

function buildDerivedSignals(input: {
  prs: number;
  issues: number;
  deployments: VercelDeploymentData[];
  slack: number;
  repoStats: Array<{ repo: string; prs: number; issues: number }>;
}): string[] {
  const signals: string[] = [];
  const deploymentErrors = input.deployments.filter((d) => d.state === "ERROR").length;
  if (deploymentErrors > 0 && input.prs > 0) {
    signals.push("Deployment errors occurred while PRs await review.");
  }
  if (input.slack > 0 && input.prs > 0) {
    signals.push("Slack mentions are up while PR reviews are pending.");
  }
  if (input.issues >= 5) {
    signals.push("Issue volume spiked; consider triaging high-priority tickets.");
  }
  const mostActive = input.repoStats
    .slice()
    .sort((a, b) => b.prs + b.issues - (a.prs + a.issues))[0];
  if (mostActive && (mostActive.prs + mostActive.issues) > 0) {
    signals.push(`Most activity concentrated in ${mostActive.repo}.`);
  }
  return signals;
}

async function generateNarrative(context: {
  since: number;
  repos: string[];
  summary: string;
  repoStats: Array<{ repo: string; prs: number; issues: number }>;
  topPrs: NarrativeItem[];
  topIssues: NarrativeItem[];
  deployments: NarrativeItem[];
  slack: NarrativeItem[];
  signals: string[];
}): Promise<NarrativeResponse | null> {
  try {
    const promptPayload = {
      since: new Date(context.since).toISOString(),
      repos: context.repos,
      summary: context.summary,
      repoStats: context.repoStats,
      topPrs: context.topPrs,
      topIssues: context.topIssues,
      deployments: context.deployments,
      slack: context.slack,
      signals: context.signals,
    };

    const prompt = `Briefing context JSON:\n${JSON.stringify(promptPayload, null, 2)}\n\nGenerate a narrative summary and 1-4 recommendations.`;

    const result = await generateText({
      model: openai(NARRATIVE_MODEL),
      system: NARRATIVE_SYSTEM_PROMPT,
      prompt,
      temperature: 0.3,
    });

    const parsed = parseNarrative(result.text);
    if (!parsed) return null;

    const items = (parsed.items ?? [])
      .map((item) => sanitizeNarrativeItem(item))
      .filter((item): item is NarrativeItem => Boolean(item))
      .slice(0, MAX_NARRATIVE_ITEMS);

    return {
      summary: parsed.summary?.trim() || undefined,
      items,
    };
  } catch (error) {
    console.error("Briefing narrative error:", error);
    return null;
  }
}

function parseNarrative(text: string): NarrativeResponse | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as NarrativeResponse;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.error("Failed to parse briefing narrative:", error);
    return null;
  }
}

function sanitizeNarrativeItem(item: NarrativeItem): NarrativeItem | null {
  if (!item || typeof item !== "object") return null;
  const text = typeof item.text === "string" ? item.text.trim() : "";
  if (!text) return null;
  const icon =
    item.icon === "pr" ||
    item.icon === "issue" ||
    item.icon === "deploy" ||
    item.icon === "slack" ||
    item.icon === "alert"
      ? item.icon
      : "alert";
  const priority =
    item.priority === "high" || item.priority === "low" ? item.priority : "medium";
  const actionUrl =
    typeof item.actionUrl === "string" && item.actionUrl.trim().length > 0
      ? item.actionUrl
      : undefined;

  return {
    icon,
    text,
    priority,
    ...(actionUrl ? { actionUrl } : {}),
  };
}
