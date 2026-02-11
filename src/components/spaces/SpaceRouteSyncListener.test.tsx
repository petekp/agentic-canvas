// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpaceRouteSyncListener } from "@/components/spaces/SpaceRouteSyncListener";
import { SPACE_NAVIGATE_EVENT } from "@/lib/space-route-sync";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockLoadSpace = vi.fn();
const mockMarkMorningBriefAutoOpened = vi.fn();

const state = {
  spaces: [
    { id: "space_morning", name: "Your Morning Brief", kind: "system.morning_brief" },
    { id: "space_old", name: "Old Space", kind: "ad_hoc" },
  ],
  activeSpaceId: "space_old" as string | null,
  loadSpace: mockLoadSpace,
  workspaceSettings: { autoOpenMorningBrief: true },
  morningBriefRuntime: { lastAutoOpenedAt: undefined as string | undefined },
  markMorningBriefAutoOpened: mockMarkMorningBriefAutoOpened,
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/spaces",
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

vi.mock("@/hooks/useSpaces", () => ({
  useSpaces: () => state,
}));

describe("SpaceRouteSyncListener", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockLoadSpace.mockReset();
    mockMarkMorningBriefAutoOpened.mockReset();
    state.spaces = [
      { id: "space_morning", name: "Your Morning Brief", kind: "system.morning_brief" },
      { id: "space_old", name: "Old Space", kind: "ad_hoc" },
    ];
    state.activeSpaceId = "space_old";
    state.workspaceSettings.autoOpenMorningBrief = false;
    state.morningBriefRuntime.lastAutoOpenedAt = undefined;
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

  it("auto-opens morning brief on first local session of day", () => {
    state.workspaceSettings.autoOpenMorningBrief = true;
    render(<SpaceRouteSyncListener />);

    expect(mockLoadSpace).toHaveBeenCalledWith("space_morning");
    expect(mockReplace).toHaveBeenCalledWith("/spaces/space_morning");
    expect(mockMarkMorningBriefAutoOpened).toHaveBeenCalledTimes(1);
  });

  it("does not auto-open morning brief when already auto-opened today", () => {
    state.morningBriefRuntime.lastAutoOpenedAt = new Date().toISOString();

    render(<SpaceRouteSyncListener />);

    expect(mockLoadSpace).not.toHaveBeenCalledWith("space_morning");
    expect(mockReplace).not.toHaveBeenCalledWith("/spaces/space_morning");
    expect(mockMarkMorningBriefAutoOpened).not.toHaveBeenCalled();
  });

  it("does not auto-open morning brief when user disabled it", () => {
    state.workspaceSettings.autoOpenMorningBrief = false;

    render(<SpaceRouteSyncListener />);

    expect(mockLoadSpace).not.toHaveBeenCalledWith("space_morning");
    expect(mockReplace).not.toHaveBeenCalledWith("/spaces/space_morning");
    expect(mockMarkMorningBriefAutoOpened).not.toHaveBeenCalled();
  });
});
