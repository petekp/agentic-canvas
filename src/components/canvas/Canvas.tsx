"use client";

// Canvas component - the main grid-based workspace
// Uses react-grid-layout for drag & drop and resize functionality

import { useEffect, useCallback, useState, useMemo } from "react";
import ReactGridLayout, { useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import { noCompactor } from "react-grid-layout/core";
import { useCanvas, useHistory } from "@/hooks";
import { ComponentContent } from "./ComponentContent";
import type { ComponentInstance } from "@/types";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

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

  const handleAdd = (type: (typeof componentTypes)[0]) => {
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

// Convert our components to react-grid-layout format
function componentsToLayout(components: ComponentInstance[]) {
  return components.map((c) => ({
    i: c.id,
    x: c.position.col,
    y: c.position.row,
    w: c.size.cols,
    h: c.size.rows,
    minW: 1,
    minH: 1,
  }));
}

export function Canvas() {
  const { components, grid, moveComponent, resizeComponent } = useCanvas();
  const { canUndo, canRedo, undo, redo } = useHistory();
  const { width, containerRef, mounted } = useContainerWidth();

  // Convert components to layout format
  const layout = useMemo(() => componentsToLayout(components), [components]);

  // Calculate row height based on container
  const rowHeight = 80;

  // Handle drag stop - commit move to store with undo support
  const handleDragStop = useCallback(
    (_layout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (!oldItem || !newItem) return;
      if (oldItem.x !== newItem.x || oldItem.y !== newItem.y) {
        moveComponent(newItem.i, { col: newItem.x, row: newItem.y });
      }
    },
    [moveComponent]
  );

  // Handle resize stop - commit resize to store with undo support
  const handleResizeStop = useCallback(
    (_layout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (!oldItem || !newItem) return;
      if (oldItem.w !== newItem.w || oldItem.h !== newItem.h) {
        resizeComponent(newItem.i, { cols: newItem.w, rows: newItem.h });
      }
    },
    [resizeComponent]
  );

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

  // Find component by ID
  const getComponent = useCallback(
    (id: string) => components.find((c) => c.id === id),
    [components]
  );

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
        className="flex-1 relative p-4 overflow-auto"
        style={{ minHeight: "600px" }}
      >
        {/* Empty state */}
        {components.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-[var(--foreground)]/50">
              <p className="text-lg">Canvas is empty</p>
              <p className="text-sm mt-1">Add components to get started</p>
            </div>
          </div>
        )}

        {/* Grid with components */}
        {mounted && width > 0 && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{
              cols: grid.columns,
              rowHeight,
              margin: [grid.gap, grid.gap],
            }}
            dragConfig={{
              enabled: true,
              handle: ".drag-handle",
            }}
            resizeConfig={{
              enabled: true,
              handles: ["se"],
            }}
            onDragStop={handleDragStop}
            onResizeStop={handleResizeStop}
            compactor={noCompactor}
          >
            {layout.map((item) => {
              const component = getComponent(item.i);
              if (!component) return null;
              return (
                <div
                  key={item.i}
                  className="rounded-lg border border-[var(--grid-line)] bg-[var(--background)] shadow-sm overflow-hidden"
                >
                  <ComponentContent component={component} />
                </div>
              );
            })}
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
}
