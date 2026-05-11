"use client";

// Space Canvas Page - shows the canvas for a specific space
// See: .claude/plans/spaces-navigation-v0.2.md

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@/components/canvas/Canvas";
import { ChatPanelLazy } from "@/components/chat/ChatPanelLazy";
import { useSpaces } from "@/hooks/useSpaces";
import { SpaceRouteSyncListener } from "@/components/spaces/SpaceRouteSyncListener";
import {
  getAssistantRunActive,
  subscribeAssistantRunActive,
} from "@/lib/space-route-sync-queue";

export function SpacePageClient({ id }: { id: string }) {
  const router = useRouter();
  const { spaces, activeSpaceId, canvasComponentCount, loadSpace } = useSpaces();
  const wasRouteActiveRef = useRef(activeSpaceId === id);
  const isAssistantRunActive = useSyncExternalStore(
    subscribeAssistantRunActive,
    getAssistantRunActive,
    getAssistantRunActive
  );

  // Load the space when navigating to this route
  useEffect(() => {
    if (activeSpaceId === id) {
      wasRouteActiveRef.current = true;
    }

    // Check if space exists
    const routeSpace = spaces.find((s) => s.id === id);
    const spaceExists = Boolean(routeSpace);

    if (!spaceExists) {
      // Space doesn't exist - redirect to grid
      router.replace("/spaces");
      return;
    }

    const isStaleRouteInstance =
      wasRouteActiveRef.current &&
      Boolean(activeSpaceId) &&
      activeSpaceId !== id;

    // Stale route instance: active space moved away from this route while the
    // previous page is still mounted. While an assistant run is active, keep
    // rendering this route and defer replacement until the run is done.
    if (isStaleRouteInstance && activeSpaceId && !isAssistantRunActive) {
      router.replace(`/spaces/${activeSpaceId}`);
      return;
    }
    if (isStaleRouteInstance && isAssistantRunActive) {
      return;
    }

    // Load space if not already active
    const shouldHydrateMorningBrief =
      id === activeSpaceId &&
      canvasComponentCount === 0 &&
      routeSpace?.kind === "system.morning_brief";

    if (id !== activeSpaceId || shouldHydrateMorningBrief) {
      loadSpace(id);
    }
  }, [
    id,
    activeSpaceId,
    spaces,
    canvasComponentCount,
    loadSpace,
    router,
    isAssistantRunActive,
  ]);

  // Don't render until space is loaded
  if (activeSpaceId !== id && !(isAssistantRunActive && wasRouteActiveRef.current)) {
    return (
      <main className="relative h-screen overflow-hidden flex items-center justify-center">
        <div className="text-muted-foreground">Loading space...</div>
      </main>
    );
  }

  return (
    <main className="relative h-screen overflow-hidden">
      <SpaceRouteSyncListener />
      <Canvas />
      <ChatPanelLazy />
    </main>
  );
}
