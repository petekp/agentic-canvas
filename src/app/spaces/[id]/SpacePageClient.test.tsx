// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpacePageClient } from "@/app/spaces/[id]/SpacePageClient";

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockLoadSpace = vi.fn();

const state = {
  spaces: [
    { id: "space_old", name: "Old Space", kind: "ad_hoc" },
    { id: "space_new", name: "New Space", kind: "ad_hoc" },
  ],
  activeSpaceId: "space_old" as string | null,
  canvasComponentCount: 1,
  loadSpace: mockLoadSpace,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

vi.mock("@/hooks/useSpaces", () => ({
  useSpaces: () => state,
}));

vi.mock("@/components/canvas/Canvas", () => ({
  Canvas: () => <div data-testid="canvas" />,
}));

vi.mock("@/components/chat/ChatPanelLazy", () => ({
  ChatPanelLazy: () => <div data-testid="chat" />,
}));

vi.mock("@/components/spaces/SpaceRouteSyncListener", () => ({
  SpaceRouteSyncListener: () => null,
}));

describe("SpacePageClient", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockLoadSpace.mockReset();
    state.spaces = [
      { id: "space_old", name: "Old Space", kind: "ad_hoc" },
      { id: "space_new", name: "New Space", kind: "ad_hoc" },
    ];
    state.activeSpaceId = "space_old";
    state.canvasComponentCount = 1;
  });

  it("does not reload the stale route when active space changes during navigation", () => {
    const { rerender } = render(<SpacePageClient id="space_old" />);

    expect(mockLoadSpace).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    // Simulate create_space switching active space before old route unmounts.
    state.activeSpaceId = "space_new";
    rerender(<SpacePageClient id="space_old" />);

    // Old route component should not force-load its own id back.
    expect(mockLoadSpace).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/spaces/space_new");
  });

  it("loads route space when opening a different space directly", () => {
    render(<SpacePageClient id="space_new" />);

    expect(mockLoadSpace).toHaveBeenCalledTimes(1);
    expect(mockLoadSpace).toHaveBeenCalledWith("space_new");
  });

  it("hydrates morning brief route when already active but canvas is empty", () => {
    state.spaces = [{ id: "space_morning", name: "Your Morning Brief", kind: "system.morning_brief" }];
    state.activeSpaceId = "space_morning";
    state.canvasComponentCount = 0;

    render(<SpacePageClient id="space_morning" />);

    expect(mockLoadSpace).toHaveBeenCalledTimes(1);
    expect(mockLoadSpace).toHaveBeenCalledWith("space_morning");
  });
});
