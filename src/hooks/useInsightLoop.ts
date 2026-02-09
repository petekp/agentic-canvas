// Insight Loop Hook - triggers server-side insight generation after polling

import { useEffect, useRef, useCallback } from "react";
import { useStore } from "@/store";
import { useCurrentUserId } from "@/lib/user";
import type { InsightContext, GeneratedInsight } from "@/lib/insights";

// Track recent changes for insight context
interface TrackedChange {
  type: string;
  title: string;
  message: string;
  timestamp: number;
}

const recentChangesBuffer: TrackedChange[] = [];
const MAX_RECENT_CHANGES = 20;

export function addRecentChange(change: {
  type: string;
  title: string;
  message: string;
}) {
  recentChangesBuffer.unshift({
    ...change,
    timestamp: Date.now(),
  });
  if (recentChangesBuffer.length > MAX_RECENT_CHANGES) {
    recentChangesBuffer.pop();
  }
}

export function useInsightLoop() {
  const userId = useCurrentUserId();
  const isRunningRef = useRef(false);

  const lastPollTimeAll = useStore((state) => state.lastPollTime.all);

  // Run insights after polling completes (calls server API)
  const runInsights = useCallback(async () => {
    if (isRunningRef.current) return;

    isRunningRef.current = true;

    try {
      const { canvas, addNotification } = useStore.getState();
      const components = canvas.components;

      // Build context from current state
      const context: InsightContext = {
        canvasComponents: components.map((c) => ({
          id: c.id,
          typeId: c.typeId,
          label: c.meta.label,
          data: c.dataState.status === "ready" ? c.dataState.data : null,
        })),
        recentChanges: recentChangesBuffer.map((c) => ({
          type: c.type,
          title: c.title,
          message: c.message,
          timestamp: c.timestamp,
        })),
      };

      // Call the server-side insights API
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, context }),
      });

      if (!response.ok) {
        console.error("Insights API error:", response.status);
        return;
      }

      const { insights, skipped } = await response.json();

      if (skipped === "rate_limited") {
        // Silent skip - rate limited
        return;
      }

      // Surface as notifications
      for (const insight of insights as GeneratedInsight[]) {
        addNotification({
          title: insight.title,
          message: insight.message,
          category: "assistant",
          priority: insight.priority,
          source: { type: "system" },
          actions: insight.suggestedAction
            ? [
                {
                  label: insight.suggestedAction.label,
                  action:
                    insight.suggestedAction.type === "send_chat"
                      ? {
                          type: "send_chat",
                          message: insight.suggestedAction.payload,
                        }
                      : {
                          type: "open_url",
                          url: insight.suggestedAction.payload,
                        },
                  variant: "primary",
                },
                { label: "Dismiss", action: { type: "dismiss" } },
              ]
            : [{ label: "Dismiss", action: { type: "dismiss" } }],
          dedupeKey: `insight_${insight.id}`,
        });
      }
    } catch (error) {
      console.error("Insight loop error:", error);
    } finally {
      isRunningRef.current = false;
    }
  }, [userId]);

  // Trigger after each poll
  useEffect(() => {
    if (!lastPollTimeAll) return;

    // Delay slightly to let polling data settle
    const timer = setTimeout(runInsights, 2000);
    return () => clearTimeout(timer);
  }, [lastPollTimeAll, runInsights]);

  return { runInsights };
}
