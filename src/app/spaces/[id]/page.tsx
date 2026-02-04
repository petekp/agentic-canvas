"use client";

// Space Canvas Page - shows the canvas for a specific space
// See: .claude/plans/spaces-navigation-v0.2.md

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@/components/canvas/Canvas";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useSpaces } from "@/hooks";

interface SpacePageProps {
  params: Promise<{ id: string }>;
}

export default function SpacePage({ params }: SpacePageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { spaces, activeSpaceId, loadSpace } = useSpaces();

  // Load the space when navigating to this route
  useEffect(() => {
    // Check if space exists
    const spaceExists = spaces.some((s) => s.id === id);

    if (!spaceExists) {
      // Space doesn't exist - redirect to grid
      router.replace("/spaces");
      return;
    }

    // Load space if not already active
    if (id !== activeSpaceId) {
      loadSpace(id);
    }
  }, [id, activeSpaceId, spaces, loadSpace, router]);

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
      <Canvas />
      <ChatPanel />
    </main>
  );
}
