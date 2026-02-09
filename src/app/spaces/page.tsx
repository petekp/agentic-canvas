// Spaces Grid Page - landing page showing all spaces
// See: .claude/plans/spaces-navigation-v0.2.md

import { ChatPanelLazy } from "@/components/chat/ChatPanelLazy";
import { SpacesGrid } from "@/components/spaces/SpacesGrid";

export default function SpacesPage() {
  return (
    <main className="relative h-screen overflow-hidden">
      <SpacesGrid />
      <ChatPanelLazy />
    </main>
  );
}
