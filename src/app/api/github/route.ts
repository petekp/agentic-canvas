// GitHub API Route - fetches real data from GitHub
// Keeps token server-side for security

import { NextRequest } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API = "https://api.github.com";

// Default repo if none specified
const DEFAULT_REPO = "assistant-ui/assistant-ui";

interface GitHubRequest {
  type: "pull_requests" | "issues" | "stats" | "activity";
  params: {
    repo?: string;
    limit?: number;
    metric?: string;
    state?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const { type, params }: GitHubRequest = await req.json();
    const repo = params.repo || DEFAULT_REPO;

    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agentic-canvas",
    };

    if (GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }

    let data: unknown;
    let ttl = 60000; // Default 1 minute cache

    switch (type) {
      case "pull_requests":
        data = await fetchPullRequests(repo, params, headers);
        break;
      case "issues":
        data = await fetchIssues(repo, params, headers);
        break;
      case "stats":
        data = await fetchStats(repo, params, headers);
        ttl = 30000; // 30 second cache for stats
        break;
      case "activity":
        data = await fetchActivity(repo, params, headers);
        ttl = 30000;
        break;
      default:
        return Response.json({ error: "Unknown query type" }, { status: 400 });
    }

    return Response.json({ data, ttl });
  } catch (error) {
    console.error("GitHub API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "GitHub API error" },
      { status: 500 }
    );
  }
}

async function fetchPullRequests(
  repo: string,
  params: GitHubRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 5;
  const state = params.state ?? "open";

  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/pulls?state=${state}&per_page=${limit}&sort=updated`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const prs = await res.json();

  return prs.map((pr: {
    id: number;
    number: number;
    title: string;
    user: { login: string };
    state: string;
    merged_at: string | null;
    created_at: string;
    updated_at: string;
    labels: Array<{ name: string }>;
  }) => ({
    id: `pr_${pr.id}`,
    number: pr.number,
    title: pr.title,
    author: pr.user.login,
    state: pr.merged_at ? "merged" : pr.state,
    createdAt: new Date(pr.created_at).getTime(),
    updatedAt: new Date(pr.updated_at).getTime(),
    labels: pr.labels.map((l) => l.name),
  }));
}

async function fetchIssues(
  repo: string,
  params: GitHubRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 10;
  const state = params.state ?? "open";

  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/issues?state=${state}&per_page=${limit}&sort=updated`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const issues = await res.json();

  // Filter out pull requests (GitHub API returns PRs in issues endpoint)
  return issues
    .filter((issue: { pull_request?: unknown }) => !issue.pull_request)
    .map((issue: {
      id: number;
      number: number;
      title: string;
      user: { login: string };
      state: string;
      labels: Array<{ name: string }>;
      created_at: string;
    }) => ({
      id: `issue_${issue.id}`,
      number: issue.number,
      title: issue.title,
      author: issue.user.login,
      state: issue.state,
      labels: issue.labels.map((l) => l.name),
      createdAt: new Date(issue.created_at).getTime(),
    }));
}

async function fetchStats(
  repo: string,
  params: GitHubRequest["params"],
  headers: HeadersInit
) {
  const metric = params.metric ?? "open_prs";

  // Fetch repo info for stars/forks
  const repoRes = await fetch(`${GITHUB_API}/repos/${repo}`, { headers });
  if (!repoRes.ok) {
    throw new Error(`GitHub API error: ${repoRes.status} ${repoRes.statusText}`);
  }
  const repoData = await repoRes.json();

  // For PR/issue counts, we need separate calls
  let value = 0;
  let trend = 0;
  let sparkline: number[] | undefined;

  switch (metric) {
    case "open_prs": {
      // Use search API to get accurate count
      const openPrs = await fetch(
        `${GITHUB_API}/search/issues?q=repo:${repo}+type:pr+state:open`,
        { headers }
      );
      const openPrsData = await openPrs.json();
      value = openPrsData.total_count ?? 0;
      // Generate sparkline from recent PR activity
      sparkline = await generatePRSparkline(repo, headers);
      break;
    }
    case "closed_prs": {
      const closedPrs = await fetch(
        `${GITHUB_API}/search/issues?q=repo:${repo}+type:pr+state:closed`,
        { headers }
      );
      const closedPrsData = await closedPrs.json();
      value = closedPrsData.total_count ?? 0;
      break;
    }
    case "open_issues": {
      value = repoData.open_issues_count ?? 0;
      break;
    }
    case "stars": {
      value = repoData.stargazers_count ?? 0;
      // Get star history from stargazers if available
      sparkline = await generateStarSparkline(repo, headers, value);
      break;
    }
    case "forks": {
      value = repoData.forks_count ?? 0;
      break;
    }
    case "watchers": {
      value = repoData.subscribers_count ?? 0;
      break;
    }
    default:
      value = 0;
  }

  return { value, trend, sparkline };
}

// Generate sparkline data from recent PR activity (last 7 days)
async function generatePRSparkline(
  repo: string,
  headers: HeadersInit
): Promise<number[]> {
  try {
    // Fetch recent PRs to build activity trend
    const res = await fetch(
      `${GITHUB_API}/repos/${repo}/pulls?state=all&per_page=100&sort=created&direction=desc`,
      { headers }
    );
    if (!res.ok) return [];

    const prs = await res.json();

    // Count PRs created per day over last 7 days
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const counts: number[] = Array(7).fill(0);

    for (const pr of prs) {
      const created = new Date(pr.created_at).getTime();
      const daysAgo = Math.floor((now - created) / dayMs);
      if (daysAgo >= 0 && daysAgo < 7) {
        counts[6 - daysAgo]++; // Oldest first
      }
    }

    return counts;
  } catch {
    return [];
  }
}

// Generate sparkline for stars (using commit activity as proxy for repo health)
async function generateStarSparkline(
  repo: string,
  headers: HeadersInit,
  _currentStars: number
): Promise<number[]> {
  try {
    // Fetch commit activity as a proxy for repo activity/growth
    const res = await fetch(
      `${GITHUB_API}/repos/${repo}/stats/commit_activity`,
      { headers }
    );
    if (!res.ok) return [];

    const weeks = await res.json();
    if (!Array.isArray(weeks) || weeks.length === 0) return [];

    // Use last 8 weeks of commit totals as sparkline
    const recentWeeks = weeks.slice(-8);
    return recentWeeks.map((w: { total: number }) => w.total);
  } catch {
    return [];
  }
}

async function fetchActivity(
  repo: string,
  params: GitHubRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 10;

  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/events?per_page=${limit}`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const events = await res.json();

  const typeMap: Record<string, string> = {
    PushEvent: "push",
    PullRequestEvent: "pr",
    IssuesEvent: "issue",
    IssueCommentEvent: "comment",
    CreateEvent: "release",
    ReleaseEvent: "release",
    WatchEvent: "star",
    ForkEvent: "fork",
  };

  return events.map((event: {
    id: string;
    type: string;
    actor: { login: string };
    payload: {
      action?: string;
      commits?: Array<{ message: string }>;
      pull_request?: { title: string };
      issue?: { title: string };
      ref?: string;
      ref_type?: string;
    };
    created_at: string;
  }) => {
    let message = `${event.type}`;

    // Build a more descriptive message
    switch (event.type) {
      case "PushEvent":
        const commits = event.payload.commits?.length ?? 0;
        message = `Pushed ${commits} commit${commits !== 1 ? "s" : ""}`;
        break;
      case "PullRequestEvent":
        message = `${event.payload.action} PR: ${event.payload.pull_request?.title ?? ""}`;
        break;
      case "IssuesEvent":
        message = `${event.payload.action} issue: ${event.payload.issue?.title ?? ""}`;
        break;
      case "IssueCommentEvent":
        message = `Commented on: ${event.payload.issue?.title ?? ""}`;
        break;
      case "CreateEvent":
        message = `Created ${event.payload.ref_type}: ${event.payload.ref ?? ""}`;
        break;
      case "WatchEvent":
        message = "Starred the repo";
        break;
      case "ForkEvent":
        message = "Forked the repo";
        break;
    }

    return {
      id: event.id,
      type: typeMap[event.type] ?? "other",
      actor: event.actor.login,
      message,
      timestamp: new Date(event.created_at).getTime(),
    };
  });
}
