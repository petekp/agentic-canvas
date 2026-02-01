"use client";

import { useCallback } from "react";
import { formatRelativeTime, openInNewTab } from "./shared";
import type { SlackMentionData } from "./types";

interface MentionsContentProps {
  data: SlackMentionData[];
}

export function MentionsContent({ data }: MentionsContentProps) {
  const handleMentionClick = useCallback((permalink?: string) => {
    if (permalink) {
      openInNewTab(permalink);
    }
  }, []);

  return (
    <div className="flex flex-col gap-2 h-full overflow-auto">
      {data.map((mention) => (
        <div
          key={mention.ts}
          className={`flex flex-col gap-0.5 text-sm py-1.5 border-b border-border/50 last:border-0 ${
            mention.permalink ? "cursor-pointer hover:bg-muted/50 -mx-1 px-1 rounded" : ""
          }`}
          onClick={() => handleMentionClick(mention.permalink)}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{mention.user}</span>
            <span className="text-muted-foreground text-xs">in #{mention.channel}</span>
            <span className="text-muted-foreground text-xs shrink-0 ml-auto">
              {formatRelativeTime(mention.timestamp)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{mention.text}</p>
        </div>
      ))}
      {data.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">
          No mentions
        </div>
      )}
    </div>
  );
}

export default MentionsContent;
