"use client";

// Space Canvas Page - shows the canvas for a specific space
// See: .claude/plans/spaces-navigation-v0.2.md

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@/components/canvas/Canvas";
import { ChatPanelLazy } from "@/components/chat/ChatPanelLazy";
import { useSpaces } from "@/hooks/useSpaces";
import { SpaceRouteSyncListener } from "@/components/spaces/SpaceRouteSyncListener";

export function SpacePageClient({ id }: { id: string }) {
  const router = useRouter();
  const { spaces, activeSpaceId, canvasComponentCount, loadSpace } = useSpaces();
  const previousActiveSpaceIdRef = useRef<string | null>(activeSpaceId);

  // Load the space when navigating to this route
  useEffect(() => {
    const previousActiveSpaceId = previousActiveSpaceIdRef.current;
    previousActiveSpaceIdRef.current = activeSpaceId;

    // Check if space exists
    const routeSpace = spaces.find((s) => s.id === id);
    const spaceExists = Boolean(routeSpace);

    if (!spaceExists) {
      // Space doesn't exist - redirect to grid
      router.replace("/spaces");
      return;
    }

    // Stale route instance: active space moved away from this route while the
    // previous page is still mounted. Route to the new active space and do not
    // force-load the stale id back into the store.
    if (previousActiveSpaceId === id && activeSpaceId && activeSpaceId !== id) {
      router.replace(`/spaces/${activeSpaceId}`);
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
  }, [id, activeSpaceId, spaces, canvasComponentCount, loadSpace, router]);

  // Don't render until space is loaded
  if (activeSpaceId !== id) {
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
