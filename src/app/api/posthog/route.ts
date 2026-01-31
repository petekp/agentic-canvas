// PostHog API Route - fetches analytics data from PostHog
// Uses HogQL Query API (legacy insights endpoints are deprecated)
// Keeps API key server-side for security

import { NextRequest } from "next/server";

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_API = "https://us.posthog.com/api";

// ============================================================================
// Types
// ============================================================================

interface PostHogRequest {
  type: "site_health" | "property_breakdown" | "top_pages";
  params: {
    timeWindow?: "7d" | "14d" | "30d";
    properties?: string[];
    metric?: "visitors" | "pageviews";
    limit?: number;
    property?: string;
  };
}

interface HogQLResult {
  columns: string[];
  results: unknown[][];
  types: string[];
}

// ============================================================================
// Input Sanitization
// ============================================================================

// Allowlist for time windows
const ALLOWED_TIME_WINDOWS = new Set(["7d", "14d", "30d"]);

// Sanitize a hostname - only allow valid domain characters
function sanitizeHostname(host: string): string | null {
  // Match valid hostname: alphanumeric, hyphens, dots, and port
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*(:\d+)?$/;
  if (host.length > 253 || !hostnameRegex.test(host)) {
    return null;
  }
  return host;
}

// Escape a string for use in HogQL - escape single quotes
function escapeHogQL(str: string): string {
  return str.replace(/'/g, "\\'");
}

// Build a safe IN clause from an array of hostnames
function buildHostInClause(hosts: string[]): string | null {
  const sanitized = hosts
    .map(sanitizeHostname)
    .filter((h): h is string => h !== null)
    .map((h) => `'${escapeHogQL(h)}'`);

  if (sanitized.length === 0) return null;
  return sanitized.join(", ");
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(req: NextRequest) {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    return Response.json(
      { error: "PostHog credentials not configured" },
      { status: 500 }
    );
  }

  try {
    const { type, params }: PostHogRequest = await req.json();

    // Validate time window against allowlist
    if (params.timeWindow && !ALLOWED_TIME_WINDOWS.has(params.timeWindow)) {
      return Response.json(
        { error: "Invalid time window. Must be 7d, 14d, or 30d" },
        { status: 400 }
      );
    }

    // Validate limit is a reasonable number
    if (params.limit !== undefined && (params.limit < 1 || params.limit > 100)) {
      return Response.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${POSTHOG_API_KEY}`,
    };

    let data: unknown;
    let ttl = 60000; // Default 1 minute cache

    switch (type) {
      case "site_health":
        data = await fetchSiteHealth(params, headers);
        ttl = 120000; // 2 minute cache for overview
        break;
      case "property_breakdown":
        data = await fetchPropertyBreakdown(params, headers);
        ttl = 120000;
        break;
      case "top_pages":
        data = await fetchTopPages(params, headers);
        ttl = 120000;
        break;
      default:
        return Response.json({ error: "Unknown query type" }, { status: 400 });
    }

    return Response.json({ data, ttl });
  } catch (error) {
    console.error("PostHog API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "PostHog API error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getDateInterval(timeWindow: string = "7d"): number {
  const match = timeWindow.match(/^(\d+)d$/);
  return match ? parseInt(match[1], 10) : 7;
}

async function hogqlQuery(
  query: string,
  headers: HeadersInit
): Promise<HogQLResult> {
  const url = `${POSTHOG_API}/projects/${POSTHOG_PROJECT_ID}/query`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PostHog API error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return data.results ? data : { columns: [], results: [], types: [] };
}

// ============================================================================
// Query Functions (using HogQL)
// ============================================================================

async function fetchSiteHealth(
  params: PostHogRequest["params"],
  headers: HeadersInit
) {
  const days = getDateInterval(params.timeWindow);

  // Build sanitized host filter
  let hostFilter = "";
  if (params.properties?.length) {
    const inClause = buildHostInClause(params.properties);
    if (inClause) {
      hostFilter = `AND properties.$host IN (${inClause})`;
    }
  }

  // Query 1: Daily breakdown for sparkline
  const dailyQuery = `
    SELECT
      toDate(timestamp) as date,
      uniqExact(distinct_id) as visitors,
      count() as pageviews
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${days} DAY
      ${hostFilter}
    GROUP BY date
    ORDER BY date ASC
  `;

  // Query 2: True unique visitors over the entire period
  const uniqueQuery = `
    SELECT
      uniqExact(distinct_id) as total_unique,
      count() as total_pageviews
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${days} DAY
      ${hostFilter}
  `;

  // Query 3: New vs returning visitors based on first seen date
  // A "new" visitor is one whose first pageview was within this period
  const newVisitorQuery = `
    SELECT
      countIf(first_seen >= now() - INTERVAL ${days} DAY) as new_visitors,
      count() as total_visitors
    FROM (
      SELECT
        distinct_id,
        min(timestamp) as first_seen
      FROM events
      WHERE event = '$pageview'
        ${hostFilter}
      GROUP BY distinct_id
    )
    WHERE first_seen <= now()
      AND first_seen >= now() - INTERVAL ${days * 2} DAY
  `;

  const [dailyResult, uniqueResult, newVisitorResult] = await Promise.all([
    hogqlQuery(dailyQuery, headers),
    hogqlQuery(uniqueQuery, headers),
    hogqlQuery(newVisitorQuery, headers),
  ]);

  // Process daily results for sparkline
  const daily: { date: string; visitors: number; pageviews: number }[] = [];
  for (const row of dailyResult.results) {
    daily.push({
      date: String(row[0]),
      visitors: Number(row[1]) || 0,
      pageviews: Number(row[2]) || 0,
    });
  }

  // Get true unique count from dedicated query
  const uniqueVisitors = Number(uniqueResult.results[0]?.[0]) || 0;
  const pageviews = Number(uniqueResult.results[0]?.[1]) || 0;

  // Calculate actual new visitor ratio
  const newVisitors = Number(newVisitorResult.results[0]?.[0]) || 0;
  const totalInPeriod = Number(newVisitorResult.results[0]?.[1]) || 0;
  const newVisitorRatio = totalInPeriod > 0 ? newVisitors / totalInPeriod : 0;

  return {
    uniqueVisitors,
    pageviews,
    newVisitorRatio,
    daily,
  };
}

async function fetchPropertyBreakdown(
  params: PostHogRequest["params"],
  headers: HeadersInit
) {
  const days = getDateInterval(params.timeWindow);
  const metric = params.metric === "pageviews" ? "count()" : "uniqExact(distinct_id)";

  const query = `
    SELECT
      properties.$host as hostname,
      ${metric} as value
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${days} DAY
    GROUP BY hostname
    ORDER BY value DESC
  `;

  const result = await hogqlQuery(query, headers);

  // Calculate total for percentages
  let total = 0;
  const properties: { name: string; value: number; percentage: number }[] = [];

  for (const row of result.results) {
    const name = String(row[0]) || "unknown";
    const value = Number(row[1]) || 0;
    total += value;
    properties.push({ name, value, percentage: 0 });
  }

  // Calculate percentages
  for (const prop of properties) {
    prop.percentage = total > 0 ? prop.value / total : 0;
  }

  return {
    properties,
    total,
  };
}

async function fetchTopPages(
  params: PostHogRequest["params"],
  headers: HeadersInit
) {
  const days = getDateInterval(params.timeWindow);
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 100); // Clamp 1-100

  // Build sanitized host filter
  let hostFilter = "";
  if (params.property) {
    const sanitized = sanitizeHostname(params.property);
    if (sanitized) {
      hostFilter = `AND properties.$host = '${escapeHogQL(sanitized)}'`;
    }
  }

  const query = `
    SELECT
      properties.$host as property,
      properties.$pathname as path,
      count() as views
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${days} DAY
      ${hostFilter}
    GROUP BY property, path
    ORDER BY views DESC
    LIMIT ${limit}
  `;

  const result = await hogqlQuery(query, headers);

  const pages = result.results.map((row) => ({
    property: String(row[0]) || "unknown",
    path: String(row[1]) || "/",
    views: Number(row[2]) || 0,
  }));

  return { pages };
}
