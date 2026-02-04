// Undo History Panel - Shows full undo history with source attribution
// See: .claude/plans/undo-redo-system-v2.md

"use client";

import { User, Bot, Clock, Cog, Lock, Layers } from "lucide-react";
import { useUndoHistoryViewer } from "@/hooks/useUndo";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EnhancedUndoEntry } from "@/lib/undo/types";

interface UndoHistoryPanelProps {
  className?: string;
  limit?: number;
  showEmpty?: boolean;
}

// Source type icons
const sourceIcons = {
  user: User,
  assistant: Bot,
  background: Clock,
  system: Cog,
};

// Source type labels
const sourceLabels = {
  user: "User",
  assistant: "Assistant",
  background: "Background",
  system: "System",
};

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

// Single history entry row
function HistoryEntry({
  entry,
  isFirst,
}: {
  entry: EnhancedUndoEntry;
  isFirst: boolean;
}) {
  const Icon = sourceIcons[entry.source.type];
  const sourceLabel = sourceLabels[entry.source.type];

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2 rounded text-sm",
        isFirst
          ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 mt-0.5 flex-shrink-0",
          isFirst ? "text-blue-500" : "text-zinc-400"
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
            {entry.description}
          </span>
          {!entry.canUndo && (
            <span title={entry.undoBlockedReason}>
              <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />
            </span>
          )}
          {entry.batchSize && entry.batchSize > 1 && (
            <span className="flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">
              <Layers className="w-3 h-3" />
              {entry.batchSize}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          <span>{sourceLabel}</span>
          <span>&middot;</span>
          <span>{formatRelativeTime(entry.timestamp)}</span>
          {entry.spaceContext.activeSpaceName !== "Default" && (
            <>
              <span>&middot;</span>
              <span className="text-zinc-400">{entry.spaceContext.activeSpaceName}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function UndoHistoryPanel({
  className,
  limit = 50,
  showEmpty = true,
}: UndoHistoryPanelProps) {
  const { entries, totalCount, hasMore } = useUndoHistoryViewer(limit);

  if (entries.length === 0) {
    if (!showEmpty) return null;

    return (
      <div className={cn("p-4 text-center text-zinc-500 dark:text-zinc-400", className)}>
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No history yet</p>
        <p className="text-xs mt-1">Changes you make will appear here</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
        <h3 className="font-medium text-zinc-900 dark:text-zinc-100">History</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {totalCount} {totalCount === 1 ? "change" : "changes"}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {entries.map((entry, index) => (
            <HistoryEntry key={entry.id} entry={entry} isFirst={index === 0} />
          ))}

          {hasMore && (
            <div className="text-center py-2 text-xs text-zinc-400">
              +{totalCount - limit} more
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Compact version for dropdown/popover
export function UndoHistoryDropdown({ className }: { className?: string }) {
  const { entries } = useUndoHistoryViewer(10);

  if (entries.length === 0) {
    return (
      <div className={cn("p-3 text-center text-zinc-500 text-sm", className)}>
        No history
      </div>
    );
  }

  return (
    <div className={cn("max-h-80 overflow-y-auto", className)}>
      <div className="p-1 space-y-0.5">
        {entries.map((entry, index) => (
          <HistoryEntry key={entry.id} entry={entry} isFirst={index === 0} />
        ))}
      </div>
    </div>
  );
}
