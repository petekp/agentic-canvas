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
  const hostFilter = params.properties?.length
    ? `AND properties.$host IN (${params.properties.map((p) => `'${p}'`).join(", ")})`
    : "";

  // Query for daily visitors and pageviews
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

  const result = await hogqlQuery(dailyQuery, headers);

  // Process results
  const daily: { date: string; visitors: number; pageviews: number }[] = [];
  let uniqueVisitors = 0;
  let pageviews = 0;

  for (const row of result.results) {
    const dateStr = String(row[0]);
    const dayVisitors = Number(row[1]) || 0;
    const dayPageviews = Number(row[2]) || 0;

    daily.push({
      date: dateStr,
      visitors: dayVisitors,
      pageviews: dayPageviews,
    });

    uniqueVisitors += dayVisitors;
    pageviews += dayPageviews;
  }

  // Estimate new visitor ratio (placeholder - would need session analysis)
  const newVisitorRatio = 0.65;

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
  const limit = params.limit ?? 10;
  const hostFilter = params.property
    ? `AND properties.$host = '${params.property}'`
    : "";

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
