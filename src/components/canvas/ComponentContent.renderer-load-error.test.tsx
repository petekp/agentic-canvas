// @vitest-environment jsdom
import { lazy } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentInstance, DataLoadingState } from "@/types";
import { ComponentContent } from "@/components/canvas/ComponentContent";

const mockRefresh = vi.fn();
const mockRemoveComponent = vi.fn();
let mockDataState: DataLoadingState = { status: "ready", data: [] as unknown, fetchedAt: Date.now() };

vi.mock("@/hooks/useCanvas", () => ({
  useCanvas: () => ({
    removeComponent: mockRemoveComponent,
  }),
}));

vi.mock("@/hooks/useComponentData", () => ({
  useComponentData: () => ({
    dataState: mockDataState,
    refresh: mockRefresh,
  }),
}));

vi.mock("@/store", () => ({
  useStore: (selector: (state: { getRulesForTarget: () => unknown[] }) => boolean) =>
    selector({
      getRulesForTarget: () => [],
    }),
}));

vi.mock("@/lib/component-registry", () => ({
  CONTENT_RENDERERS: {
    "broken.renderer": lazy(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'split')");
    }),
  },
}));

function createComponent(typeId: string): ComponentInstance {
  return {
    id: "cmp_test",
    typeId,
    position: { col: 0, row: 0 },
    size: { cols: 4, rows: 3 },
    config: {},
    dataBinding: null,
    dataState: { status: "idle" },
    meta: {
      createdAt: Date.now(),
      createdBy: "assistant",
      pinned: false,
    },
  };
}

describe("ComponentContent renderer load failures", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockRemoveComponent.mockReset();
    mockDataState = { status: "ready", data: [], fetchedAt: Date.now() };
  });

  it("shows an in-tile error instead of crashing when lazy renderer load fails", async () => {
    render(<ComponentContent component={createComponent("broken.renderer")} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load component renderer/i)).toBeTruthy();
    });
  });
});

