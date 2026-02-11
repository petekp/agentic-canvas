// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasHeader } from "@/components/canvas/CanvasHeader";

const mockNavigateToGrid = vi.fn();
const mockRenameSpace = vi.fn();
const mockSaveSpace = vi.fn();

let renderCount = 0;

vi.mock("@/hooks/useSpaceNavigation", () => ({
  useSpaceNavigation: () => ({
    navigateToGrid: mockNavigateToGrid,
  }),
}));

vi.mock("@/hooks/useSpaces", () => ({
  useSpaces: () => {
    renderCount += 1;
    return {
      activeSpaceId: "space_1",
      spaces: [{ id: "space_1", name: `Space ${renderCount}` }],
      renameSpace: mockRenameSpace,
      hasUnsavedChanges: () => false,
      saveSpace: mockSaveSpace,
    };
  },
}));

describe("CanvasHeader sync behavior", () => {
  it("does not enter an update loop when space objects are unstable", () => {
    const originalError = console.error;
    console.error = vi.fn();
    renderCount = 0;

    expect(() => {
      render(<CanvasHeader />);
    }).not.toThrow();

    console.error = originalError;
  });
});

