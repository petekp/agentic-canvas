"use client";

// Canvas component - the main grid-based workspace
// See: .claude/plans/store-architecture-v0.1.md

import { useEffect, useRef, useCallback } from "react";
import { useCanvas, useHistory } from "@/hooks";
import { CanvasGrid } from "./CanvasGrid";
import { ComponentRenderer } from "./ComponentRenderer";

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { components, grid, setGridDimensions } = useCanvas();
  const { canUndo, canRedo, undo, redo } = useHistory();

  // Calculate cell dimensions on mount and resize
  const updateGridDimensions = useCallback(() => {
    if (!containerRef.current) return;

    const { width, height } = containerRef.current.getBoundingClientRect();
    const totalGapWidth = grid.gap * (grid.columns - 1);
    const totalGapHeight = grid.gap * (grid.rows - 1);

    const cellWidth = (width - totalGapWidth) / grid.columns;
    const cellHeight = (height - totalGapHeight) / grid.rows;

    setGridDimensions(cellWidth, cellHeight);
  }, [grid.columns, grid.rows, grid.gap, setGridDimensions]);

  useEffect(() => {
    updateGridDimensions();

    const resizeObserver = new ResizeObserver(updateGridDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [updateGridDimensions]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey && canRedo) {
          redo();
        } else if (!e.shiftKey && canUndo) {
          undo();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--grid-color)]">
        <h1 className="text-xl font-semibold">Agentic Canvas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--grid-color)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--grid-line)] transition-colors"
          >
            Undo
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--grid-color)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--grid-line)] transition-colors"
          >
            Redo
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 relative p-4 overflow-hidden"
        style={{
          minHeight: "600px",
        }}
      >
        {/* Grid background */}
        <CanvasGrid grid={grid} />

        {/* Components */}
        {components.map((component) => (
          <ComponentRenderer key={component.id} component={component} grid={grid} />
        ))}

        {/* Empty state */}
        {components.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-[var(--foreground)]/50">
              <p className="text-lg">Canvas is empty</p>
              <p className="text-sm mt-1">Add components to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
