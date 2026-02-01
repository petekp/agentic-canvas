"use client";

import { useCallback } from "react";
import { formatRelativeTime, openInNewTab } from "./shared";
import type { CommitData } from "./types";

interface CommitsContentProps {
  data: CommitData[];
}

export function CommitsContent({ data }: CommitsContentProps) {
  const handleCommitClick = useCallback((url: string) => {
    openInNewTab(url);
  }, []);

  return (
    <div className="flex flex-col gap-1 h-full overflow-auto">
      {data.map((commit) => (
        <div
          key={commit.sha}
          className="flex items-start gap-2 text-sm py-1.5 px-1 -mx-1 rounded cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => handleCommitClick(commit.url)}
        >
          <code className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">
            {commit.sha}
          </code>
          <div className="min-w-0 flex-1">
            <p className="truncate">{commit.message}</p>
            <p className="text-xs text-muted-foreground">
              {commit.author} · {formatRelativeTime(commit.timestamp)}
            </p>
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">
          No commits in this time window
        </div>
      )}
    </div>
  );
}

export default CommitsContent;
