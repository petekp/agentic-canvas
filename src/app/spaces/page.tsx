"use client";

// Spaces Grid Page - landing page showing all spaces
// See: .claude/plans/spaces-navigation-v0.2.md

import { ChatPanel } from "@/components/chat/ChatPanel";
import { SpacesGrid } from "@/components/spaces";

export default function SpacesPage() {
  return (
    <main className="relative h-screen overflow-hidden">
      <SpacesGrid />
      <ChatPanel />
    </main>
  );
}
