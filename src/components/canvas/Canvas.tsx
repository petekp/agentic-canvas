"use client";

// Canvas component - the main grid-based workspace
// See: .claude/plans/store-architecture-v0.1.md

import { useEffect, useRef, useCallback, useState } from "react";
import { useCanvas, useHistory } from "@/hooks";
import { CanvasGrid } from "./CanvasGrid";
import { ComponentRenderer } from "./ComponentRenderer";

// Test button to add sample components (temporary for development)
function AddTestComponentButton() {
  const { addComponent } = useCanvas();
  const [isOpen, setIsOpen] = useState(false);

  const componentTypes = [
    {
      typeId: "github.stat-tile",
      label: "Stat Tile",
      config: { repo: "assistant-ui/assistant-ui", metric: "open_prs" },
      size: { cols: 2, rows: 2 },
      queryType: "stats",
    },
    {
      typeId: "github.pr-list",
      label: "PR List",
      config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 5 },
      size: { cols: 4, rows: 3 },
      queryType: "pull_requests",
    },
    {
      typeId: "github.issue-grid",
      label: "Issue Grid",
      config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 8 },
      size: { cols: 4, rows: 3 },
      queryType: "issues",
    },
    {
      typeId: "github.activity-timeline",
      label: "Activity",
      config: { repo: "assistant-ui/assistant-ui", limit: 10 },
      size: { cols: 3, rows: 4 },
      queryType: "activity",
    },
  ];

  const handleAdd = (type: typeof componentTypes[0]) => {
    addComponent({
      typeId: type.typeId,
      config: type.config,
      size: type.size,
      dataBinding: {
        source: "mock-github",
        query: {
          type: type.queryType,
          params: type.config,
        },
        refreshInterval: null,
      },
    });
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors"
      >
        + Add Component
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--background)] border border-[var(--grid-line)] rounded-md shadow-lg z-50 min-w-[160px]">
          {componentTypes.map((type) => (
            <button
              key={type.typeId}
              onClick={() => handleAdd(type)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--grid-color)] transition-colors first:rounded-t-md last:rounded-b-md"
            >
              {type.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
          <AddTestComponentButton />
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
