"use client";

// SpacesGrid - Grid container for space cards
// See: .claude/plans/spaces-navigation-v0.2.md

import { useState, useMemo, useCallback } from "react";
import { useSpaces } from "@/hooks/useSpaces";
import { useSpaceNavigation } from "@/hooks/useSpaceNavigation";
import { SpaceCard } from "./SpaceCard";
import { CreateSpaceCard } from "./CreateSpaceCard";
import { SpacesEmptyState } from "./SpacesEmptyState";
import { DeleteSpaceDialog } from "./DeleteSpaceDialog";
import type { SpaceId, Space } from "@/types";

export function SpacesGrid() {
  const {
    spaces,
    deleteSpace,
    renameSpace,
    duplicateSpace,
    createEmptySpace,
    pinSpace,
    unpinSpace,
  } = useSpaces();
  const { navigateToSpace } = useSpaceNavigation();

  const [deleteConfirmSpace, setDeleteConfirmSpace] = useState<Space | null>(null);

  // Sort spaces: pinned first, then by lastVisitedAt (most recent first)
  const sortedSpaces = useMemo(() => {
    return [...spaces].sort((a, b) => {
      // Pinned spaces first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // Then by last visited (most recent first)
      const aTime = a.lastVisitedAt || a.updatedAt;
      const bTime = b.lastVisitedAt || b.updatedAt;
      return bTime - aTime;
    });
  }, [spaces]);

  const handleCreateSpace = useCallback(() => {
    const newSpaceId = createEmptySpace("New Space");
    navigateToSpace(newSpaceId);
  }, [createEmptySpace, navigateToSpace]);

  const handleSelectSpace = useCallback(
    (spaceId: SpaceId) => {
      navigateToSpace(spaceId);
    },
    [navigateToSpace]
  );

  const handleDuplicateSpace = useCallback(
    (spaceId: SpaceId) => {
      const newId = duplicateSpace(spaceId);
      if (newId) {
        navigateToSpace(newId);
      }
    },
    [duplicateSpace, navigateToSpace]
  );

  const handleDeleteSpace = useCallback(
    (space: Space) => {
      setDeleteConfirmSpace(space);
    },
    []
  );

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirmSpace) {
      deleteSpace(deleteConfirmSpace.id);
      setDeleteConfirmSpace(null);
    }
  }, [deleteConfirmSpace, deleteSpace]);

  const handleTogglePin = useCallback(
    (space: Space) => {
      if (space.pinned) {
        unpinSpace(space.id);
      } else {
        pinSpace(space.id);
      }
    },
    [pinSpace, unpinSpace]
  );

  // Show empty state if no spaces
  if (spaces.length === 0) {
    return <SpacesEmptyState onCreateSpace={handleCreateSpace} />;
  }

  return (
    <>
      <div className="p-6 h-full overflow-auto">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6">Spaces</h1>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {sortedSpaces.map((space) => (
              <SpaceCard
                key={space.id}
                space={space}
                onSelect={() => handleSelectSpace(space.id)}
                onRename={(newName) => renameSpace(space.id, newName)}
                onDuplicate={() => handleDuplicateSpace(space.id)}
                onTogglePin={() => handleTogglePin(space)}
                onDelete={() => handleDeleteSpace(space)}
              />
            ))}
            <CreateSpaceCard onClick={handleCreateSpace} />
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <DeleteSpaceDialog
        open={!!deleteConfirmSpace}
        spaceName={deleteConfirmSpace?.name ?? ""}
        componentCount={deleteConfirmSpace?.snapshot.components.length ?? 0}
        onOpenChange={(open) => !open && setDeleteConfirmSpace(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
