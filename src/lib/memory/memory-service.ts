// Memory Service - explicit memory operations for canvas context, insights, and feedback
// Uses Supermemory SDK with containerTag for user scoping
// All operations are no-ops if Supermemory is not configured (optional feature)

import { getSupermemoryClient } from "./supermemory-client";
import type { StoredMemory, UserProfile } from "./types";
import type { ComponentInstance } from "@/types";

export class AgentMemoryService {
  private containerTag: string;

  constructor(userId: string, projectId: string = "default") {
    // Use containerTag for user scoping (format: userId_projectId)
    this.containerTag = `${userId}_${projectId}`;
  }

  // ============================================================================
  // Canvas Context
  // ============================================================================

  /**
   * Store a snapshot of the current canvas state.
   * Called periodically to keep memory updated with workspace context.
   * No-op if Supermemory is not configured.
   */
  async storeCanvasSnapshot(components: ComponentInstance[]): Promise<void> {
    const client = getSupermemoryClient();
    if (!client) return;

    const summary = components.map((c) => ({
      id: c.id,
      type: c.typeId,
      label: c.meta.label || c.typeId,
      hasData: c.dataState.status === "ready",
      dataPreview:
        c.dataState.status === "ready"
          ? this.summarizeData(c.dataState.data)
          : null,
    }));

    await client.memories.add({
      content: `Current workspace has ${components.length} components: ${summary.map((s) => s.label).join(", ")}. Details: ${JSON.stringify(summary)}`,
      containerTag: this.containerTag,
      metadata: {
        type: "canvas_snapshot",
        timestamp: Date.now().toString(),
      },
    });
  }

  private summarizeData(data: unknown): string {
    if (!data) return "no data";
    const str = JSON.stringify(data);
    return str.length > 200 ? str.slice(0, 200) + "..." : str;
  }

  // ============================================================================
  // Insight Tracking
  // ============================================================================

  /**
   * Store that we generated an insight (to avoid repeating).
   * No-op if Supermemory is not configured.
   */
  async storeInsightGenerated(
    insightId: string,
    title: string,
    message: string
  ): Promise<void> {
    const client = getSupermemoryClient();
    if (!client) return;

    await client.memories.add({
      content: `Generated insight "${title}": ${message}`,
      containerTag: this.containerTag,
      metadata: {
        type: "insight_generated",
        insightId,
        timestamp: Date.now().toString(),
      },
    });
  }

  /**
   * Store user feedback on an insight (for learning).
   * No-op if Supermemory is not configured.
   */
  async storeInsightFeedback(
    insightId: string,
    action: "dismissed" | "acted_on" | "followed_up"
  ): Promise<void> {
    const client = getSupermemoryClient();
    if (!client) return;

    const sentiment = action === "dismissed" ? "not useful" : "useful";

    await client.memories.add({
      content: `User ${action.replace("_", " ")} insight ${insightId}. This type of insight was ${sentiment}.`,
      containerTag: this.containerTag,
      metadata: {
        type: "insight_feedback",
        insightId,
        action,
        timestamp: Date.now().toString(),
      },
    });
  }

  // ============================================================================
  // Pattern Learning
  // ============================================================================

  /**
   * Store a learned pattern about user behavior.
   * No-op if Supermemory is not configured.
   */
  async storeLearnedPattern(pattern: string, evidence: string[]): Promise<void> {
    const client = getSupermemoryClient();
    if (!client) return;

    await client.memories.add({
      content: `Learned pattern: ${pattern}. Evidence: ${evidence.join("; ")}`,
      containerTag: this.containerTag,
      metadata: {
        type: "learned_pattern",
        timestamp: Date.now().toString(),
      },
    });
  }

  /**
   * Store explicit user preference.
   * No-op if Supermemory is not configured.
   */
  async storeUserPreference(key: string, value: string): Promise<void> {
    const client = getSupermemoryClient();
    if (!client) return;

    await client.memories.add({
      content: `User preference: ${key} = ${value}`,
      containerTag: this.containerTag,
      metadata: {
        type: "user_preference",
        preferenceKey: key,
        timestamp: Date.now().toString(),
      },
    });
  }

  // ============================================================================
  // Retrieval
  // ============================================================================

  /**
   * Search for relevant memories given a query.
   * Returns empty array if Supermemory is not configured.
   */
  async searchMemories(query: string, limit = 10): Promise<StoredMemory[]> {
    const client = getSupermemoryClient();
    if (!client) return [];

    const results = await client.search.memories({
      q: query,
      containerTag: this.containerTag,
      limit,
    });

    // Map the response to our StoredMemory type
    // The SDK returns `memory` for content and `updatedAt` for timestamp
    return (results.results || []).map((r) => ({
      id: r.id,
      content: r.memory || r.chunk || "",
      metadata: {
        type: (r.metadata?.type as string) || "unknown",
        timestamp: parseInt(r.metadata?.timestamp as string) || 0,
      },
      createdAt: r.updatedAt || new Date().toISOString(),
    })) as StoredMemory[];
  }

  /**
   * Get memories about recent insights (to avoid repetition).
   */
  async getRecentInsights(limit = 20): Promise<StoredMemory[]> {
    return this.searchMemories("insight generated", limit);
  }

  /**
   * Get feedback patterns (what user found useful/not useful).
   */
  async getFeedbackPatterns(): Promise<StoredMemory[]> {
    return this.searchMemories("insight feedback useful not useful", 20);
  }

  /**
   * Get the auto-generated user profile from Supermemory.
   * Returns null if Supermemory is not configured.
   */
  async getUserProfile(): Promise<UserProfile | null> {
    try {
      const client = getSupermemoryClient();
      if (!client) return null;
      // Supermemory auto-generates profiles from stored memories
      const profile = await client.profile({
        containerTag: this.containerTag,
      });
      return profile as unknown as UserProfile;
    } catch {
      return null;
    }
  }
}

// Export a factory function for creating service instances
export function createMemoryService(
  userId: string,
  projectId?: string
): AgentMemoryService {
  return new AgentMemoryService(userId, projectId);
}
