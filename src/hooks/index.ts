// React hooks for store access
// See: .claude/plans/store-architecture-v0.1.md

import { useShallow } from "zustand/shallow";
import { useStore } from "@/store";
import type { ComponentId } from "@/types";

// Canvas hooks
export function useCanvas() {
  return useStore(
    useShallow((state) => ({
      components: state.canvas.components,
      grid: state.canvas.grid,
      selectedComponentId: state.selectedComponentId,
      addComponent: state.addComponent,
      removeComponent: state.removeComponent,
      moveComponent: state.moveComponent,
      resizeComponent: state.resizeComponent,
      clearCanvas: state.clearCanvas,
      setGridDimensions: state.setGridDimensions,
      selectComponent: state.selectComponent,
    }))
  );
}

export function useComponent(id: ComponentId) {
  return useStore((state) => state.canvas.components.find((c) => c.id === id));
}

// Re-export undo hooks
export {
  useUndo,
  useUndoSimple,
  useUndoKeyboardShortcuts,
  useBatch,
  useUndoHistoryViewer,
} from "./useUndo";

// Space hooks
export function useSpaces() {
  return useStore(
    useShallow((state) => ({
      spaces: state.workspace.spaces,
      activeSpaceId: state.activeSpaceId,
      lastSpaceId: state.lastSpaceId,
      saveSpace: state.saveSpace,
      loadSpace: state.loadSpace,
      deleteSpace: state.deleteSpace,
      renameSpace: state.renameSpace,
      duplicateSpace: state.duplicateSpace,
      createEmptySpace: state.createEmptySpace,
      setActiveSpace: state.setActiveSpace,
      hasUnsavedChanges: state.hasUnsavedChanges,
      pinSpace: state.pinSpace,
      unpinSpace: state.unpinSpace,
    }))
  );
}

// Data hooks
export function useComponentData(id: ComponentId) {
  const component = useStore((state) => state.canvas.components.find((c) => c.id === id));
  const refreshComponent = useStore((state) => state.refreshComponent);

  return {
    dataState: component?.dataState ?? { status: "idle" },
    refresh: () => refreshComponent(id),
  };
}

// Settings hooks
export function useSettings() {
  return useStore(
    useShallow((state) => ({
      settings: state.workspace.settings,
      updateSettings: state.updateSettings,
    }))
  );
}

// Polling hook
export { usePolling } from "./usePolling";

// Insight loop hook
export { useInsightLoop, addRecentChange } from "./useInsightLoop";

// State signal adapter hook
export { useStateSignals } from "./useStateSignals";
export { useStateDebugSnapshot } from "./useStateDebug";

// Space navigation hook
export { useSpaceNavigation } from "./useSpaceNavigation";

// Notification hooks
export function useNotifications() {
  return useStore(
    useShallow((state) => ({
      notifications: state.getActive(),
      unreadCount: state.getUnreadCount(),
      pollingEnabled: state.pollingEnabled,
      markAsRead: state.markAsRead,
      markAllAsRead: state.markAllAsRead,
      dismiss: state.dismiss,
      dismissAll: state.dismissAll,
      setPollingEnabled: state.setPollingEnabled,
      addNotification: state.addNotification,
    }))
  );
}
