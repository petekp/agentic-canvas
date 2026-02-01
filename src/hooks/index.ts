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

// Selection hook - returns whether a specific component is selected
export function useIsSelected(id: ComponentId) {
  return useStore((state) => state.selectedComponentId === id);
}

export function useComponentsByType(typeId: string) {
  return useStore(useShallow((state) => state.canvas.components.filter((c) => c.typeId === typeId)));
}

// Re-export undo hooks
export {
  useUndo,
  useUndoSimple,
  useUndoKeyboardShortcuts,
  useBatch,
  useUndoHistoryViewer,
} from "./useUndo";

// View hooks
export function useViews() {
  return useStore(
    useShallow((state) => ({
      views: state.workspace.views,
      activeViewId: state.activeViewId,
      saveView: state.saveView,
      loadView: state.loadView,
      deleteView: state.deleteView,
      renameView: state.renameView,
      duplicateView: state.duplicateView,
      setActiveView: state.setActiveView,
      hasUnsavedChanges: state.hasUnsavedChanges,
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

export function useIsLoading() {
  return useStore((state) => state.canvas.components.some((c) => c.dataState.status === "loading"));
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

export function useTheme() {
  return useStore((state) => state.workspace.settings.theme);
}
