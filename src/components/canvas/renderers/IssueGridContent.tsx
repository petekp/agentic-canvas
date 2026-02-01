"use client";

import { useMemo, useCallback } from "react";
import { DataTable, type Column } from "@/components/tool-ui/data-table";
import { openInNewTab, createGitHubItemUrl } from "./shared";
import type { IssueData, IssueRow } from "./types";

interface IssueGridContentProps {
  data: IssueData[];
  repo: string;
  componentId: string;
}

export function IssueGridContent({ data, repo, componentId }: IssueGridContentProps) {
  const columns: Column<IssueRow>[] = useMemo(
    () => [
      { key: "number", label: "#", width: "50px", sortable: true },
      { key: "title", label: "Title", truncate: true, priority: "primary" },
      { key: "author", label: "Author", hideOnMobile: true },
      { key: "state", label: "State", format: { kind: "badge" } },
      {
        key: "createdAt",
        label: "Created",
        format: { kind: "date", dateFormat: "relative" },
        align: "right",
      },
    ],
    []
  );

  const rows: IssueRow[] = useMemo(
    () =>
      data.map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        author: issue.author,
        state: issue.state,
        labels: issue.labels,
        createdAt: new Date(issue.createdAt).toISOString(),
      })),
    [data]
  );

  const handleRowClick = useCallback(
    (row: IssueRow) => {
      if (repo) {
        openInNewTab(createGitHubItemUrl(repo, "issues", row.number));
      }
    },
    [repo]
  );

  return (
    <DataTable
      id={`issue-list-${componentId}`}
      columns={columns}
      data={rows}
      rowIdKey="id"
      emptyMessage="No issues"
      defaultSort={{ by: "createdAt", direction: "desc" }}
      onRowClick={handleRowClick}
    />
  );
}

export default IssueGridContent;
