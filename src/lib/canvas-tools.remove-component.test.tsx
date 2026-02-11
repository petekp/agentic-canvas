// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RemoveComponentTool } from "@/lib/canvas-tools";

describe("RemoveComponentTool UI", () => {
  it("does not crash when component_id is missing from args", () => {
    const tool = RemoveComponentTool.unstable_tool as {
      render: (props: { args: Record<string, unknown>; status: { type: string } }) => React.ReactElement;
    };

    expect(() => {
      render(tool.render({ args: {}, status: { type: "complete" } }));
    }).not.toThrow();

    expect(screen.getByText("Remove component")).toBeTruthy();
    expect(screen.getByText("unknown")).toBeTruthy();
  });

  it("shows tool error details when remove fails", () => {
    const tool = RemoveComponentTool.unstable_tool as {
      render: (props: {
        args: Record<string, unknown>;
        status: { type: string };
        result?: unknown;
      }) => React.ReactElement;
    };

    render(
      tool.render({
        args: { component_id: "cmp_DOES_NOT_EXIST" },
        status: { type: "complete" },
        result: { success: false, error: "Component not found" },
      })
    );

    expect(screen.getAllByText("Remove component").length).toBeGreaterThan(0);
    expect(screen.getByText(/component not found/i)).toBeTruthy();
  });
});
