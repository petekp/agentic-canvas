"use client";

import { useShallow } from "zustand/shallow";
import { useStore } from "@/store";

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

