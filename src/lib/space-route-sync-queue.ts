import { syncSpaceRoute } from "@/lib/space-route-sync";

type RouteSyncFn = (spaceId: string) => void;
type Listener = () => void;

let syncFn: RouteSyncFn = syncSpaceRoute;
let assistantRunActive = false;
let activeToolExecutionCount = 0;
let pendingSpaceId: string | null = null;
const listeners = new Set<Listener>();

function isAssistantBusy(): boolean {
  return assistantRunActive || activeToolExecutionCount > 0;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function flushPendingIfReady(): void {
  if (isAssistantBusy() || !pendingSpaceId) return;
  const spaceId = pendingSpaceId;
  pendingSpaceId = null;
  syncFn(spaceId);
}

export function setAssistantRunActive(active: boolean): void {
  const wasBusy = isAssistantBusy();
  assistantRunActive = active;
  const isBusy = isAssistantBusy();
  if (wasBusy !== isBusy) {
    notifyListeners();
  }
  flushPendingIfReady();
}

export function getAssistantRunActive(): boolean {
  return isAssistantBusy();
}

export function subscribeAssistantRunActive(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestSpaceRouteSync(spaceId: string): { deferred: boolean } {
  if (isAssistantBusy()) {
    pendingSpaceId = spaceId;
    return { deferred: true };
  }

  syncFn(spaceId);
  return { deferred: false };
}

export function setSpaceRouteSyncFnForTests(fn: RouteSyncFn): void {
  syncFn = fn;
}

export function beginAssistantToolExecution(): () => void {
  const wasBusy = isAssistantBusy();
  activeToolExecutionCount += 1;
  const isBusy = isAssistantBusy();
  if (wasBusy !== isBusy) {
    notifyListeners();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const busyBeforeRelease = isAssistantBusy();
    activeToolExecutionCount = Math.max(0, activeToolExecutionCount - 1);
    const busyAfterRelease = isAssistantBusy();
    if (busyBeforeRelease !== busyAfterRelease) {
      notifyListeners();
    }
    flushPendingIfReady();
  };
}

export function resetSpaceRouteSyncQueueForTests(): void {
  syncFn = syncSpaceRoute;
  assistantRunActive = false;
  activeToolExecutionCount = 0;
  pendingSpaceId = null;
  listeners.clear();
}
