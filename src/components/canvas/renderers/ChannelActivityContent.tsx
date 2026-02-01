"use client";

import { formatRelativeTime } from "./shared";
import type { SlackMessageData } from "./types";

interface ChannelActivityContentProps {
  data: SlackMessageData[];
}

export function ChannelActivityContent({ data }: ChannelActivityContentProps) {
  return (
    <div className="flex flex-col gap-2 h-full overflow-auto">
      {data.map((msg) => (
        <div
          key={msg.ts}
          className="flex flex-col gap-0.5 text-sm py-1.5 border-b border-border/50 last:border-0"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{msg.user}</span>
            <span className="text-muted-foreground text-xs shrink-0">
              {formatRelativeTime(msg.timestamp)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{msg.text}</p>
          {msg.reactions && msg.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {msg.reactions.slice(0, 5).map((r) => (
                <span
                  key={r.name}
                  className="inline-flex items-center gap-0.5 text-xs bg-muted px-1.5 py-0.5 rounded"
                >
                  :{r.name}: {r.count}
                </span>
              ))}
            </div>
          )}
          {msg.replyCount && msg.replyCount > 0 && (
            <span className="text-xs text-primary">
              {msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}
            </span>
          )}
        </div>
      ))}
      {data.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">
          No messages
        </div>
      )}
    </div>
  );
}

export default ChannelActivityContent;
