"use client";

// CreateSpaceCard - Button card for creating a new space
// See: .claude/plans/spaces-navigation-v0.2.md

import { Plus } from "lucide-react";

interface CreateSpaceCardProps {
  onClick: () => void;
}

export function CreateSpaceCard({ onClick }: CreateSpaceCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/30 transition-colors min-h-[120px]"
    >
      <Plus className="h-8 w-8 text-muted-foreground/50 mb-2" />
      <span className="text-sm text-muted-foreground">New Space</span>
    </button>
  );
}
