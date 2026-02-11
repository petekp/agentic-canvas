"use client";

import { useStore } from "@/store";
import type { ComponentId } from "@/types";

export function useComponent(id: ComponentId) {
  return useStore((state) => state.canvas.components.find((c) => c.id === id));
}

