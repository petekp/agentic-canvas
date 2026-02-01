"use client";

import { useCallback } from "react";
import { openInNewTab } from "./shared";
import type { TopPagesData } from "./types";

interface TopPagesContentProps {
  data: TopPagesData;
}

export function TopPagesContent({ data }: TopPagesContentProps) {
  const { pages } = data;

  const handlePageClick = useCallback((property: string, path: string) => {
    const url = `https://${property}${path}`;
    openInNewTab(url);
  }, []);

  return (
    <div className="flex flex-col gap-1 h-full overflow-auto">
      {pages.map((page, index) => (
        <div
          key={`${page.property}::${page.path}`}
          className="flex items-center gap-2 text-sm py-1 px-1 -mx-1 rounded cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => handlePageClick(page.property, page.path)}
        >
          <span className="text-muted-foreground w-5 text-right shrink-0">
            {index + 1}.
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate">{page.path}</p>
            <p className="text-xs text-muted-foreground truncate">
              {page.property}
            </p>
          </div>
          <span className="text-muted-foreground shrink-0">
            {page.views.toLocaleString()}
          </span>
        </div>
      ))}
      {pages.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">
          No pages tracked
        </div>
      )}
    </div>
  );
}

export default TopPagesContent;
