import { describe, expect, it } from "vitest";
import { describeCanvas } from "@/lib/canvas-context";
import type { Canvas } from "@/types";

describe("describeCanvas", () => {
  it("includes error details for components with data errors", () => {
    const errorMessage =
      "Mentions feature requires a User OAuth Token (xoxp-). Bot tokens cannot use the search API. Use Channel Activity instead, or set up OAuth to get a user token.";

    const canvas: Canvas = {
      grid: {
        columns: 12,
        rows: 8,
        gap: 12,
        cellWidth: 0,
        cellHeight: 0,
      },
      components: [
        {
          id: "comp_slack_mentions",
          typeId: "slack.mentions",
          position: { col: 0, row: 0 },
          size: { cols: 4, rows: 3 },
          config: {},
          dataBinding: {
            source: "slack",
            query: { type: "mentions", params: { limit: 10 } },
            refreshInterval: 60000,
          },
          dataState: {
            status: "error",
            error: {
              code: "FORBIDDEN",
              message: errorMessage,
              source: "slack",
              retryable: false,
            },
            attemptedAt: Date.now(),
          },
          meta: {
            createdAt: Date.now(),
            createdBy: "assistant",
            pinned: false,
          },
        },
      ],
    };

    const description = describeCanvas(canvas);

    expect(description).toContain("Mentions");
    expect(description).toContain("error");
    expect(description).toContain(errorMessage);
  });
});
