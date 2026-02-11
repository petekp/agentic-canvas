// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpaceRouteSyncListener } from "@/components/spaces/SpaceRouteSyncListener";
import { SPACE_NAVIGATE_EVENT } from "@/lib/space-route-sync";

const mockPush = vi.fn();
const mockLoadSpace = vi.fn();

const state = {
  activeSpaceId: "space_old" as string | null,
  loadSpace: mockLoadSpace,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/hooks/useSpaces", () => ({
  useSpaces: () => state,
}));

describe("SpaceRouteSyncListener", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockLoadSpace.mockReset();
    state.activeSpaceId = "space_old";
  });

  it("does not reload when navigate event targets the already active space", () => {
    render(<SpaceRouteSyncListener />);

    window.dispatchEvent(
      new CustomEvent<{ spaceId: string }>(SPACE_NAVIGATE_EVENT, {
        detail: { spaceId: "space_old" },
      })
    );

    expect(mockLoadSpace).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/spaces/space_old");
  });

  it("loads and routes when navigate event targets a different space", () => {
    render(<SpaceRouteSyncListener />);

    window.dispatchEvent(
      new CustomEvent<{ spaceId: string }>(SPACE_NAVIGATE_EVENT, {
        detail: { spaceId: "space_new" },
      })
    );

    expect(mockLoadSpace).toHaveBeenCalled();
    expect(mockLoadSpace.mock.calls.every(([spaceId]) => spaceId === "space_new")).toBe(true);
    expect(mockPush).toHaveBeenCalled();
    expect(mockPush.mock.calls.every(([path]) => path === "/spaces/space_new")).toBe(true);
  });
});
