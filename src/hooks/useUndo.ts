// Enhanced Undo Hook - Access undo/redo functionality with enhanced features
// See: .claude/plans/undo-redo-system-v2.md

import { useCallback, useEffect } from "react";
import { useShallow } from "zustand/shallow";
import { useStore } from "@/store";
import type { CommandSource, BatchId } from "@/lib/undo/types";

// ============================================================================
// Main Undo Hook
// ============================================================================

export function useUndo() {
  const {
    // State
    undoStack,
    redoStack,
    activeBatch,

    // Core operations
    undo,
    redo,
    pushUndo,

    // Batch operations
    startBatch,
    addToBatch,
    commitBatch,
    abortBatch,

    // Queries
    canUndo,
    canRedo,
    getUndoDescription,
    getRedoDescription,
    getUndoHistory,
  } = useStore(
    useShallow((state) => ({
      undoStack: state.undoStack,
      redoStack: state.redoStack,
      activeBatch: state.activeBatch,
      undo: state.undo,
      redo: state.redo,
      pushUndo: state.pushUndo,
      startBatch: state.startBatch,
      addToBatch: state.addToBatch,
      commitBatch: state.commitBatch,
      abortBatch: state.abortBatch,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      getUndoDescription: state.getUndoDescription,
      getRedoDescription: state.getRedoDescription,
      getUndoHistory: state.getUndoHistory,
    }))
  );

  return {
    // State
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    isInBatch: activeBatch !== null,
    batchId: activeBatch?.id ?? null,
    batchDescription: activeBatch?.description ?? null,

    // Computed
    canUndo: canUndo(),
    canRedo: canRedo(),
    undoDescription: getUndoDescription(),
    redoDescription: getRedoDescription(),

    // Core operations
    undo,
    redo,
    pushUndo,

    // Batch operations
    startBatch,
    addToBatch,
    commitBatch,
    abortBatch,

    // Query operations
    getHistory: getUndoHistory,
  };
}

// ============================================================================
// Simple Undo Hook (for basic usage)
// ============================================================================

/**
 * Simplified hook for basic undo/redo functionality
 */
export function useUndoSimple() {
  const {
    undoStack,
    redoStack,
    undo,
    redo,
    canUndo,
    canRedo,
    getUndoDescription,
    getRedoDescription,
  } = useStore(
    useShallow((state) => ({
      undoStack: state.undoStack,
      redoStack: state.redoStack,
      undo: state.undo,
      redo: state.redo,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      getUndoDescription: state.getUndoDescription,
      getRedoDescription: state.getRedoDescription,
    }))
  );

  return {
    canUndo: canUndo(),
    canRedo: canRedo(),
    undoDescription: getUndoDescription(),
    redoDescription: getRedoDescription(),
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    undo,
    redo,
  };
}

// ============================================================================
// Keyboard Shortcuts Hook
// ============================================================================

/**
 * Enables Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z keyboard shortcuts
 */
export function useUndoKeyboardShortcuts() {
  const { undo, redo } = useStore(
    useShallow((state) => ({
      undo: state.undo,
      redo: state.redo,
    }))
  );

  const canUndo = useStore((state) => state.undoStack.length > 0);
  const canRedo = useStore((state) => state.redoStack.length > 0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Check for Cmd/Ctrl+Z or Cmd/Ctrl+Shift+Z
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        // Don't intercept if user is in an input field
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        e.preventDefault();

        if (e.shiftKey) {
          // Redo
          if (canRedo) {
            redo();
          }
        } else {
          // Undo
          if (canUndo) {
            undo();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);
}

// ============================================================================
// Batch Helper Hook
// ============================================================================

/**
 * Helper hook for managing batched operations
 */
export function useBatch() {
  const { startBatch, commitBatch, abortBatch, activeBatch } = useStore(
    useShallow((state) => ({
      startBatch: state.startBatch,
      commitBatch: state.commitBatch,
      abortBatch: state.abortBatch,
      activeBatch: state.activeBatch,
    }))
  );

  const isActive = activeBatch !== null;

  /**
   * Execute a function within a batch context
   * All undo entries created during the function will be combined into one
   */
  const withBatch = useCallback(
    async <T>(
      source: CommandSource,
      description: string,
      fn: (batchId: BatchId) => T | Promise<T>
    ): Promise<T> => {
      const batchId = startBatch(source, description);
      try {
        const result = await fn(batchId);
        commitBatch();
        return result;
      } catch (error) {
        abortBatch();
        throw error;
      }
    },
    [startBatch, commitBatch, abortBatch]
  );

  return {
    isActive,
    batchId: activeBatch?.id ?? null,
    description: activeBatch?.description ?? null,
    start: startBatch,
    commit: commitBatch,
    abort: abortBatch,
    withBatch,
  };
}

// ============================================================================
// History Viewer Hook
// ============================================================================

/**
 * Hook for viewing undo history (useful for history panel UI)
 */
export function useUndoHistoryViewer(limit?: number) {
  const getUndoHistory = useStore((state) => state.getUndoHistory);
  const undoStack = useStore((state) => state.undoStack);

  // Re-compute history when stack changes
  const history = getUndoHistory(limit);

  return {
    entries: history,
    totalCount: undoStack.length,
    hasMore: limit ? undoStack.length > limit : false,
  };
}
