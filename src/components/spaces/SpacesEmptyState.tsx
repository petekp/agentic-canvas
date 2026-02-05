"use client";

// SpacesEmptyState - Shown when user has no spaces
// See: .claude/plans/spaces-navigation-v0.2.md

import { Layers, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SpacesEmptyStateProps {
  onCreateSpace: () => void;
}

export function SpacesEmptyState({ onCreateSpace }: SpacesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="relative mb-6">
        <Layers className="h-20 w-20 text-muted-foreground/20" />
        <Sparkles className="absolute -bottom-1 -right-1 h-8 w-8 text-primary/60" />
      </div>

      <h1 className="text-2xl font-semibold text-center mb-2">
        Welcome to Agentic Canvas
      </h1>

      <p className="text-muted-foreground text-center max-w-md mb-8">
        Create your first space to start building dashboards.
        Use the chat to ask the assistant for help.
      </p>

      <Button onClick={onCreateSpace} size="lg" className="gap-2">
        <Sparkles className="h-5 w-5" />
        Create Your First Space
      </Button>

      <p className="text-xs text-muted-foreground/60 mt-4">
        Or just say &quot;Create a space for tracking PRs&quot; in the chat
      </p>
    </div>
  );
}
