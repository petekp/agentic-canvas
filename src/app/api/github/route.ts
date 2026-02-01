// GitHub API Route - fetches real data from GitHub
// Keeps token server-side for security

import { NextRequest } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_API = "https://api.github.com";

// Default repo if none specified
const DEFAULT_REPO = "assistant-ui/assistant-ui";

// Filter types for personal views
type PRFilter = "all" | "authored" | "review_requested";
type IssueFilter = "all" | "assigned" | "mentioned" | "created";

interface GitHubRequest {
  type: "pull_requests" | "issues" | "stats" | "activity" | "my_activity" | "commits" | "team_activity";
  params: {
    repo?: string;
    repos?: string[];
    orgs?: string[];
    limit?: number;
    metric?: string;
    state?: string;
    timeWindow?: "7d" | "14d" | "30d";
    feedLimit?: number;
    filter?: PRFilter | IssueFilter;
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
      case "my_activity":
        data = await fetchMyActivity(params, headers);
        ttl = 60000; // 1 minute cache
        break;
      case "commits":
        data = await fetchCommits(repo, params, headers);
        ttl = 60000;
        break;
      case "team_activity":
        data = await fetchTeamActivity(repo, params, headers);
        ttl = 120000; // 2 minute cache
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
  const filter = (params.filter as PRFilter) ?? "all";

  // Use search API for filtered queries, regular API for "all"
  if (filter !== "all" && GITHUB_USERNAME) {
    return fetchFilteredPullRequests(repo, filter, state, limit, headers);
  }

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

// Use GitHub Search API for personal PR filters
async function fetchFilteredPullRequests(
  repo: string,
  filter: PRFilter,
  state: string,
  limit: number,
  headers: HeadersInit
) {
  // Build search query parts (joined with spaces, then URL encoded)
  const parts: string[] = [`repo:${repo}`, "is:pr"];

  // Add state filter
  if (state === "open") {
    parts.push("is:open");
  } else if (state === "closed") {
    parts.push("is:closed");
  }

  // Add user filter
  switch (filter) {
    case "authored":
      parts.push(`author:${GITHUB_USERNAME}`);
      break;
    case "review_requested":
      parts.push(`review-requested:${GITHUB_USERNAME}`);
      break;
  }

  const q = parts.join(" ");
  const res = await fetch(
    `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=${limit}&sort=updated`,
    { headers }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub Search API error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  const items = data.items ?? [];

  return items.map((pr: {
    id: number;
    number: number;
    title: string;
    user: { login: string };
    state: string;
    pull_request?: { merged_at: string | null };
    created_at: string;
    updated_at: string;
    labels: Array<{ name: string }>;
  }) => ({
    id: `pr_${pr.id}`,
    number: pr.number,
    title: pr.title,
    author: pr.user.login,
    state: pr.pull_request?.merged_at ? "merged" : pr.state,
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
  const filter = (params.filter as IssueFilter) ?? "all";

  // Use search API for filtered queries, regular API for "all"
  if (filter !== "all" && GITHUB_USERNAME) {
    return fetchFilteredIssues(repo, filter, state, limit, headers);
  }

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

// Use GitHub Search API for personal issue filters
async function fetchFilteredIssues(
  repo: string,
  filter: IssueFilter,
  state: string,
  limit: number,
  headers: HeadersInit
) {
  // Build search query parts - explicitly exclude PRs
  const parts: string[] = [`repo:${repo}`, "is:issue"];

  // Add state filter
  if (state === "open") {
    parts.push("is:open");
  } else if (state === "closed") {
    parts.push("is:closed");
  }

  // Add user filter
  switch (filter) {
    case "assigned":
      parts.push(`assignee:${GITHUB_USERNAME}`);
      break;
    case "mentioned":
      parts.push(`involves:${GITHUB_USERNAME}`);
      break;
    case "created":
      parts.push(`author:${GITHUB_USERNAME}`);
      break;
  }

  const q = parts.join(" ");
  const res = await fetch(
    `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=${limit}&sort=updated`,
    { headers }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub Search API error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  const items = data.items ?? [];

  return items.map((issue: {
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
    PullRequestReviewEvent: "pr",
    PullRequestReviewCommentEvent: "comment",
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
      review?: { body: string };
      comment?: { body: string };
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
      case "PullRequestReviewEvent": {
        const prTitle = event.payload.pull_request?.title;
        const action = event.payload.action ?? "reviewed";
        message = prTitle ? `${action} review on: ${prTitle}` : `${action} a PR review`;
        break;
      }
      case "PullRequestReviewCommentEvent": {
        const prTitle2 = event.payload.pull_request?.title;
        message = prTitle2 ? `Commented on PR: ${prTitle2}` : "Commented on a PR";
        break;
      }
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

async function fetchMyActivity(
  params: GitHubRequest["params"],
  headers: HeadersInit
) {
  const timeWindow = params.timeWindow ?? "7d";
  const feedLimit = params.feedLimit ?? 10;
  const repos = params.repos ?? [];
  const orgs = params.orgs ?? [];

  // Calculate time window in milliseconds
  const windowDays = parseInt(timeWindow.replace("d", ""), 10);
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - windowMs;

  // Fetch authenticated user info
  const userRes = await fetch(`${GITHUB_API}/user`, { headers });
  if (!userRes.ok) {
    throw new Error(`GitHub API error: ${userRes.status} - Need authenticated user for my_activity`);
  }
  const user = await userRes.json();
  const username = user.login;

  // Fetch user's events (up to 300 to get good coverage)
  const eventsRes = await fetch(
    `${GITHUB_API}/users/${username}/events?per_page=100`,
    { headers }
  );
  if (!eventsRes.ok) {
    throw new Error(`GitHub API error: ${eventsRes.status} ${eventsRes.statusText}`);
  }

  const allEvents = await eventsRes.json();

  // Filter events by time window and optionally by repos/orgs
  const filteredEvents = allEvents.filter((event: {
    created_at: string;
    repo?: { name: string };
    org?: { login: string };
  }) => {
    const eventTime = new Date(event.created_at).getTime();
    if (eventTime < cutoffTime) return false;

    // Filter by repos if specified
    if (repos.length > 0 && event.repo) {
      if (!repos.some((r) => event.repo?.name.includes(r))) return false;
    }

    // Filter by orgs if specified
    if (orgs.length > 0) {
      const eventOrg = event.org?.login || event.repo?.name.split("/")[0];
      if (!orgs.includes(eventOrg ?? "")) return false;
    }

    return true;
  });

  // Aggregate stats
  const stats = {
    prsOpened: 0,
    prsMerged: 0,
    commits: 0,
    reviews: 0,
    issuesOpened: 0,
    comments: 0,
  };

  // Build daily activity counts for sparkline
  const dailyCounts: Record<string, number> = {};
  for (let i = 0; i < windowDays; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().split("T")[0];
    dailyCounts[key] = 0;
  }

  // Process events for stats and daily counts
  for (const event of filteredEvents) {
    const eventDate = new Date(event.created_at).toISOString().split("T")[0];
    if (dailyCounts[eventDate] !== undefined) {
      dailyCounts[eventDate]++;
    }

    switch (event.type) {
      case "PullRequestEvent":
        if (event.payload?.action === "opened") stats.prsOpened++;
        if (event.payload?.action === "closed" && event.payload?.pull_request?.merged) {
          stats.prsMerged++;
        }
        break;
      case "PushEvent":
        stats.commits += event.payload?.commits?.length ?? 0;
        break;
      case "PullRequestReviewEvent":
        stats.reviews++;
        break;
      case "IssuesEvent":
        if (event.payload?.action === "opened") stats.issuesOpened++;
        break;
      case "IssueCommentEvent":
      case "PullRequestReviewCommentEvent":
        stats.comments++;
        break;
    }
  }

  // Convert daily counts to sparkline array (oldest first)
  const daily = Object.entries(dailyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // Build feed from recent events
  const typeMap: Record<string, string> = {
    PushEvent: "commit",
    PullRequestEvent: "pr",
    PullRequestReviewEvent: "review",
    PullRequestReviewCommentEvent: "comment",
    IssuesEvent: "issue",
    IssueCommentEvent: "comment",
    CreateEvent: "create",
    ReleaseEvent: "release",
  };

  const feed = filteredEvents.slice(0, feedLimit).map((event: {
    id: string;
    type: string;
    repo: { name: string };
    payload: {
      action?: string;
      commits?: Array<{ message: string }>;
      pull_request?: { title: string; number: number; merged?: boolean };
      review?: { state: string };
      issue?: { title: string; number: number };
      ref?: string;
      ref_type?: string;
    };
    created_at: string;
  }) => {
    let message = event.type;
    let url: string | undefined;

    switch (event.type) {
      case "PushEvent": {
        const commitCount = event.payload.commits?.length ?? 0;
        message = `Pushed ${commitCount} commit${commitCount !== 1 ? "s" : ""} to ${event.repo.name}`;
        url = `https://github.com/${event.repo.name}`;
        break;
      }
      case "PullRequestEvent": {
        const pr = event.payload.pull_request;
        const action = event.payload.action;
        message = `${action === "closed" && pr?.merged ? "Merged" : action} PR #${pr?.number}: ${pr?.title}`;
        url = `https://github.com/${event.repo.name}/pull/${pr?.number}`;
        break;
      }
      case "PullRequestReviewEvent": {
        const pr = event.payload.pull_request;
        const state = event.payload.review?.state ?? "reviewed";
        message = `${state} PR #${pr?.number}: ${pr?.title}`;
        url = `https://github.com/${event.repo.name}/pull/${pr?.number}`;
        break;
      }
      case "IssuesEvent": {
        const issue = event.payload.issue;
        message = `${event.payload.action} issue #${issue?.number}: ${issue?.title}`;
        url = `https://github.com/${event.repo.name}/issues/${issue?.number}`;
        break;
      }
      case "IssueCommentEvent": {
        const issue = event.payload.issue;
        message = `Commented on #${issue?.number}: ${issue?.title}`;
        url = `https://github.com/${event.repo.name}/issues/${issue?.number}`;
        break;
      }
      case "CreateEvent": {
        message = `Created ${event.payload.ref_type}: ${event.payload.ref ?? event.repo.name}`;
        url = `https://github.com/${event.repo.name}`;
        break;
      }
    }

    return {
      id: event.id,
      type: typeMap[event.type] ?? "other",
      repo: event.repo.name,
      message,
      url,
      timestamp: new Date(event.created_at).getTime(),
    };
  });

  return {
    username,
    timeWindow,
    stats,
    daily,
    feed,
  };
}

async function fetchCommits(
  repo: string,
  params: GitHubRequest["params"],
  headers: HeadersInit
) {
  const limit = params.limit ?? 30;
  const timeWindow = params.timeWindow ?? "7d";

  // Calculate date for since parameter
  const windowDays = parseInt(timeWindow.replace("d", ""), 10);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/commits?per_page=${limit}&since=${since}`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const commits = await res.json();

  return commits.map((commit: {
    sha: string;
    commit: {
      message: string;
      author: { name: string; date: string };
    };
    author?: { login: string; avatar_url: string };
    html_url: string;
    stats?: { additions: number; deletions: number };
  }) => ({
    sha: commit.sha.slice(0, 7),
    message: commit.commit.message.split("\n")[0], // First line only
    author: commit.author?.login ?? commit.commit.author.name,
    authorAvatar: commit.author?.avatar_url,
    timestamp: new Date(commit.commit.author.date).getTime(),
    url: commit.html_url,
  }));
}

async function fetchTeamActivity(
  repo: string,
  params: GitHubRequest["params"],
  headers: HeadersInit
) {
  const timeWindow = params.timeWindow ?? "7d";
  const windowDays = parseInt(timeWindow.replace("d", ""), 10);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // Fetch commits to analyze team activity
  const commitsRes = await fetch(
    `${GITHUB_API}/repos/${repo}/commits?per_page=100&since=${since}`,
    { headers }
  );

  if (!commitsRes.ok) {
    throw new Error(`GitHub API error: ${commitsRes.status} ${commitsRes.statusText}`);
  }

  const commits = await commitsRes.json();

  // Group commits by author and extract themes
  const authorStats: Record<string, {
    login: string;
    avatar: string;
    commits: number;
    messages: string[];
    lastActive: number;
  }> = {};

  for (const commit of commits) {
    const login = commit.author?.login ?? commit.commit.author.name;
    const avatar = commit.author?.avatar_url ?? "";
    const message = commit.commit.message.split("\n")[0];
    const timestamp = new Date(commit.commit.author.date).getTime();

    if (!authorStats[login]) {
      authorStats[login] = {
        login,
        avatar,
        commits: 0,
        messages: [],
        lastActive: 0,
      };
    }

    authorStats[login].commits++;
    authorStats[login].messages.push(message);
    authorStats[login].lastActive = Math.max(authorStats[login].lastActive, timestamp);
  }

  // Convert to array and sort by commit count
  const contributors = Object.values(authorStats)
    .sort((a, b) => b.commits - a.commits)
    .map((author) => {
      // Extract work themes from commit messages
      const themes = extractWorkThemes(author.messages);
      return {
        login: author.login,
        avatar: author.avatar,
        commits: author.commits,
        lastActive: author.lastActive,
        themes,
        recentCommits: author.messages.slice(0, 5),
      };
    });

  // Daily activity for sparkline
  const dailyActivity: Record<string, number> = {};
  for (let i = 0; i < windowDays; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().split("T")[0];
    dailyActivity[key] = 0;
  }

  for (const commit of commits) {
    const date = new Date(commit.commit.author.date).toISOString().split("T")[0];
    if (dailyActivity[date] !== undefined) {
      dailyActivity[date]++;
    }
  }

  const daily = Object.entries(dailyActivity)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return {
    repo,
    timeWindow,
    totalCommits: commits.length,
    contributors,
    daily,
  };
}

// Extract work themes from commit messages using common patterns
function extractWorkThemes(messages: string[]): string[] {
  const themes: Record<string, number> = {};

  const patterns: [RegExp, string][] = [
    [/\bfix(es|ed|ing)?\b/i, "bug fixes"],
    [/\bfeat(ure)?s?\b/i, "features"],
    [/\brefactor(s|ed|ing)?\b/i, "refactoring"],
    [/\bdocs?\b/i, "documentation"],
    [/\btest(s|ing)?\b/i, "testing"],
    [/\bstyle\b/i, "styling"],
    [/\bperf(ormance)?\b/i, "performance"],
    [/\bbuild\b/i, "build"],
    [/\bci\b/i, "CI/CD"],
    [/\bchore\b/i, "maintenance"],
    [/\badd(s|ed|ing)?\b/i, "additions"],
    [/\bremove[ds]?\b|delet(e[ds]?|ing)\b/i, "cleanup"],
    [/\bupdat(e[ds]?|ing)\b/i, "updates"],
    [/\bupgrad(e[ds]?|ing)\b/i, "upgrades"],
    [/\bapi\b/i, "API work"],
    [/\bui\b|\bux\b|\bfrontend\b/i, "UI/UX"],
    [/\bdb\b|\bdatabase\b|\bmigrat/i, "database"],
    [/\bauth\b|\blogin\b|\bsession\b/i, "authentication"],
  ];

  for (const msg of messages) {
    for (const [pattern, theme] of patterns) {
      if (pattern.test(msg)) {
        themes[theme] = (themes[theme] ?? 0) + 1;
      }
    }
  }

  // Return top 3 themes
  return Object.entries(themes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([theme]) => theme);
}
