"use client";

import { useMemo, useCallback } from "react";
import { DataTable, type Column } from "@/components/tool-ui/data-table";
import { openInNewTab, createGitHubItemUrl } from "./shared";
import type { PRData, PRRow } from "./types";

interface PRListContentProps {
  data: PRData[];
  repo: string;
  componentId: string;
}

export function PRListContent({ data, repo, componentId }: PRListContentProps) {
  const columns: Column<PRRow>[] = useMemo(
    () => [
      { key: "number", label: "#", width: "50px", sortable: true },
      { key: "title", label: "Title", truncate: true, priority: "primary" },
      { key: "author", label: "Author", hideOnMobile: true },
      { key: "state", label: "State", format: { kind: "badge" } },
      {
        key: "updatedAt",
        label: "Updated",
        format: { kind: "date", dateFormat: "relative" },
        align: "right",
      },
    ],
    []
  );

  const rows: PRRow[] = useMemo(
    () =>
      data.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        state: pr.state,
        labels: pr.labels,
        updatedAt: new Date(pr.updatedAt).toISOString(),
      })),
    [data]
  );

  const handleRowClick = useCallback(
    (row: PRRow) => {
      if (repo) {
        openInNewTab(createGitHubItemUrl(repo, "pull", row.number));
      }
    },
    [repo]
  );

  return (
    <DataTable
      id={`pr-list-${componentId}`}
      columns={columns}
      data={rows}
      rowIdKey="id"
      emptyMessage="No pull requests"
      defaultSort={{ by: "updatedAt", direction: "desc" }}
      onRowClick={handleRowClick}
    />
  );
}

export default PRListContent;
