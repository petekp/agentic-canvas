// Polling Hook - manages periodic data refresh and change detection
// See: Polling + Notifications system plan

import { useEffect, useRef, useCallback } from "react";
import { useStore } from "@/store";
import { useShallow } from "zustand/shallow";
import { detectChanges } from "@/lib/notifications/change-detector";
import { addRecentChange } from "./useInsightLoop";
import type { ComponentInstance } from "@/types";

// Persistent ref across remounts to avoid false notifications
const previousDataStore = new Map<string, unknown>();

export function usePolling() {
  const {
    pollingEnabled,
    pollingIntervalMs,
    lastPollTime,
    addNotification,
    updateLastPollTime,
    fetchData,
  } = useStore(
    useShallow((state) => ({
      pollingEnabled: state.pollingEnabled,
      pollingIntervalMs: state.pollingIntervalMs,
      lastPollTime: state.lastPollTime,
      addNotification: state.addNotification,
      updateLastPollTime: state.updateLastPollTime,
      fetchData: state.fetchData,
    }))
  );

  // Store refs for callbacks to avoid stale closures
  const addNotificationRef = useRef(addNotification);
  const fetchDataRef = useRef(fetchData);
  addNotificationRef.current = addNotification;
  fetchDataRef.current = fetchData;

  // Poll a single component
  const pollComponent = useCallback(async (component: ComponentInstance) => {
    try {
      if (!component.dataBinding) return;

      const previousData = previousDataStore.get(component.id);

      // Fetch fresh data
      await fetchDataRef.current(component.id, component.dataBinding);

      // Get the new data from store
      const currentState = useStore.getState();
      const updatedComponent = currentState.canvas.components.find((c) => c.id === component.id);
      const currentData =
        updatedComponent?.dataState.status === "ready" ? updatedComponent.dataState.data : null;

      if (!currentData) return;

      // Detect changes (only if we have previous data to compare)
      if (previousData) {
        const changes = detectChanges({
          previousData,
          currentData,
          component,
        });

        // Create notifications for each change and track for insight loop
        for (const change of changes) {
          // Track for insight loop
          addRecentChange({
            type: change.type,
            title: change.title,
            message: change.message,
          });

          // Create notification
          addNotificationRef.current({
            title: change.title,
            message: change.message,
            category: component.typeId.startsWith("github") ? "github" : "posthog",
            priority: change.priority,
            source: {
              type: component.typeId.startsWith("github") ? "github" : "posthog",
              componentId: component.id,
              externalUrl: change.externalUrl,
              externalId: change.externalId,
            },
            actions: change.actions,
            dedupeKey: change.dedupeKey,
            expiresAt: change.expiresAt,
          });
        }
      }

      // Store current data for next comparison
      previousDataStore.set(component.id, structuredClone(currentData));
    } catch (error) {
      console.error(`Polling failed for component ${component.id}:`, error);
    }
  }, []);

  // Main polling effect - uses stable dependencies
  useEffect(() => {
    if (!pollingEnabled) return;

    const poll = async () => {
      // Get fresh components inside the poll to avoid stale references
      const currentComponents = useStore.getState().canvas.components;
      const componentsWithBindings = currentComponents.filter((c) => c.dataBinding);

      // Poll all components in parallel
      await Promise.all(componentsWithBindings.map((component) => pollComponent(component)));

      updateLastPollTime("all");
    };

    // Initial poll after a short delay
    const initialTimeout = setTimeout(poll, 5000);

    // Regular polling
    const interval = setInterval(poll, pollingIntervalMs);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [pollingEnabled, pollingIntervalMs, pollComponent, updateLastPollTime]);

  return {
    lastPollTime,
    pollingEnabled,
  };
}
