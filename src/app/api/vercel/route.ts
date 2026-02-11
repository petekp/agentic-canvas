// vercel/route.ts
//
// Server-side proxy for Vercel API requests.
//
// WHY SERVER-SIDE: The Vercel token stays here, never exposed to the browser.
// This also lets us add caching, rate limit handling, and data transformation
// without bloating the client bundle.
//
// API DOCS: https://vercel.com/docs/rest-api
//
// CACHING: TTL values are returned with each response. The client can use
// these to avoid redundant requests.

import { NextRequest } from "next/server";
import { appendTelemetry } from "@/lib/telemetry";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_API = "https://api.vercel.com";

// Default team/project - can be overridden via params
const DEFAULT_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const DEFAULT_TEAM_ID = process.env.VERCEL_TEAM_ID;

interface VercelRequest {
  type: "deployments" | "project_info" | "deployment_events" | "project_list";
  params: {
    projectId?: string;
    teamId?: string;
    deploymentId?: string;
    limit?: number;
    state?: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
  };
}

export async function POST(req: NextRequest) {
  if (!VERCEL_TOKEN) {
    return Response.json(
      { error: "VERCEL_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const { type, params }: VercelRequest = await req.json();

    await appendTelemetry({
      level: "info",
      source: "api.vercel",
      event: "request",
      data: {
        type,
        params: {
          projectId: params.projectId,
          teamId: params.teamId,
          deploymentId: params.deploymentId,
          limit: params.limit,
          state: params.state,
        },
      },
    });

    const headers: HeadersInit = {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    };

    let data: unknown;
    let ttl = 60000; // Default 1 minute cache

    switch (type) {
      case "deployments":
        data = await fetchDeployments(params, headers);
        ttl = 30000; // 30 second cache for deployments
        break;
      case "project_info":
        data = await fetchProjectInfo(params, headers);
        ttl = 120000; // 2 minute cache for project info
        break;
      case "deployment_events":
        data = await fetchDeploymentEvents(params, headers);
        ttl = 15000; // 15 second cache for events (they change frequently)
        break;
      case "project_list":
        data = await fetchProjectList(params, headers);
        ttl = 300000; // 5 minute cache
        break;
      default:
        return Response.json({ error: "Unknown query type" }, { status: 400 });
    }

    return Response.json({
      data,
      ttl,
      ...(!DEFAULT_PROJECT_ID && {
        warning: "VERCEL_PROJECT_ID not configured. Results may include deployments from all projects.",
      }),
    });
  } catch (error) {
    console.error("Vercel API error:", error);
    if (error instanceof VercelApiError && (error.status === 401 || error.status === 403)) {
      await appendTelemetry({
        level: "error",
        source: "api.vercel",
        event: "auth_error",
        data: { error: error.message, status: error.status },
      });
      return Response.json({ error: error.message }, { status: error.status });
    }

    await appendTelemetry({
      level: "error",
      source: "api.vercel",
      event: "error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Vercel API error" },
      { status: 500 }
    );
  }
}

/**
 * Fetches project list for picker UI
 */
async function fetchProjectList(
  params: VercelRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 20;
  const teamId = params.teamId ?? DEFAULT_TEAM_ID;

  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(limit));
  if (teamId) searchParams.set("teamId", teamId);

  const res = await fetch(
    `${VERCEL_API}/v9/projects?${searchParams.toString()}`,
    { headers }
  );

  await ensureSuccess(res);

  const response = await res.json();
  const projects = response.projects ?? [];

  return projects.map((project: { id: string; name: string; framework?: string; teamId?: string; accountId?: string }) => {
    const rawTeamId = project.teamId ?? project.accountId;
    const teamId = typeof rawTeamId === "string" && rawTeamId.startsWith("team_")
      ? rawTeamId
      : undefined;
    return {
      id: project.id,
      name: project.name,
      framework: project.framework ?? "other",
      ...(teamId ? { teamId } : {}),
    };
  });
}

/**
 * Fetches recent deployments for a project
 */
async function fetchDeployments(
  params: VercelRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 10;
  const projectId = params.projectId ?? DEFAULT_PROJECT_ID;
  const teamId = params.teamId ?? DEFAULT_TEAM_ID;

  const searchParams = new URLSearchParams();
  if (projectId) searchParams.set("projectId", projectId);
  if (teamId) searchParams.set("teamId", teamId);
  if (params.state) searchParams.set("state", params.state);
  searchParams.set("limit", String(limit));

  const res = await fetch(
    `${VERCEL_API}/v6/deployments?${searchParams.toString()}`,
    { headers }
  );

  await ensureSuccess(res);

  const response = await res.json();
  const deployments = response.deployments ?? [];

  return deployments.map((d: {
    uid: string;
    name: string;
    url: string;
    state: string;
    readyState?: string;
    created: number;
    createdAt?: number;
    buildingAt?: number;
    ready?: number;
    meta?: {
      githubCommitSha?: string;
      githubCommitMessage?: string;
      githubCommitRef?: string;
      githubCommitAuthorLogin?: string;
    };
    creator?: {
      username?: string;
      email?: string;
    };
    target?: string | null;
    inspectorUrl?: string;
  }) => ({
    id: d.uid,
    name: d.name,
    url: d.url ? `https://${d.url}` : null,
    state: d.readyState ?? d.state,
    createdAt: d.createdAt ?? d.created,
    buildingAt: d.buildingAt,
    readyAt: d.ready,
    target: d.target ?? "preview",
    inspectorUrl: d.inspectorUrl,
    commit: d.meta?.githubCommitSha ? {
      sha: d.meta.githubCommitSha.slice(0, 7),
      message: d.meta.githubCommitMessage ?? "",
      ref: d.meta.githubCommitRef ?? "",
      author: d.meta.githubCommitAuthorLogin ?? "",
    } : null,
    creator: d.creator?.username ?? d.creator?.email ?? "unknown",
  }));
}

/**
 * Fetches project information
 */
async function fetchProjectInfo(
  params: VercelRequest["params"],
  headers: HeadersInit
) {
  const projectId = params.projectId ?? DEFAULT_PROJECT_ID;
  const teamId = params.teamId ?? DEFAULT_TEAM_ID;

  if (!projectId) {
    throw new Error("projectId is required for project_info query");
  }

  const searchParams = new URLSearchParams();
  if (teamId) searchParams.set("teamId", teamId);

  const res = await fetch(
    `${VERCEL_API}/v9/projects/${projectId}?${searchParams.toString()}`,
    { headers }
  );

  await ensureSuccess(res);

  const project = await res.json();

  // Fetch latest deployment status
  const deploymentsRes = await fetch(
    `${VERCEL_API}/v6/deployments?projectId=${projectId}${teamId ? `&teamId=${teamId}` : ""}&limit=1&target=production`,
    { headers }
  );

  let latestProduction = null;
  if (deploymentsRes.ok) {
    const deploymentsData = await deploymentsRes.json();
    const deployments = deploymentsData.deployments ?? [];
    if (deployments.length > 0) {
      const d = deployments[0];
      latestProduction = {
        id: d.uid,
        url: d.url ? `https://${d.url}` : null,
        state: d.readyState ?? d.state,
        createdAt: d.createdAt ?? d.created,
      };
    }
  }

  return {
    id: project.id,
    name: project.name,
    framework: project.framework ?? "other",
    nodeVersion: project.nodeVersion,
    buildCommand: project.buildCommand,
    outputDirectory: project.outputDirectory,
    rootDirectory: project.rootDirectory,
    link: project.link ? {
      type: project.link.type,
      repo: project.link.repo,
      repoId: project.link.repoId,
      org: project.link.org,
    } : null,
    latestProduction,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
  };
}

/**
 * Fetches deployment events/logs for a specific deployment
 */
async function fetchDeploymentEvents(
  params: VercelRequest["params"],
  headers: HeadersInit
) {
  const deploymentId = params.deploymentId;
  const teamId = params.teamId ?? DEFAULT_TEAM_ID;

  if (!deploymentId) {
    throw new Error("deploymentId is required for deployment_events query");
  }

  const searchParams = new URLSearchParams();
  if (teamId) searchParams.set("teamId", teamId);

  // Fetch deployment details first
  const deploymentRes = await fetch(
    `${VERCEL_API}/v13/deployments/${deploymentId}?${searchParams.toString()}`,
    { headers }
  );

  await ensureSuccess(deploymentRes);

  const deployment = await deploymentRes.json();

  // Fetch build logs/events
  const eventsRes = await fetch(
    `${VERCEL_API}/v2/deployments/${deploymentId}/events?${searchParams.toString()}`,
    { headers }
  );

  let events: Array<{
    id: string;
    type: string;
    text: string;
    timestamp: number;
  }> = [];

  if (eventsRes.ok) {
    const eventsData = await eventsRes.json();
    events = (eventsData ?? []).map((e: {
      id?: string;
      type?: string;
      text?: string;
      payload?: { text?: string };
      created?: number;
      date?: number;
    }) => ({
      id: e.id ?? String(e.created ?? e.date ?? Date.now()),
      type: e.type ?? "log",
      text: e.text ?? e.payload?.text ?? "",
      timestamp: e.created ?? e.date ?? Date.now(),
    }));
  }

  return {
    id: deployment.id,
    name: deployment.name,
    url: deployment.url ? `https://${deployment.url}` : null,
    state: deployment.readyState ?? deployment.state,
    target: deployment.target ?? "preview",
    createdAt: deployment.createdAt ?? deployment.created,
    buildingAt: deployment.buildingAt,
    readyAt: deployment.ready,
    errorCode: deployment.errorCode,
    errorMessage: deployment.errorMessage,
    events: events.slice(-50), // Last 50 events
  };
}

class VercelApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "VercelApiError";
  }
}

async function ensureSuccess(res: Response) {
  if (res.ok) {
    return;
  }

  const text = await res.text();
  let message = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error?.message) {
      message = parsed.error.message;
    } else if (parsed?.message) {
      message = parsed.message;
    }
  } catch {
    // ignore
  }

  throw new VercelApiError(res.status, `Vercel API error: ${res.status} - ${message}`);
}
