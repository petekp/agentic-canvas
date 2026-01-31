"use client";

// Canvas component - the main grid-based workspace
// Uses react-grid-layout for drag & drop and resize functionality

import { useEffect, useCallback, useMemo } from "react";
import ReactGridLayout, { useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import { getCompactor } from "react-grid-layout/core";

// Allow overlap - items can stack freely, no pushing behavior
// This works well with undo/redo and future agent-driven layouts
const overlapCompactor = getCompactor(null, true, false);
import { useCanvas, useHistory } from "@/hooks";
import { ComponentContent } from "./ComponentContent";
import type { ComponentInstance } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Undo2, Redo2, Plus, Layers } from "lucide-react";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// Component types available to add
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
  {
    typeId: "github.my-activity",
    label: "My Activity",
    config: { timeWindow: "7d", feedLimit: 10 },
    size: { cols: 4, rows: 5 },
    queryType: "my_activity",
  },
];

// Dropdown button to add components
function AddComponentButton() {
  const { addComponent } = useCanvas();

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
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Component
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {componentTypes.map((type) => (
          <DropdownMenuItem key={type.typeId} onClick={() => handleAdd(type)}>
            <Layers className="h-4 w-4 mr-2 text-muted-foreground" />
            {type.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { components, grid, moveComponent, resizeComponent, selectedComponentId, selectComponent } = useCanvas();
  const { canUndo, canRedo, undo, redo } = useHistory();
  const { width, containerRef, mounted } = useContainerWidth();

  // Handle click on canvas background to deselect
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking directly on the canvas, not on a component
      if (e.target === e.currentTarget) {
        selectComponent(null);
      }
    },
    [selectComponent]
  );

  // Handle component selection
  const handleComponentClick = useCallback(
    (componentId: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent canvas click from firing
      selectComponent(componentId);
    },
    [selectComponent]
  );

  // Convert components to layout format
  const layout = useMemo(() => componentsToLayout(components), [components]);

  // Build component lookup Map for O(1) access (js-index-maps)
  const componentMap = useMemo(
    () => new Map(components.map((c) => [c.id, c])),
    [components]
  );

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

  // Find component by ID using Map for O(1) lookup (js-index-maps)
  const getComponent = useCallback(
    (id: string) => componentMap.get(id),
    [componentMap]
  );

  return (
    <div className="relative h-full">
      {/* Floating toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <div className="flex items-center border border-border rounded-md bg-card/80 backdrop-blur-sm shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => undo()}
            disabled={!canUndo}
            className="rounded-r-none border-r border-border"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => redo()}
            disabled={!canRedo}
            className="rounded-l-none"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
        <AddComponentButton />
      </div>

      {/* Canvas area - full bleed */}
      <div
        ref={containerRef}
        className="h-full overflow-auto pt-16 px-4 pb-4"
        onClick={handleCanvasClick}
      >
        {/* Empty state */}
        {components.length === 0 && (
          <div className="flex items-center justify-center h-full pointer-events-none">
            <div className="text-center text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Canvas is empty</p>
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
            compactor={overlapCompactor}
          >
            {layout.map((item) => {
              const component = getComponent(item.i);
              if (!component) return null;
              const isSelected = selectedComponentId === item.i;
              return (
                <div
                  key={item.i}
                  onClick={(e) => handleComponentClick(item.i, e)}
                  className={`rounded-lg border overflow-hidden transition-all duration-150 ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20 shadow-sm bg-zinc-900/70 backdrop-blur-sm"
                      : "border-transparent hover:border-border hover:shadow-sm"
                  }`}
                >
                  <ComponentContent component={component} isSelected={isSelected} />
                </div>
              );
            })}
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
}
