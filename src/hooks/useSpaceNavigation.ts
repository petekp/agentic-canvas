// Space Navigation Hook - handles navigation between spaces and the grid
// See: .claude/plans/spaces-navigation-v0.2.md

"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSpaces } from "@/hooks/useSpaces";
import type { SpaceId } from "@/types";

/**
 * Hook for navigating between spaces and the grid.
 * Combines route navigation with store state updates.
 */
export function useSpaceNavigation() {
  const router = useRouter();
  const { loadSpace, setActiveSpace } = useSpaces();

  /**
   * Navigate to a specific space.
   * Updates store state and browser URL.
   */
  const navigateToSpace = useCallback(
    (spaceId: SpaceId) => {
      loadSpace(spaceId);
      router.push(`/spaces/${spaceId}`);
    },
    [loadSpace, router]
  );

  /**
   * Navigate to the spaces grid.
   * Optionally clear the active space.
   */
  const navigateToGrid = useCallback(
    (clearActive = false) => {
      if (clearActive) {
        setActiveSpace(null);
      }
      router.push("/spaces");
    },
    [setActiveSpace, router]
  );

  /**
   * Go back in browser history.
   * Useful for back buttons that should respect browser history.
   */
  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  return {
    navigateToSpace,
    navigateToGrid,
    goBack,
  };
}
