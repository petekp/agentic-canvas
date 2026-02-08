// DEPRECATED: Use /api/insights route instead
// This file exists only for type compatibility

import type { AgentMemoryService } from "@/lib/memory";
import type { GeneratedInsight, InsightContext } from "./types";

/**
 * @deprecated Use the /api/insights route instead for server-side insight generation
 */
export class InsightEngine {
  constructor(memory: AgentMemoryService) {
    void memory;
    console.warn(
      "InsightEngine is deprecated. Use the /api/insights route instead."
    );
  }

  async generateInsights(context: InsightContext): Promise<GeneratedInsight[]> {
    void context;
    console.warn(
      "InsightEngine.generateInsights is deprecated. Call /api/insights instead."
    );
    return [];
  }
}

/**
 * @deprecated Use the /api/insights route instead
 */
export function createInsightEngine(memory: AgentMemoryService): InsightEngine {
  return new InsightEngine(memory);
}
