import { describe, expect, it } from "vitest";
import type { Space } from "@/types";
import { ensureUniqueSpaceName, resolveSpaceIdentifier } from "@/lib/space-selection";

function createSpace(overrides: Partial<Space> & Pick<Space, "id" | "name">): Space {
  const now = Date.now();
  return {
    id: overrides.id,
    name: overrides.name,
    kind: overrides.kind ?? "ad_hoc",
    meta: overrides.meta ?? {
      kind: overrides.kind ?? "ad_hoc",
      pinned: false,
      systemManaged: false,
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    },
    description: overrides.description,
    snapshot: overrides.snapshot ?? {
      grid: { columns: 12, rows: 8, gap: 12, cellWidth: 0, cellHeight: 0 },
      components: [],
    },
    triggerIds: overrides.triggerIds ?? [],
    pinned: overrides.pinned ?? false,
    createdBy: overrides.createdBy ?? "user",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    lastVisitedAt: overrides.lastVisitedAt ?? now,
    briefingConfig: overrides.briefingConfig,
  };
}

describe("resolveSpaceIdentifier", () => {
  it("prefers exact ID match over name matches", () => {
    const spaces = [
      createSpace({ id: "space_a", name: "Your Morning Brief" }),
      createSpace({ id: "space_b", name: "Another" }),
    ];

    const resolved = resolveSpaceIdentifier(spaces, "space_b");
    expect(resolved?.id).toBe("space_b");
  });

  it("chooses the active non-system space when duplicate names exist", () => {
    const systemSpace = createSpace({
      id: "space_system",
      name: "Your Morning Brief",
      kind: "system.morning_brief",
      meta: {
        kind: "system.morning_brief",
        pinned: true,
        systemManaged: true,
        createdBy: "assistant",
        createdAt: 1,
        updatedAt: 1,
        lastVisitedAt: 1,
      },
      createdBy: "assistant",
      createdAt: 1,
      updatedAt: 1,
      lastVisitedAt: 1,
      pinned: true,
    });
    const generatedSpace = createSpace({
      id: "space_generated",
      name: "Your Morning Brief",
      kind: "ad_hoc",
      meta: {
        kind: "ad_hoc",
        pinned: false,
        systemManaged: false,
        createdBy: "assistant",
        createdAt: 200,
        updatedAt: 200,
        lastVisitedAt: 200,
      },
      createdBy: "assistant",
      createdAt: 200,
      updatedAt: 200,
      lastVisitedAt: 200,
    });

    const resolved = resolveSpaceIdentifier(
      [systemSpace, generatedSpace],
      "Your Morning Brief",
      "space_generated"
    );

    expect(resolved?.id).toBe("space_generated");
  });
});

describe("ensureUniqueSpaceName", () => {
  it("keeps a unique name unchanged", () => {
    const spaces = [createSpace({ id: "space_a", name: "Your Morning Brief" })];
    expect(ensureUniqueSpaceName(spaces, "Focus Space")).toBe("Focus Space");
  });

  it("suffixes duplicate names with an incrementing number", () => {
    const spaces = [
      createSpace({ id: "space_a", name: "Your Morning Brief" }),
      createSpace({ id: "space_b", name: "Your Morning Brief (2)" }),
    ];

    expect(ensureUniqueSpaceName(spaces, "Your Morning Brief")).toBe(
      "Your Morning Brief (3)"
    );
  });
});
