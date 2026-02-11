// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentInstance, DataLoadingState } from "@/types";
import { ComponentContent } from "@/components/canvas/ComponentContent";

const mockRefresh = vi.fn();
const mockRemoveComponent = vi.fn();
let mockDataState: DataLoadingState = { status: "idle" };

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

function createComponent(typeId: string): ComponentInstance {
  return {
    id: "cmp_test",
    typeId,
    position: { col: 0, row: 0 },
    size: { cols: 6, rows: 5 },
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

describe("ComponentContent morning brief idle bootstrap", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockRemoveComponent.mockReset();
    mockDataState = { status: "idle" };
  });

  it("auto-refreshes in dev/test when morning brief is idle", async () => {
    render(<ComponentContent component={createComponent("system.morning-brief")} />);

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does not auto-refresh unrelated idle components", async () => {
    render(<ComponentContent component={createComponent("github.pr-list")} />);

    await waitFor(
      () => {
        expect(mockRefresh).toHaveBeenCalledTimes(0);
      },
      { timeout: 100 }
    );
  });
});

