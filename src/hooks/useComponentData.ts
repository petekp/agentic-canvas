"use client";

import { useStore } from "@/store";
import type { ComponentId } from "@/types";

export function useComponentData(id: ComponentId) {
  const component = useStore((state) => state.canvas.components.find((c) => c.id === id));
  const refreshComponent = useStore((state) => state.refreshComponent);

  return {
    dataState: component?.dataState ?? { status: "idle" },
    refresh: () => refreshComponent(id),
  };
}

