"use client";

import { useShallow } from "zustand/shallow";
import { useStore } from "@/store";

export function useSpaces() {
  return useStore(
    useShallow((state) => ({
      spaces: state.workspace.spaces,
      workspaceSettings: state.workspace.settings,
      morningBriefRuntime: state.workspace.morningBrief,
      activeSpaceId: state.activeSpaceId,
      canvasComponentCount: state.canvas.components.length,
      lastSpaceId: state.lastSpaceId,
      saveSpace: state.saveSpace,
      loadSpace: state.loadSpace,
      deleteSpace: state.deleteSpace,
      renameSpace: state.renameSpace,
      duplicateSpace: state.duplicateSpace,
      createEmptySpace: state.createEmptySpace,
      setActiveSpace: state.setActiveSpace,
      markMorningBriefAutoOpened: state.markMorningBriefAutoOpened,
      hasUnsavedChanges: state.hasUnsavedChanges,
      pinSpace: state.pinSpace,
      unpinSpace: state.unpinSpace,
    }))
  );
}
