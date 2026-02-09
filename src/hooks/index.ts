// React hooks for store access
// See: .claude/plans/store-architecture-v0.1.md

export { useCanvas } from "./useCanvas";
export { useComponent } from "./useComponent";

// Re-export undo hooks
export {
  useUndo,
  useUndoSimple,
  useUndoKeyboardShortcuts,
  useBatch,
  useUndoHistoryViewer,
} from "./useUndo";

// Space hooks
export { useSpaces } from "./useSpaces";

// Data hooks
export { useComponentData } from "./useComponentData";

// Settings hooks
export { useSettings } from "./useSettings";

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
export { useNotifications } from "./useNotifications";
