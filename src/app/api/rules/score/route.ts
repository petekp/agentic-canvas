// rules/score/route.ts
//
// LLM-backed scoring endpoint for preference rules.

import { NextRequest } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { appendTelemetry } from "@/lib/telemetry";

interface ScoreRequest {
  instruction?: string;
  items?: Array<{ key: string; text: string }>;
}

interface ScoreResponse {
  scores: Array<{ key: string; score: number }>;
}

const SCORE_MODEL = "gpt-5-nano";

const SCORE_SYSTEM_PROMPT = `You are a precise classifier.
Return ONLY a JSON object with this shape:
{
  "scores": [
    { "key": "string", "score": 0.0 }
  ]
}

Rules:
- score must be a number between 0 and 1 inclusive.
- Higher score means better match to the instruction.
- Return one entry per input item.
- No markdown, no extra keys.`;

export async function POST(req: NextRequest) {
  try {
    const body: ScoreRequest = await req.json();
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    const items = Array.isArray(body.items) ? body.items : [];

    await appendTelemetry({
      level: "info",
      source: "api.rules.score",
      event: "request",
      data: {
        instructionLength: instruction.length,
        itemCount: items.length,
      },
    });

    if (!instruction || items.length === 0) {
      return Response.json({ scores: [] } satisfies ScoreResponse);
    }

    const promptPayload = {
      instruction,
      items,
    };

    const result = await generateText({
      model: openai(SCORE_MODEL),
      system: SCORE_SYSTEM_PROMPT,
      prompt: JSON.stringify(promptPayload, null, 2),
      temperature: 0,
    });

    const parsed = parseScores(result.text);
    if (!parsed) {
      await appendTelemetry({
        level: "warn",
        source: "api.rules.score",
        event: "parse_failed",
      });
      return Response.json({ scores: [] } satisfies ScoreResponse);
    }

    const scores = parsed.scores
      .filter((entry) => entry && typeof entry.key === "string" && typeof entry.score === "number")
      .map((entry) => ({
        key: entry.key,
        score: clamp(entry.score, 0, 1),
      }));

    return Response.json({ scores } satisfies ScoreResponse);
  } catch (error) {
    console.error("LLM score error:", error);
    await appendTelemetry({
      level: "error",
      source: "api.rules.score",
      event: "error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return Response.json({ scores: [] } satisfies ScoreResponse, { status: 200 });
  }
}

function parseScores(text: string): ScoreResponse | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as ScoreResponse;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.scores)) return null;
    return parsed;
  } catch (error) {
    console.error("Failed to parse LLM scores:", error);
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
