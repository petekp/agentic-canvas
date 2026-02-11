"use client";

import { useShallow } from "zustand/shallow";
import { useStore } from "@/store";

export function useSettings() {
  return useStore(
    useShallow((state) => ({
      settings: state.workspace.settings,
      updateSettings: state.updateSettings,
    }))
  );
}

