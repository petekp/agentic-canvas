// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentInstance } from "@/types";
import { ComponentContent } from "@/components/canvas/ComponentContent";

const mockRefresh = vi.fn();
const mockRemoveComponent = vi.fn();

vi.mock("@/hooks/useCanvas", () => ({
  useCanvas: () => ({
    removeComponent: mockRemoveComponent,
  }),
}));

vi.mock("@/hooks/useComponentData", () => ({
  useComponentData: () => ({
    dataState: { status: "idle" },
    refresh: mockRefresh,
  }),
}));

vi.mock("@/store", () => ({
  useStore: (selector: (state: { getRulesForTarget: () => unknown[] }) => boolean) =>
    selector({
      getRulesForTarget: () => [],
    }),
}));

function createComponent(label?: string): ComponentInstance {
  return {
    id: "cmp_test",
    typeId: "slack.channel-activity",
    position: { col: 0, row: 0 },
    size: { cols: 4, rows: 4 },
    config: {},
    dataBinding: null,
    dataState: { status: "idle" },
    meta: {
      createdAt: Date.now(),
      createdBy: "assistant",
      pinned: false,
      label,
    },
  };
}

describe("ComponentContent header label", () => {
  beforeEach(() => {
    cleanup();
  });

  it("prefers custom component label in the header", () => {
    render(<ComponentContent component={createComponent("Slack Activity")} />);
    expect(screen.getByText("Slack Activity")).toBeTruthy();
  });

  it("falls back to formatted type when label is missing", () => {
    render(<ComponentContent component={createComponent(undefined)} />);
    expect(screen.getByText("Channel Activity")).toBeTruthy();
  });
});
