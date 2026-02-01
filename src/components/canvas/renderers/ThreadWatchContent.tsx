"use client";

import { formatRelativeTime } from "./shared";
import type { SlackThreadData } from "./types";

interface ThreadWatchContentProps {
  data: SlackThreadData;
}

export function ThreadWatchContent({ data }: ThreadWatchContentProps) {
  const { parent, replies } = data;

  if (!parent) {
    return (
      <div className="text-muted-foreground text-sm text-center py-4">
        Thread not found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-auto">
      {/* Parent message */}
      <div className="flex flex-col gap-1 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-medium">{parent.user}</span>
          <span className="text-muted-foreground text-xs">
            {formatRelativeTime(parent.timestamp)}
          </span>
        </div>
        <p className="text-sm">{parent.text}</p>
      </div>

      {/* Replies */}
      <div className="flex flex-col gap-2 flex-1 overflow-auto">
        {replies.map((reply) => (
          <div
            key={reply.ts}
            className="flex flex-col gap-0.5 text-sm pl-3 border-l-2 border-muted"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{reply.user}</span>
              <span className="text-muted-foreground text-xs shrink-0">
                {formatRelativeTime(reply.timestamp)}
              </span>
            </div>
            <p className="text-muted-foreground">{reply.text}</p>
            {reply.reactions && reply.reactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {reply.reactions.slice(0, 3).map((r) => (
                  <span
                    key={r.name}
                    className="inline-flex items-center gap-0.5 text-xs bg-muted px-1.5 py-0.5 rounded"
                  >
                    :{r.name}: {r.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {replies.length === 0 && (
          <div className="text-muted-foreground text-sm text-center py-2">
            No replies yet
          </div>
        )}
      </div>
    </div>
  );
}

export default ThreadWatchContent;
