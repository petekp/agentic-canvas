import { useEffect } from "react";
import { registerStateSignalListeners } from "@/lib/templates/state-signals";

export function useStateSignals() {
  useEffect(() => {
    registerStateSignalListeners();
  }, []);
}
