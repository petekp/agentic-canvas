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

// History hooks
export function useHistory() {
  return useStore(
    useShallow((state) => ({
      canUndo: state.history.undoStack.length > 0,
      canRedo: state.history.redoStack.length > 0,
      undo: state.undo,
      redo: state.redo,
      clearHistory: state.clearHistory,
      undoDescription: state.history.undoStack[state.history.undoStack.length - 1]?.description,
      redoDescription: state.history.redoStack[state.history.redoStack.length - 1]?.description,
    }))
  );
}

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
