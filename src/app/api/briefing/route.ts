// briefing/route.ts
//
// Aggregates signals across GitHub, Slack, and Vercel for the Morning Briefing.
// Returns BriefingRecommendationsData to power the recommendations tile.

import { NextRequest } from "next/server";
import { generateObject, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  type MorningBriefReasonerInput,
  type MorningBriefReasonerOutput,
  morningBriefReasonerOutputSchema,
  validateMorningBriefComponentData,
  validateMorningBriefReasonerOutput,
} from "@/lib/morning-brief";
import { loadPromptDoc } from "@/lib/prompt-docs";
import { appendTelemetry } from "@/lib/telemetry";
import type {
  BriefingRecommendationsData,
  IssueData,
  PRData,
  SiteHealthData,
  SlackMentionData,
  SlackMessageData,
  TeamActivityData,
  TopPagesData,
  VercelDeploymentData,
} from "@/components/canvas/renderers/types";
import type {
  Assumption,
  EvidenceItem,
  Lever,
  MorningBriefAction,
  MorningBriefActionDirectory,
  MorningBriefCorrelationStory,
  MorningBriefComponentData,
  MorningBriefDataSource,
  MorningBriefMeta,
  MorningBriefPriorityItem,
  MorningBriefSourceReadiness,
  MorningBriefVerificationPrompt,
  MorningBriefWeeklyCheckinPrep,
} from "@/types";

interface BriefingRequest {
  since?: number;
  repos?: string[];
  slackUserId?: string;
  slackChannels?: Array<{ id: string; name: string }>;
  vercelProjectId?: string;
  vercelTeamId?: string;
  posthogProperties?: string[];
  posthogTimeWindow?: "7d" | "14d" | "30d";
  posthogTopPagesLimit?: number;
  generateNarrative?: boolean;
  outputType?: "recommendations" | "morning_brief";
  reasoningMode?: "llm" | "fallback";
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
const MORNING_BRIEF_REASONER_MODEL = "gpt-5.2";
const EVIDENCE_STALE_MINUTES = 180;
const REPAIR_RETRY_LIMIT = 1;

const NARRATIVE_SYSTEM_PROMPT = loadPromptDoc(
  "docs/prompts/briefing-narrative-system.md",
  "You are an AI chief of staff preparing a concise morning briefing. Return structured JSON only."
);

const MORNING_BRIEF_REASONER_SYSTEM_PROMPT = loadPromptDoc(
  "docs/prompts/morning-brief-reasoner-system.md",
  "You are generating a Morning Brief for User 0. Return schema-constrained structured output only."
);

type ReasoningMode = "llm" | "fallback";

type ReasonerOutcome =
  | { strategy: "llm"; output: MorningBriefReasonerOutput; repaired: boolean }
  | { strategy: "fallback"; reason: string };

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
    const posthogProperties = Array.isArray(body.posthogProperties)
      ? body.posthogProperties
          .filter((property): property is string => typeof property === "string")
          .map((property) => property.trim())
          .filter((property) => property.length > 0)
      : [];
    const posthogTimeWindow =
      body.posthogTimeWindow === "14d" || body.posthogTimeWindow === "30d"
        ? body.posthogTimeWindow
        : "7d";
    const posthogTopPagesLimit =
      typeof body.posthogTopPagesLimit === "number" &&
      Number.isFinite(body.posthogTopPagesLimit)
        ? Math.max(1, Math.min(20, Math.round(body.posthogTopPagesLimit)))
        : 5;
    const outputType =
      body.outputType === "morning_brief" ? "morning_brief" : "recommendations";
    const reasoningMode = resolveReasoningMode(body.reasoningMode);
    const posthogRequested =
      outputType === "morning_brief" &&
      (posthogProperties.length > 0 ||
        body.posthogTimeWindow !== undefined ||
        body.posthogTopPagesLimit !== undefined);

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
        posthogRequested,
        posthogProperties,
        posthogTimeWindow,
        posthogTopPagesLimit,
        generateNarrative: body.generateNarrative !== false,
        outputType,
        reasoningMode,
      },
    });

    const origin = new URL(req.url).origin;
    const ttlCandidates: number[] = [DEFAULT_TTL];
    const errors: string[] = [];
    const sourceErrors: Partial<Record<MorningBriefDataSource, string>> = {};
    const pushSourceError = (source: MorningBriefDataSource, message: string) => {
      errors.push(message);
      if (!sourceErrors[source]) {
        sourceErrors[source] = message;
      }
    };

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
        pushSourceError(
          "github",
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
        pushSourceError(
          "github",
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
        pushSourceError(
          "github",
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
        pushSourceError(
          "slack",
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
        pushSourceError(
          "slack",
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
        pushSourceError(
          "vercel",
          result.reason instanceof Error
            ? result.reason.message
            : "Failed to load Vercel deployments"
        );
      }
    }

    let posthogSiteHealth: SiteHealthData | undefined;
    let posthogTopPages: TopPagesData | undefined;
    if (posthogRequested) {
      const posthogResults = await Promise.allSettled([
        postInternal<SiteHealthData>(`${origin}/api/posthog`, {
          type: "site_health",
          params: {
            timeWindow: posthogTimeWindow,
            ...(posthogProperties.length > 0 ? { properties: posthogProperties } : {}),
          },
        }),
        postInternal<TopPagesData>(`${origin}/api/posthog`, {
          type: "top_pages",
          params: {
            timeWindow: posthogTimeWindow,
            limit: posthogTopPagesLimit,
            ...(posthogProperties[0] ? { property: posthogProperties[0] } : {}),
          },
        }),
      ]);

      const siteHealth = posthogResults[0];
      if (siteHealth?.status === "fulfilled") {
        posthogSiteHealth = siteHealth.value.data;
        ttlCandidates.push(siteHealth.value.ttl);
      } else {
        pushSourceError(
          "posthog",
          siteHealth?.reason instanceof Error
            ? siteHealth.reason.message
            : "Failed to load PostHog site health"
        );
      }

      const topPages = posthogResults[1];
      if (topPages?.status === "fulfilled") {
        posthogTopPages = topPages.value.data;
        ttlCandidates.push(topPages.value.ttl);
      } else {
        pushSourceError(
          "posthog",
          topPages?.reason instanceof Error
            ? topPages.reason.message
            : "Failed to load PostHog top pages"
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
      posthogVisitors: posthogSiteHealth?.uniqueVisitors ?? 0,
    });

    let summary = summaryBase;
    let narrativeItems: NarrativeItem[] = [];

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
        posthogVisitors: posthogSiteHealth?.uniqueVisitors ?? 0,
        posthogTopPage: posthogTopPages?.pages?.[0]?.path,
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
        narrativeItems = narrative.items;
        sections.unshift({
          title: "AI Recommendations",
          items: narrative.items,
        });
      }
    }

    const response =
      outputType === "morning_brief"
        ? await buildMorningBriefResponse({
            now,
            summary,
            since,
            repos: reposToFetch,
            prs: prsSince,
            issues: issuesSince,
            deployments: deploymentsSince,
            slackMentions: slackMentionsSince,
            slackMessages: channelActivitySince,
            prItems,
            issueItems,
            deploymentItems,
            slackItems: slackCombined,
            narrativeItems,
            errors,
            sourceErrors,
            posthogSiteHealth,
            posthogTopPages,
            requestedSources: {
              github: reposToFetch.length > 0,
              slack: Boolean(slackUserId || slackChannels.length > 0),
              vercel: Boolean(vercelProjectId),
              posthog: posthogRequested,
            },
            reasoningMode,
          })
        : ({
            summary,
            sinceLabel: formatSinceLabel(since),
            sections,
            generatedAt: now,
          } satisfies BriefingRecommendationsData);

    await appendTelemetry({
      level: "info",
      source: "api.briefing",
      event: "response",
      data: {
        sectionCount: sections.length,
        summary,
        errors: errors.length,
        ttl,
        outputType,
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

function resolveReasoningMode(
  requestedMode: BriefingRequest["reasoningMode"]
): ReasoningMode {
  if (requestedMode === "llm" || requestedMode === "fallback") {
    return requestedMode;
  }

  const envMode = process.env.MORNING_BRIEF_REASONER_MODE?.trim().toLowerCase();
  if (envMode === "fallback") {
    return "fallback";
  }

  return "llm";
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
  posthogVisitors: number;
}): string {
  const parts: string[] = [];
  if (counts.prCount > 0) parts.push(`${counts.prCount} PRs need review`);
  if (counts.issueCount > 0) parts.push(`${counts.issueCount} new issues`);
  if (counts.deploymentCount > 0) parts.push(`${counts.deploymentCount} deployments`);
  if (counts.slackCount > 0) parts.push(`${counts.slackCount} Slack mentions`);
  if (counts.posthogVisitors > 0) parts.push(`${counts.posthogVisitors} visitors observed`);

  const prefix =
    counts.repoCount > 1 ? `Across ${counts.repoCount} repos, ` : "";

  if (parts.length === 0) {
    return `${prefix}no urgent updates since your last visit.`;
  }

  return `${prefix}since your last visit: ${parts.join(", ")}.`;
}

interface BuildMorningBriefInput {
  now: number;
  since: number;
  summary: string;
  repos: string[];
  prs: Array<PRData & { repo: string }>;
  issues: Array<IssueData & { repo: string }>;
  deployments: VercelDeploymentData[];
  slackMentions: SlackMentionData[];
  slackMessages: SlackMessageData[];
  prItems: NarrativeItem[];
  issueItems: NarrativeItem[];
  deploymentItems: NarrativeItem[];
  slackItems: NarrativeItem[];
  narrativeItems: NarrativeItem[];
  errors: string[];
  sourceErrors: Partial<Record<MorningBriefDataSource, string>>;
  posthogSiteHealth?: SiteHealthData;
  posthogTopPages?: TopPagesData;
  requestedSources: {
    github: boolean;
    slack: boolean;
    vercel: boolean;
    posthog: boolean;
  };
  reasoningMode: ReasoningMode;
}

interface DeterministicMorningBriefBase {
  evidence: EvidenceItem[];
  levers: Lever[];
  assumptions: Assumption[];
  confidence: "low" | "medium" | "high";
  sourceReadiness: MorningBriefSourceReadiness[];
  actionDirectory: MorningBriefActionDirectory;
  meta: MorningBriefMeta;
  freshnessSummary: string;
  confidenceScore: number;
}

function buildDeterministicMorningBriefBase(
  input: BuildMorningBriefInput
): DeterministicMorningBriefBase {
  const evidence = buildEvidence(input);
  const levers = buildLevers(input);
  const assumptions = buildAssumptions(input, evidence);
  const confidence = deriveConfidence(evidence, assumptions, levers);
  const sourceReadiness = buildSourceReadiness(input, evidence);
  const actionDirectory = buildActionDirectory(input, sourceReadiness);
  const meta = buildMorningBriefMeta(input.now);
  const freshnessSummary = buildFreshnessSummary(evidence);
  const confidenceScore = deriveConfidenceScore(confidence, evidence.length, assumptions.length);

  return {
    evidence,
    levers,
    assumptions,
    confidence,
    sourceReadiness,
    actionDirectory,
    meta,
    freshnessSummary,
    confidenceScore,
  };
}

function buildFallbackMorningBriefResponse(
  input: BuildMorningBriefInput,
  base: DeterministicMorningBriefBase
): MorningBriefComponentData {
  const mission = buildMissionStatement(input);
  const priorities = buildFallbackPriorities(base.evidence);
  const correlations = buildFallbackCorrelations(base.evidence);
  const verification = buildFallbackVerification(priorities, base.assumptions, base.confidence);
  const weeklyCheckin = buildFallbackWeeklyCheckin(priorities, base.assumptions, base.confidence);
  const missionWithV2 = {
    ...mission,
    whyNow: input.summary,
    confidenceScore: base.confidenceScore,
    certainty: base.confidence,
  } satisfies MorningBriefComponentData["current"]["mission"];

  return {
    current: {
      version: 2,
      generatedAt: new Date(input.now).toISOString(),
      generatedBy: "assistant",
      meta: base.meta,
      mission: missionWithV2,
      evidence: base.evidence,
      levers: base.levers,
      priorities,
      correlations,
      actionDirectory: base.actionDirectory,
      weeklyCheckin,
      assumptions: base.assumptions,
      verification,
      sourceReadiness: base.sourceReadiness,
      confidence: base.confidence,
      freshnessSummary: base.freshnessSummary,
    },
    history: [],
    state: "presented",
    userOverrides: [],
  };
}

async function buildMorningBriefResponse(
  input: BuildMorningBriefInput
): Promise<MorningBriefComponentData> {
  const base = buildDeterministicMorningBriefBase(input);
  const fallback = buildFallbackMorningBriefResponse(input, base);
  const reasonerInput = assembleReasonerInput(input, base);
  const outcome = await runMorningBriefReasoner(input.reasoningMode, reasonerInput);

  if (outcome.strategy === "fallback") {
    await appendTelemetry({
      level: "info",
      source: "api.briefing.reasoner",
      event: "fallback",
      data: {
        mode: input.reasoningMode,
        reason: outcome.reason,
      },
    });
    return fallback;
  }

  const reasoned = composeReasonedMorningBriefResponse(input, base, outcome.output);
  const validated = validateMorningBriefComponentData(reasoned);

  if (!validated.valid) {
    await appendTelemetry({
      level: "warn",
      source: "api.briefing.reasoner",
      event: "fallback",
      data: {
        mode: input.reasoningMode,
        reason: "component_validation_failed",
        errorCount: validated.errors.length,
      },
    });
    return fallback;
  }

  await appendTelemetry({
    level: "info",
    source: "api.briefing.reasoner",
    event: "success",
    data: {
      mode: input.reasoningMode,
      repaired: outcome.repaired,
      priorityCount: validated.data.current.priorities?.length ?? 0,
      confidence: validated.data.current.confidence,
    },
  });

  return validated.data;
}

function assembleReasonerInput(
  input: BuildMorningBriefInput,
  base: DeterministicMorningBriefBase
): MorningBriefReasonerInput {
  return {
    context: {
      generatedAt: new Date(input.now).toISOString(),
      since: new Date(input.since).toISOString(),
      profileId: "user0",
      rankingPolicy: "highest_impact_first",
      maxPriorities: 3,
      horizons: ["today", "this_week"],
      ownershipPriority: [
        "engineering_delivery",
        "team_communications",
        "strategy_planning",
      ],
    },
    summaries: {
      summary: input.summary,
      repoCount: input.repos.length,
      repos: input.repos,
      signalCounts: {
        prs: input.prs.length,
        issues: input.issues.length,
        deployments: input.deployments.length,
        slack: input.slackMentions.length + input.slackMessages.length,
        posthog:
          (input.posthogSiteHealth ? 1 : 0) +
          (input.posthogTopPages?.pages?.length ?? 0),
      },
    },
    requestedSources: {
      github: input.requestedSources.github,
      slack: input.requestedSources.slack,
      posthog: input.requestedSources.posthog,
      vercel: input.requestedSources.vercel,
      custom: input.errors.length > 0,
    },
    sourceReadiness: base.sourceReadiness,
    actionDirectory: base.actionDirectory,
    evidence: base.evidence,
    guidance: {
      avoidSingleSourceOverindexing: true,
      hypothesisFirst: true,
      requireVerificationWhenUncertain: true,
    },
  };
}

async function runMorningBriefReasoner(
  mode: ReasoningMode,
  reasonerInput: MorningBriefReasonerInput
): Promise<ReasonerOutcome> {
  if (mode === "fallback") {
    return { strategy: "fallback", reason: "forced_fallback_mode" };
  }

  if (!process.env.OPENAI_API_KEY) {
    return { strategy: "fallback", reason: "missing_openai_api_key" };
  }

  const firstAttempt = await runReasonerAttempt({
    reasonerInput,
    attempt: "initial",
  });

  if (firstAttempt.strategy === "llm") {
    return firstAttempt;
  }

  for (let retryIndex = 0; retryIndex < REPAIR_RETRY_LIMIT; retryIndex += 1) {
    const repairAttempt = await runReasonerAttempt({
      reasonerInput,
      attempt: "repair",
      repairContext: firstAttempt.reason,
    });
    if (repairAttempt.strategy === "llm") {
      return { ...repairAttempt, repaired: true };
    }
  }

  return { strategy: "fallback", reason: firstAttempt.reason };
}

async function runReasonerAttempt(input: {
  reasonerInput: MorningBriefReasonerInput;
  attempt: "initial" | "repair";
  repairContext?: string;
}): Promise<ReasonerOutcome> {
  try {
    const prompt =
      input.attempt === "repair"
        ? `Repair the Morning Brief output. Prior validation issue: ${input.repairContext ?? "unknown"}\n\nReasoner input JSON:\n${JSON.stringify(
            input.reasonerInput,
            null,
            2
          )}`
        : `Reasoner input JSON:\n${JSON.stringify(input.reasonerInput, null, 2)}`;

    const result = await generateObject({
      model: openai(MORNING_BRIEF_REASONER_MODEL),
      system: MORNING_BRIEF_REASONER_SYSTEM_PROMPT,
      prompt,
      schema: morningBriefReasonerOutputSchema,
      temperature: 0.2,
    });

    const validated = validateMorningBriefReasonerOutput(result.object);
    if (!validated.valid) {
      return {
        strategy: "fallback",
        reason: `invalid_reasoner_output:${validated.errors.slice(0, 2).join("; ")}`,
      };
    }

    const repaired = ensureReasonerOutputIntegrity(validated.data, input.reasonerInput);

    return {
      strategy: "llm",
      output: repaired,
      repaired: input.attempt === "repair",
    };
  } catch (error) {
    return {
      strategy: "fallback",
      reason:
        error instanceof Error ? `reasoner_error:${error.message}` : "reasoner_error:unknown",
    };
  }
}

function composeReasonedMorningBriefResponse(
  input: BuildMorningBriefInput,
  base: DeterministicMorningBriefBase,
  reasoned: MorningBriefReasonerOutput
): MorningBriefComponentData {
  const fallbackMission = buildMissionStatement(input);
  const topPriorityComposite = reasoned.priorities[0]?.scores?.composite;

  const mission: MorningBriefComponentData["current"]["mission"] = {
    ...fallbackMission,
    title: reasoned.mission.title,
    rationale: reasoned.mission.whyNow,
    priorityScore:
      typeof topPriorityComposite === "number"
        ? clampNumber(topPriorityComposite, 0, 100)
        : fallbackMission.priorityScore,
    whyNow: reasoned.mission.whyNow,
    confidenceScore: reasoned.mission.confidenceScore,
    certainty: reasoned.mission.certainty,
  };

  return {
    current: {
      version: 2,
      generatedAt: new Date(input.now).toISOString(),
      generatedBy: "assistant",
      meta: base.meta,
      mission,
      evidence: base.evidence,
      levers: base.levers,
      priorities: reasoned.priorities,
      correlations: reasoned.correlations,
      actionDirectory: base.actionDirectory,
      weeklyCheckin: reasoned.weeklyCheckin,
      assumptions: reasoned.assumptions,
      verification: reasoned.verification,
      sourceReadiness: base.sourceReadiness,
      confidence: reasoned.confidence,
      freshnessSummary: base.freshnessSummary,
    },
    history: [],
    state: "presented",
    userOverrides: [],
  };
}

function ensureReasonerOutputIntegrity(
  output: MorningBriefReasonerOutput,
  input: MorningBriefReasonerInput
): MorningBriefReasonerOutput {
  const evidenceIds = new Set(input.evidence.map((item) => item.id));
  const priorities = output.priorities
    .slice(0, 3)
    .map((priority, index) => ({
      ...priority,
      rank: (index + 1) as 1 | 2 | 3,
      relatedEvidenceIds: priority.relatedEvidenceIds.filter((id) => evidenceIds.has(id)),
      primaryActions:
        priority.primaryActions.length > 0
          ? priority.primaryActions.slice(0, 3)
          : [
              {
                id: `${priority.id}_manual_action`,
                label: "Review this priority manually",
                app: "workspace",
                type: "manual",
                expectedOutcome: "Clarify next action with current context.",
              },
            ],
    }))
    .filter((priority) => priority.relatedEvidenceIds.length > 0);

  const normalizedPriorities = priorities.length > 0 ? priorities : output.priorities.slice(0, 1);

  const correlations = output.correlations.slice(0, 3).map((story) => ({
    ...story,
    relatedEvidenceIds: story.relatedEvidenceIds.filter((id) => evidenceIds.has(id)),
  }));

  const cleanedCorrelations = correlations.filter(
    (story) => story.relatedEvidenceIds.length > 0
  );

  const assumptions = [...output.assumptions];
  const hasStaleAssumption = assumptions.some((assumption) => assumption.reason === "stale_data");
  const staleSources = input.sourceReadiness.filter(
    (entry) => entry.available && (entry.freshnessMinutes ?? 0) > EVIDENCE_STALE_MINUTES
  );
  if (!hasStaleAssumption && staleSources.length > 0) {
    assumptions.push({
      id: "assumption_stale_sources",
      text: "Some source data is stale and may lag current conditions.",
      reason: "stale_data",
      sourceScope: staleSources.map((entry) => entry.source),
      relatedSource: staleSources[0]?.source,
      impact: "medium",
    });
  }

  const hasMissingAssumption = assumptions.some(
    (assumption) => assumption.reason === "missing_data"
  );
  const missingSources = input.sourceReadiness.filter((entry) => !entry.available);
  if (!hasMissingAssumption && missingSources.length > 0) {
    assumptions.push({
      id: "assumption_missing_sources",
      text: "One or more requested sources were unavailable for this brief.",
      reason: "missing_data",
      sourceScope: missingSources.map((entry) => entry.source),
      relatedSource: missingSources[0]?.source,
      impact: "high",
    });
  }

  const verification = [...output.verification];
  const hasLowConfidenceVerification = verification.some(
    (prompt) => prompt.reason === "low_confidence"
  );
  if (output.confidence === "low" && !hasLowConfidenceVerification) {
    verification.push({
      id: "verify_low_confidence",
      prompt: "Does this ordering still match what changed this morning?",
      reason: "low_confidence",
    });
  }

  for (const priority of normalizedPriorities) {
    if (
      priority.ownershipHypothesis.needsVerification &&
      !verification.some((prompt) => prompt.appliesToPriorityId === priority.id)
    ) {
      verification.push({
        id: `verify_owner_${priority.id}`,
        prompt: `Confirm owner for "${priority.title}" before starting execution.`,
        appliesToPriorityId: priority.id,
        reason: "ownership_uncertain",
      });
    }
  }

  const weeklyBullets =
    output.weeklyCheckin.bullets.length > 0
      ? output.weeklyCheckin.bullets
      : normalizedPriorities.map(
          (priority) => `${priority.rank}. ${priority.title} - ${priority.recommendation}`
        );

  return {
    ...output,
    priorities: normalizedPriorities.map((priority, index) => ({
      ...priority,
      rank: (index + 1) as 1 | 2 | 3,
    })),
    correlations: cleanedCorrelations,
    assumptions: assumptions.slice(0, 8),
    verification: verification.slice(0, 6),
    weeklyCheckin: {
      ...output.weeklyCheckin,
      ready: output.weeklyCheckin.ready && normalizedPriorities.length > 0,
      bullets: weeklyBullets.slice(0, 4),
      gaps: output.weeklyCheckin.gaps.slice(0, 4),
    },
  };
}

function buildMissionStatement(input: BuildMorningBriefInput): MorningBriefComponentData["current"]["mission"] {
  const deploymentErrors = input.deployments.filter((deployment) => deployment.state === "ERROR").length;
  const slackCount = input.slackMentions.length + input.slackMessages.length;
  const posthogVisitors = input.posthogSiteHealth?.uniqueVisitors ?? 0;
  const repoLabel = input.repos.length > 0 ? formatRepoLabel(input.repos[0]) : "your workspace";
  const title =
    deploymentErrors > 0
      ? `Stabilize release readiness for ${repoLabel}`
      : input.prs.length >= input.issues.length && input.prs.length > 0
        ? `Unblock pull request flow across active repos`
        : input.issues.length > 0
          ? `Reduce issue backlog risk before it compounds`
          : slackCount > 0
            ? `Resolve active team blockers from Slack signals`
            : posthogVisitors > 0
              ? `Protect active product traffic while validating key funnels`
            : `Establish mission focus for today's execution`;

  const rationale = `Based on evidence from current signals, ${input.summary} Primary signals: ${input.prs.length} PRs, ${input.issues.length} issues, ${input.deployments.length} deployments, ${slackCount} Slack events, ${posthogVisitors} visitors.`;
  const priorityScore = Math.max(
    20,
    Math.min(
      100,
      Math.round(
        35 +
          input.prs.length * 4 +
          input.issues.length * 3 +
          deploymentErrors * 12 +
          slackCount * 2 +
          Math.min(posthogVisitors / 100, 15)
      )
    )
  );

  return {
    id: "mission_primary",
    title,
    rationale,
    owner: "You",
    horizon: "today",
    priorityScore,
  };
}

function buildEvidence(input: BuildMorningBriefInput): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  for (const pr of input.prs.slice(0, 4)) {
    const observedAt = pr.updatedAt ?? pr.createdAt;
    evidence.push({
      id: `ev_pr_${pr.id}`,
      source: "github",
      entity: pr.repo,
      metric: "open_pr",
      valueText: `PR #${pr.number}: ${pr.title}`,
      valueNumber: pr.number,
      observedAt: toIso(observedAt),
      freshnessMinutes: freshnessMinutes(observedAt, input.now),
      link: `https://github.com/${pr.repo}/pull/${pr.number}`,
      confidence: priorityFromLabels(pr.labels, "medium") === "high" ? "high" : "medium",
    });
  }

  for (const issue of input.issues.slice(0, 4)) {
    evidence.push({
      id: `ev_issue_${issue.id}`,
      source: "github",
      entity: issue.repo,
      metric: "open_issue",
      valueText: `Issue #${issue.number}: ${issue.title}`,
      valueNumber: issue.number,
      observedAt: toIso(issue.createdAt),
      freshnessMinutes: freshnessMinutes(issue.createdAt, input.now),
      link: `https://github.com/${issue.repo}/issues/${issue.number}`,
      confidence: priorityFromLabels(issue.labels, "medium") === "high" ? "high" : "medium",
    });
  }

  for (const deployment of input.deployments.slice(0, 3)) {
    evidence.push({
      id: `ev_dep_${deployment.id}`,
      source: "vercel",
      entity: deployment.name,
      metric: "deployment_state",
      valueText: `${deployment.name} ${deployment.state.toLowerCase()}`,
      observedAt: toIso(deployment.createdAt),
      freshnessMinutes: freshnessMinutes(deployment.createdAt, input.now),
      link: deployment.inspectorUrl ?? deployment.url ?? undefined,
      confidence: deployment.state === "ERROR" ? "high" : "medium",
    });
  }

  for (const mention of input.slackMentions.slice(0, 3)) {
    evidence.push({
      id: `ev_slack_mention_${mention.ts}`,
      source: "slack",
      entity: mention.channel,
      metric: "mention",
      valueText: formatSlackMention(mention),
      observedAt: toIso(mention.timestamp),
      freshnessMinutes: freshnessMinutes(mention.timestamp, input.now),
      link: mention.permalink,
      confidence: "medium",
    });
  }

  for (const message of input.slackMessages.slice(0, 2)) {
    evidence.push({
      id: `ev_slack_msg_${message.ts}`,
      source: "slack",
      entity: "channel",
      metric: "channel_activity",
      valueText: formatSlackMessage(message),
      observedAt: toIso(message.timestamp),
      freshnessMinutes: freshnessMinutes(message.timestamp, input.now),
      confidence: "low",
    });
  }

  if (input.posthogSiteHealth) {
    evidence.push({
      id: "ev_posthog_visitors",
      source: "posthog",
      entity: "site_health",
      metric: "unique_visitors",
      valueText: `${input.posthogSiteHealth.uniqueVisitors} unique visitors`,
      valueNumber: input.posthogSiteHealth.uniqueVisitors,
      observedAt: toIso(input.now),
      freshnessMinutes: 0,
      confidence: "medium",
      confidenceScore: 70,
    });
    evidence.push({
      id: "ev_posthog_pageviews",
      source: "posthog",
      entity: "site_health",
      metric: "pageviews",
      valueText: `${input.posthogSiteHealth.pageviews} pageviews`,
      valueNumber: input.posthogSiteHealth.pageviews,
      observedAt: toIso(input.now),
      freshnessMinutes: 0,
      confidence: "medium",
      confidenceScore: 70,
    });
  }

  for (const [index, page] of (input.posthogTopPages?.pages ?? []).slice(0, 2).entries()) {
    evidence.push({
      id: `ev_posthog_page_${index + 1}`,
      source: "posthog",
      entity: page.property || "posthog",
      metric: "top_page",
      valueText: `${page.path} (${page.views} views)`,
      valueNumber: page.views,
      observedAt: toIso(input.now),
      freshnessMinutes: 0,
      confidence: "medium",
      confidenceScore: 65,
    });
  }

  input.errors.slice(0, 3).forEach((message, index) => {
    evidence.push({
      id: `ev_error_${index + 1}`,
      source: "custom",
      entity: "integrations",
      metric: "integration_error",
      valueText: message,
      observedAt: toIso(input.now),
      freshnessMinutes: 0,
      confidence: "low",
    });
  });

  if (evidence.length === 0) {
    evidence.push({
      id: "ev_signal_gap",
      source: "custom",
      entity: "workspace",
      metric: "signal_gap",
      valueText: "No recent evidence was observed from configured sources.",
      observedAt: toIso(input.now),
      freshnessMinutes: 0,
      confidence: "low",
    });
  }

  return evidence;
}

function buildLevers(input: BuildMorningBriefInput): Lever[] {
  const ordered = [
    ...input.narrativeItems,
    ...input.prItems,
    ...input.issueItems,
    ...input.deploymentItems,
    ...input.slackItems,
  ];

  const seen = new Set<string>();
  const levers: Lever[] = [];

  for (const item of ordered) {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const impactScore = item.priority === "high" ? 85 : item.priority === "medium" ? 65 : 45;
    levers.push({
      id: `lever_${levers.length + 1}`,
      label: item.text,
      actionType: item.actionUrl ? "open_link" : "manual",
      actionPayload: item.actionUrl ? { url: item.actionUrl } : undefined,
      expectedImpact: item.text,
      impactScore,
      confidence: item.priority === "high" ? "high" : item.priority === "medium" ? "medium" : "low",
    });

    if (levers.length >= 5) break;
  }

  if (levers.length === 0) {
    levers.push({
      id: "lever_1",
      label: "Request refreshed data sources before taking action",
      actionType: "manual",
      expectedImpact: "Improves confidence for the next mission decision.",
      impactScore: 40,
      confidence: "low",
    });
  }

  return levers;
}

function buildAssumptions(
  input: BuildMorningBriefInput,
  evidence: EvidenceItem[]
): Assumption[] {
  const assumptions: Assumption[] = [];
  const staleSources = new Set<MorningBriefDataSource>(
    evidence
      .filter((item) => item.freshnessMinutes > EVIDENCE_STALE_MINUTES)
      .map((item) => item.source)
  );

  if (staleSources.size > 0) {
    assumptions.push({
      id: "assumption_stale_sources",
      text: "Some evidence is stale and may not reflect current conditions.",
      reason: "stale_data",
      sourceScope: Array.from(staleSources),
      impact: "medium",
    });
  }

  if (input.requestedSources.github && input.prs.length + input.issues.length === 0) {
    assumptions.push({
      id: "assumption_missing_github",
      text: "GitHub returned little or no actionable signal for this window.",
      reason: "missing_data",
      sourceScope: ["github"],
      impact: "medium",
      relatedSource: "github",
    });
  }

  if (input.requestedSources.slack && input.slackMentions.length + input.slackMessages.length === 0) {
    assumptions.push({
      id: "assumption_missing_slack",
      text: "Slack signals were unavailable or below threshold for this brief.",
      reason: "missing_data",
      sourceScope: ["slack"],
      impact: "medium",
      relatedSource: "slack",
    });
  }

  if (input.requestedSources.vercel && input.deployments.length === 0) {
    assumptions.push({
      id: "assumption_missing_vercel",
      text: "No recent deployment events were available from Vercel.",
      reason: "missing_data",
      sourceScope: ["vercel"],
      impact: "low",
      relatedSource: "vercel",
    });
  }

  if (
    input.requestedSources.posthog &&
    !input.posthogSiteHealth &&
    (input.posthogTopPages?.pages?.length ?? 0) === 0
  ) {
    assumptions.push({
      id: "assumption_missing_posthog",
      text: "PostHog signals were unavailable, reducing confidence in product impact ranking.",
      reason: "missing_data",
      sourceScope: ["posthog"],
      impact: "high",
      relatedSource: "posthog",
    });
  }

  if (input.errors.length > 0) {
    assumptions.push({
      id: "assumption_integration_errors",
      text: `Integration errors may reduce confidence: ${input.errors.slice(0, 2).join("; ")}`,
      reason: "insufficient_sample",
      sourceScope: ["custom"],
      impact: "high",
      relatedSource: "custom",
    });
  }

  if (
    assumptions.length === 0 &&
    evidence.every((item) => item.source === "custom")
  ) {
    assumptions.push({
      id: "assumption_low_signal",
      text: "This brief is operating with low-signal inputs and should be treated as provisional.",
      reason: "insufficient_sample",
      sourceScope: ["custom"],
      impact: "high",
      relatedSource: "custom",
    });
  }

  return assumptions;
}

function deriveConfidence(
  evidence: EvidenceItem[],
  assumptions: Assumption[],
  levers: Lever[]
): "low" | "medium" | "high" {
  if (evidence.length >= 5 && levers.length >= 2 && assumptions.length <= 1) {
    return "high";
  }
  if (evidence.length >= 2 && levers.length >= 1) {
    return "medium";
  }
  return "low";
}

function deriveConfidenceScore(
  confidence: "low" | "medium" | "high",
  evidenceCount: number,
  assumptionCount: number
): number {
  const base = confidence === "high" ? 80 : confidence === "medium" ? 62 : 42;
  return Math.max(0, Math.min(100, base + Math.min(evidenceCount * 2, 12) - assumptionCount * 4));
}

function buildMorningBriefMeta(now: number): MorningBriefMeta {
  const nowDate = new Date(now);
  const todayStart = new Date(nowDate);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(todayStart);
  const dayOfWeek = weekStart.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + mondayOffset);

  return {
    generatedAt: nowDate.toISOString(),
    window: {
      todayStart: todayStart.toISOString(),
      now: nowDate.toISOString(),
      weekStart: weekStart.toISOString(),
    },
    profileId: "user0",
    rankingPolicy: "highest_impact_first",
    maxPriorities: 3,
  };
}

function certaintyFromScore(score: number): "low" | "medium" | "high" {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

const FALLBACK_SOURCE_IMPACT: Record<MorningBriefDataSource, number> = {
  vercel: 86,
  github: 80,
  posthog: 76,
  slack: 72,
  custom: 52,
};

function confidenceToScore(value: EvidenceItem["confidence"]): number {
  if (value === "high") return 82;
  if (value === "medium") return 68;
  return 52;
}

function buildFallbackPriorities(
  evidence: EvidenceItem[]
): MorningBriefPriorityItem[] {
  const candidates = evidence
    .filter((item) => item.source !== "custom")
    .map((item) => {
      const impact = FALLBACK_SOURCE_IMPACT[item.source];
      const urgency = clampNumber(100 - Math.min(item.freshnessMinutes, 100), 40, 95);
      const ownershipFit = item.source === "github" || item.source === "vercel" ? 82 : 70;
      const confidence = item.confidenceScore ?? confidenceToScore(item.confidence);
      const composite = Math.round(
        0.45 * impact + 0.2 * urgency + 0.2 * ownershipFit + 0.15 * confidence
      );
      const linkAction: MorningBriefAction =
        item.link
          ? {
              id: `action_${item.id}`,
              label: `Open ${item.source} context`,
              app:
                item.source === "github" ||
                item.source === "slack" ||
                item.source === "posthog" ||
                item.source === "vercel"
                  ? item.source
                  : "workspace",
              type: "open_link",
              payload: { url: item.link },
              expectedOutcome: "Validate details and decide the next action.",
            }
          : {
              id: `action_${item.id}`,
              label: `Review ${item.source} signal`,
              app: "workspace",
              type: "manual",
              expectedOutcome: "Turn this signal into an explicit owner and plan.",
            };

      return {
        item,
        scores: {
          impact,
          urgency,
          ownershipFit,
          confidence,
          composite,
        },
        action: linkAction,
      };
    })
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, 3);

  if (candidates.length === 0) {
    return [
      {
        id: "priority_refresh",
        rank: 1,
        title: "Refresh sources before committing to priorities",
        recommendation: "Reconnect missing integrations and regenerate the morning brief.",
        approach: "Fix source availability first, then rerun ranking with fresh evidence.",
        whyHighestImpact: "Low-signal context reduces confidence in prioritization.",
        horizon: "today",
        scores: {
          impact: 55,
          urgency: 62,
          ownershipFit: 72,
          confidence: 42,
          composite: 57,
        },
        certainty: "low",
        ownershipHypothesis: {
          likelyOwner: "me",
          rationale: "Restoring signal coverage is directly actionable.",
          needsVerification: false,
        },
        relatedEvidenceIds: evidence.map((item) => item.id),
        primaryActions: [
          {
            id: "action_refresh_brief",
            label: "Refresh Morning Brief",
            app: "workspace",
            type: "manual",
            expectedOutcome: "Improve recommendation quality with refreshed evidence.",
          },
        ],
      },
    ];
  }

  return candidates.map(({ item, scores, action }, index) => ({
    id: `priority_${index + 1}`,
    rank: (index + 1) as 1 | 2 | 3,
    title: `Address ${item.source} signal: ${item.metric.replace(/_/g, " ")}`,
    recommendation: `Investigate and resolve: ${item.valueText}`,
    approach:
      item.source === "github" || item.source === "vercel"
        ? "Open the linked context, identify owner, and commit next step immediately."
        : "Review context, confirm impact, and assign owner for follow-through.",
    whyHighestImpact: `This signal has the highest composite score from impact, urgency, ownership fit, and confidence.`,
    horizon: index === 0 ? "today" : "this_week",
    scores,
    certainty: certaintyFromScore(scores.confidence),
    ownershipHypothesis: {
      likelyOwner: item.source === "github" || item.source === "vercel" ? "me" : "shared",
      rationale:
        item.source === "github" || item.source === "vercel"
          ? "Direct delivery/reliability path."
          : "Likely requires cross-functional coordination.",
      needsVerification: item.source !== "github" && item.source !== "vercel",
    },
    relatedEvidenceIds: [item.id],
    primaryActions: [action],
  }));
}

function buildFallbackCorrelations(evidence: EvidenceItem[]): MorningBriefCorrelationStory[] {
  const bySource = new Map<MorningBriefDataSource, EvidenceItem[]>();
  for (const item of evidence) {
    if (item.source === "custom") continue;
    const existing = bySource.get(item.source) ?? [];
    existing.push(item);
    bySource.set(item.source, existing);
  }

  if (bySource.size < 2) return [];

  const rankedSources = Array.from(bySource.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([source]) => source);

  const sources: MorningBriefDataSource[] =
    rankedSources.includes("posthog") && rankedSources.length >= 2
      ? (["posthog", rankedSources.find((source) => source !== "posthog") ?? rankedSources[1]] as [
          MorningBriefDataSource,
          MorningBriefDataSource,
        ])
      : ([rankedSources[0], rankedSources[1]] as [MorningBriefDataSource, MorningBriefDataSource]);

  const relatedEvidenceIds = sources.flatMap((source) =>
    (bySource.get(source) ?? []).slice(0, 2).map((item) => item.id)
  );

  return [
    {
      id: "corr_primary",
      headline: `${sources[0]} and ${sources[1]} signals are converging`,
      claim:
        "Multiple sources point to related execution risk/opportunity, so coordinating these threads should improve outcome quality.",
      sources,
      relatedEvidenceIds,
      confidenceScore: 68,
      certainty: "medium",
    },
  ];
}

function buildFallbackVerification(
  priorities: MorningBriefPriorityItem[],
  assumptions: Assumption[],
  confidence: "low" | "medium" | "high"
): MorningBriefVerificationPrompt[] {
  const prompts: MorningBriefVerificationPrompt[] = [];

  for (const priority of priorities) {
    if (!priority.ownershipHypothesis.needsVerification) continue;
    prompts.push({
      id: `verify_owner_${priority.id}`,
      prompt: `Confirm owner for "${priority.title}" before execution starts.`,
      appliesToPriorityId: priority.id,
      reason: "ownership_uncertain",
    });
  }

  if (confidence === "low") {
    prompts.push({
      id: "verify_low_confidence",
      prompt: "Do these priorities match what changed this morning, or should we re-rank after a data refresh?",
      reason: "low_confidence",
    });
  }

  if (assumptions.some((assumption) => assumption.reason === "missing_data")) {
    prompts.push({
      id: "verify_missing_context",
      prompt: "Which missing source should be connected first to improve ranking confidence?",
      reason: "missing_context",
    });
  }

  if (assumptions.some((assumption) => assumption.reason === "stale_data")) {
    prompts.push({
      id: "verify_stale_data",
      prompt: "Should we refresh stale sources before executing rank #1?",
      reason: "conflicting_signals",
    });
  }

  return prompts.slice(0, 6);
}

function buildFallbackWeeklyCheckin(
  priorities: MorningBriefPriorityItem[],
  assumptions: Assumption[],
  confidence: "low" | "medium" | "high"
): MorningBriefWeeklyCheckinPrep {
  const bullets = priorities.map(
    (priority) => `${priority.rank}. ${priority.title} - ${priority.recommendation}`
  );
  const gaps = assumptions
    .filter((assumption) => assumption.reason === "missing_data" || assumption.reason === "conflict")
    .map((assumption) => assumption.text);

  return {
    ready: confidence !== "low" && bullets.length > 0,
    bullets,
    gaps,
  };
}

function buildSourceReadiness(
  input: BuildMorningBriefInput,
  evidence: EvidenceItem[]
): MorningBriefSourceReadiness[] {
  const supportedSources: MorningBriefDataSource[] = ["github", "slack", "posthog", "vercel"];

  return supportedSources
    .filter((source) => input.requestedSources[source])
    .map((source) => {
      const sourceEvidence = evidence.filter((item) => item.source === source);
      const freshest = sourceEvidence.length
        ? Math.min(...sourceEvidence.map((item) => item.freshnessMinutes))
        : undefined;
      const error = input.sourceErrors[source];
      return {
        source,
        available: !error,
        ...(typeof freshest === "number" ? { freshnessMinutes: freshest } : {}),
        ...(error ? { error } : {}),
      };
    });
}

function buildActionDirectory(
  input: BuildMorningBriefInput,
  readiness: MorningBriefSourceReadiness[]
): MorningBriefActionDirectory {
  const actionMap: Record<MorningBriefDataSource, string[]> = {
    github: ["open_pull_request", "open_issue", "triage_queue"],
    slack: ["open_thread", "draft_update", "resolve_blocker"],
    posthog: ["inspect_top_pages", "review_site_health"],
    vercel: ["inspect_deployment", "check_logs"],
    custom: ["manual"],
  };
  const setupMap: Record<
    MorningBriefDataSource,
    { missingAction: string; value: string; setupHint: string }
  > = {
    github: {
      missingAction: "connect_github",
      value: "Repository signal ingestion",
      setupHint: "Connect GitHub and select at least one active repository.",
    },
    slack: {
      missingAction: "connect_slack",
      value: "Blocker and stakeholder signal ingestion",
      setupHint: "Connect Slack bot/user tokens for mentions or channel activity.",
    },
    posthog: {
      missingAction: "connect_posthog",
      value: "Behavior and traffic impact signal ingestion",
      setupHint: "Connect PostHog and set a host/property filter for priority traffic paths.",
    },
    vercel: {
      missingAction: "connect_vercel",
      value: "Deployment risk signal ingestion",
      setupHint: "Connect Vercel and select the primary project to monitor.",
    },
    custom: {
      missingAction: "review_integrations",
      value: "General integration health",
      setupHint: "Inspect integration errors and re-run the brief.",
    },
  };

  const availableNow = readiness
    .filter((entry) => entry.available)
    .map((entry) => ({
      app: entry.source,
      actions: actionMap[entry.source] ?? ["manual"],
    }));

  const suggestedSetup = readiness
    .filter((entry) => !entry.available)
    .map((entry) => ({
      app: entry.source,
      ...setupMap[entry.source],
    }));

  if (input.requestedSources.posthog && !readiness.some((entry) => entry.source === "posthog")) {
    suggestedSetup.push({
      app: "posthog",
      ...setupMap.posthog,
    });
  }

  return {
    availableNow,
    suggestedSetup,
  };
}

function buildFreshnessSummary(evidence: EvidenceItem[]): string {
  if (evidence.length === 0) {
    return "No evidence captured.";
  }

  const freshest = Math.min(...evidence.map((item) => item.freshnessMinutes));
  const stalest = Math.max(...evidence.map((item) => item.freshnessMinutes));
  const staleCount = evidence.filter((item) => item.freshnessMinutes > EVIDENCE_STALE_MINUTES).length;
  return `Freshness range ${freshest}-${stalest} minutes; stale items ${staleCount}.`;
}

function freshnessMinutes(timestamp: number | undefined, now: number): number {
  if (!Number.isFinite(timestamp)) return EVIDENCE_STALE_MINUTES + 1;
  return Math.max(0, Math.round((now - Number(timestamp)) / 60000));
}

function toIso(timestamp: number | undefined): string {
  if (!Number.isFinite(timestamp)) {
    return new Date().toISOString();
  }
  return new Date(Number(timestamp)).toISOString();
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildDerivedSignals(input: {
  prs: number;
  issues: number;
  deployments: VercelDeploymentData[];
  slack: number;
  repoStats: Array<{ repo: string; prs: number; issues: number }>;
  posthogVisitors: number;
  posthogTopPage?: string;
}): string[] {
  const signals: string[] = [];
  const deploymentErrors = input.deployments.filter((d) => d.state === "ERROR").length;
  if (deploymentErrors > 0 && input.prs > 0) {
    signals.push("Deployment errors occurred while PRs await review.");
  }
  if (input.slack > 0 && input.prs > 0) {
    signals.push("Slack mentions are up while PR reviews are pending.");
  }
  if (input.posthogVisitors > 0 && deploymentErrors > 0) {
    signals.push("Product traffic remains active while deployments report errors.");
  }
  if (input.posthogTopPage) {
    signals.push(`Top attention page in PostHog: ${input.posthogTopPage}.`);
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
