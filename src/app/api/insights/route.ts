// Insights API Route - generates proactive insights server-side
// Uses Supermemory middleware for memory-aware insight generation

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { withSupermemory } from "@supermemory/tools/ai-sdk";
import { nanoid } from "nanoid";
import { createMemoryService } from "@/lib/memory";
import type { InsightContext, GeneratedInsight } from "@/lib/insights";

// Rate limiting: track last generation time per user
const lastGenerationTime = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between insight generations

const INSIGHT_SYSTEM_PROMPT = `You are a proactive assistant monitoring a user's workspace dashboard.

Your job is to surface genuinely useful insights - NOT to be noisy or repetitive.

Core principles:
1. BE SELECTIVE - Only surface insights that are truly actionable or important
2. DON'T REPEAT - Check recent insights and avoid saying similar things
3. LEARN FROM FEEDBACK - If user dismissed similar insights before, don't repeat them
4. CONNECT DOTS - Look for correlations across different data sources
5. STAY QUIET - If nothing noteworthy, return empty array []

When you do surface an insight:
- Keep it concise (2-3 sentences max)
- Explain why it matters
- Suggest a concrete action when possible
- Use appropriate priority (low/medium/high)

Response format (JSON array):
[
  {
    "title": "Brief title (5 words max)",
    "message": "2-3 sentence explanation of what's happening and why it matters",
    "priority": "low|medium|high",
    "category": "correlation|anomaly|opportunity|risk|celebration",
    "suggestedAction": {
      "label": "Button text",
      "type": "send_chat|open_url",
      "payload": "message or URL"
    }
  }
]

Or if nothing noteworthy: []`;

interface InsightRequest {
  userId?: string;
  context: InsightContext;
}

export async function POST(req: Request) {
  try {
    const { userId = "default_user", context }: InsightRequest = await req.json();

    // Rate limiting check
    const lastTime = lastGenerationTime.get(userId);
    if (lastTime && Date.now() - lastTime < COOLDOWN_MS) {
      return Response.json({ insights: [], skipped: "rate_limited" });
    }

    // Check for API key
    if (!process.env.SUPERMEMORY_API_KEY) {
      console.warn("SUPERMEMORY_API_KEY not set - insights will work but without memory");
    }

    // Initialize memory service for explicit operations
    const memory = createMemoryService(userId);

    // Gather additional memory context for the prompt
    let recentInsights: unknown[] = [];
    let feedbackPatterns: unknown[] = [];
    let userProfile: unknown = null;

    if (process.env.SUPERMEMORY_API_KEY) {
      try {
        [recentInsights, feedbackPatterns, userProfile] = await Promise.all([
          memory.getRecentInsights(10),
          memory.getFeedbackPatterns(),
          memory.getUserProfile(),
        ]);
      } catch (error) {
        console.error("Failed to fetch memory context:", error);
      }
    }

    // Build the prompt
    const prompt = buildPrompt(context, recentInsights, feedbackPatterns, userProfile);

    // Wrap model with Supermemory for context-aware insight generation
    // Uses "query" mode since we're generating insights, not having a conversation
    const model = withSupermemory(openai("gpt-4o"), userId, {
      apiKey: process.env.SUPERMEMORY_API_KEY,
      mode: "query", // Search memories based on the prompt content
      addMemory: "never", // Don't store insight generation prompts as conversations
    });

    // Generate insights via LLM
    const result = await generateText({
      model,
      system: INSIGHT_SYSTEM_PROMPT,
      prompt,
      temperature: 0.7,
    });

    // Parse response
    const insights = parseInsights(result.text);

    // Store what we generated (for future reference - avoid repetition)
    if (process.env.SUPERMEMORY_API_KEY) {
      for (const insight of insights) {
        try {
          await memory.storeInsightGenerated(insight.id, insight.title, insight.message);
        } catch (error) {
          console.error("Failed to store insight:", error);
        }
      }
    }

    // Update rate limit timestamp
    lastGenerationTime.set(userId, Date.now());

    return Response.json({ insights });
  } catch (error) {
    console.error("Insights API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function buildPrompt(
  context: InsightContext,
  recentInsights: unknown[],
  feedbackPatterns: unknown[],
  userProfile: unknown
): string {
  function formatContentList(items: unknown[]): string {
    const lines: string[] = [];
    for (const item of items) {
      if (item && typeof item === "object" && "content" in item) {
        const content = (item as { content?: unknown }).content;
        if (typeof content === "string" && content.trim().length > 0) {
          lines.push(`- ${content}`);
          continue;
        }
      }
      try {
        lines.push(`- ${JSON.stringify(item)}`);
      } catch {
        lines.push("- [unserializable]");
      }
    }
    return lines.join("\n");
  }

  const canvasSummary = context.canvasComponents
    .map((c) => {
      const dataPreview = c.data
        ? JSON.stringify(c.data).slice(0, 300)
        : "no data";
      return `- ${c.label || c.typeId} (${c.typeId}): ${dataPreview}`;
    })
    .join("\n");

  const changesSummary =
    context.recentChanges.length > 0
      ? context.recentChanges
          .map((c) => `- ${c.type}: ${c.title} - ${c.message}`)
          .join("\n")
      : "No recent changes detected.";

  const recentInsightsSummary =
    recentInsights.length > 0
      ? formatContentList(recentInsights)
      : "No recent insights shared.";

  const feedbackSummary =
    feedbackPatterns.length > 0
      ? formatContentList(feedbackPatterns)
      : "No feedback yet.";

  return `
## User Profile
${userProfile ? JSON.stringify(userProfile, null, 2) : "No profile yet - this is a new user."}

## What User Found Useful/Not Useful (Learn from this!)
${feedbackSummary}

## Recent Insights Already Shared (Don't repeat these)
${recentInsightsSummary}

## Current Canvas State
${canvasSummary}

## Recent Changes (from polling)
${changesSummary}

${
  context.gitStatus
    ? `## Git Status
Branch: ${context.gitStatus.branch}
Uncommitted changes: ${context.gitStatus.uncommittedChanges}
Staged changes: ${context.gitStatus.stagedChanges}`
    : ""
}

---

Analyze this context. If there's something genuinely worth the user's attention, surface it.
If nothing noteworthy, return an empty array - staying quiet is often the right choice.

Think about:
1. Correlations across data sources (e.g., traffic drop + recent deploy)
2. Anomalies (something unusual compared to patterns)
3. Opportunities (actions user could take)
4. Risks (something that needs attention)
5. Celebrations (good news worth acknowledging)

Return JSON array (0-2 insights max):
`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInsights(text: string): GeneratedInsight[] {
  try {
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);

    // Validate and add IDs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return parsed.map((insight: any) => ({
      id: nanoid(10),
      title: insight.title || "Insight",
      message: insight.message || "",
      priority: insight.priority || "medium",
      category: insight.category || "opportunity",
      suggestedAction: insight.suggestedAction,
    }));
  } catch (error) {
    console.error("Failed to parse insights:", error);
    return [];
  }
}
