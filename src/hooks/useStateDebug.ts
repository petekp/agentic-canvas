import { useEffect, useState } from "react";
import type { StateSnapshot } from "@/types";
import { buildStateSnapshotFromSignals } from "@/lib/templates/state-signals";

export function useStateDebugSnapshot(enabled: boolean, intervalMs = 2000) {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      return;
    }

    const update = () => {
      setSnapshot(buildStateSnapshotFromSignals());
    };

    update();
    const intervalId = window.setInterval(update, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs]);

  return snapshot;
}
