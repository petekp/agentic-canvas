"use client";

// Canvas component - the main grid-based workspace
// Uses react-grid-layout for drag & drop and resize functionality

import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import ReactGridLayout, { useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import { getCompactor } from "react-grid-layout/core";

// Allow overlap - items can stack freely, no pushing behavior
// This works well with undo/redo and future agent-driven layouts
const overlapCompactor = getCompactor(null, true, false);
import { useCanvas } from "@/hooks/useCanvas";
import { useUndoSimple } from "@/hooks/useUndo";
import { usePolling } from "@/hooks/usePolling";
import { useInsightLoop } from "@/hooks/useInsightLoop";
import { useStateSignals } from "@/hooks/useStateSignals";
import { useStateDebugSnapshot } from "@/hooks/useStateDebug";
import { useSpaceNavigation } from "@/hooks/useSpaceNavigation";
import { ComponentContent } from "./ComponentContent";
import { CanvasHeader } from "./CanvasHeader";
import { UndoRedoControls } from "@/components/UndoRedoControls";
import type { ComponentInstance } from "@/types";
import { Plus, Layers, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { ToolbarMenu } from "@/components/canvas/ToolbarMenu";
import { StateDebugPanel } from "@/components/canvas/StateDebugPanel";
import { useStore } from "@/store";
import { createUserSource } from "@/lib/undo/types";
import { serializeCanvasContext } from "@/lib/canvas-context";
import { getDefaultBinding } from "@/lib/canvas-defaults";
import { isEditableEventTarget } from "@/lib/keyboard-shortcuts";
import {
  compileTemplateToCommands,
  deriveIntent,
  getAllTemplates,
  getDefaultTemplates,
  getTemplate,
  registerDefaultTemplates,
  selectTopTemplate,
} from "@/lib/templates";
import { buildStateSnapshotFromSignals } from "@/lib/templates/state-signals";
import { executeCanvasCommand, validateCanvasCommand } from "@/lib/templates/execution";

// Import component type configuration from registry
import {
  CATEGORIES,
  getComponentTypesByCategory,
  getDefaultIcon,
  type ComponentTypeConfig,
} from "@/lib/component-registry";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// Dropdown button to add components - uses registry for configuration
function AddComponentButton() {
  const { addComponent } = useCanvas();
  const DefaultIcon = getDefaultIcon();

  const handleAdd = (type: ComponentTypeConfig) => {
    addComponent({
      typeId: type.typeId,
      config: type.config,
      size: type.size,
      dataBinding: {
        source: type.source ?? "mock-github",
        query: {
          type: type.queryType,
          params: type.config, // Includes filter if present
        },
        refreshInterval: type.source === "posthog" ? 120000 : null,
      },
    });
  };

  return (
    <ToolbarMenu.Root>
      <ToolbarMenu.Trigger icon={Plus} label="Add Component" variant="default" />
      <ToolbarMenu.Content className="w-52">
        {CATEGORIES.map((category, categoryIndex) => {
          const types = getComponentTypesByCategory(category.id);
          const CategoryIcon = category.icon;

          return (
            <div key={category.id}>
              {categoryIndex > 0 && <ToolbarMenu.Separator />}
              <ToolbarMenu.Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CategoryIcon className="h-3 w-3" />
                {category.label}
              </ToolbarMenu.Label>
              {types.map((type, typeIndex) => (
                <ToolbarMenu.Item
                  key={`${category.id}-${type.typeId}-${typeIndex}`}
                  onClick={() => handleAdd(type)}
                >
                  <DefaultIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                  {type.label}
                </ToolbarMenu.Item>
              ))}
            </div>
          );
        })}
      </ToolbarMenu.Content>
    </ToolbarMenu.Root>
  );
}

function GenerateTemplateButton() {
  const templates = getDefaultTemplates();

  const handleGenerate = useCallback((templateId?: string) => {
    const store = useStore.getState();

    registerDefaultTemplates();
    const context = serializeCanvasContext(store.canvas);
    const snapshot = buildStateSnapshotFromSignals();
    const intent = deriveIntent(snapshot, context);
    const availableTemplates = getAllTemplates();

    const ranked = templateId
      ? { template: getTemplate(templateId), reasons: [] as string[] }
      : selectTopTemplate(availableTemplates, snapshot, context, {
          category: intent.category,
        });

    if (!ranked?.template) {
      console.warn("No template available for generation.");
      return;
    }

    const compilation = compileTemplateToCommands({
      template: ranked.template,
      intent,
      state: snapshot,
      context,
      defaultBindings: getDefaultBinding,
      createdBy: "assistant",
    });

    const validationError = validateCanvasCommand(compilation.command);
    if (validationError) {
      console.warn(validationError);
      return;
    }

    store.startBatch(createUserSource("menu"), "UI: generate_template");
    try {
      executeCanvasCommand(store, compilation.command);
      store.commitBatch();
    } catch (err) {
      store.abortBatch();
      console.warn("Template generation failed", err);
    }
  }, []);

  return (
    <ToolbarMenu.Root>
      <ToolbarMenu.Trigger icon={Sparkles} label="Generate" variant="secondary" />
      <ToolbarMenu.Content>
        <ToolbarMenu.Item onClick={() => handleGenerate()}>
          Auto (based on state)
        </ToolbarMenu.Item>
        <ToolbarMenu.Separator />
        {templates.map((template) => (
          <ToolbarMenu.Item key={template.id} onClick={() => handleGenerate(template.id)}>
            {template.name}
          </ToolbarMenu.Item>
        ))}
      </ToolbarMenu.Content>
    </ToolbarMenu.Root>
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
  const { canUndo, canRedo, undo, redo } = useUndoSimple();
  const { navigateToGrid } = useSpaceNavigation();
  const { width, containerRef, mounted } = useContainerWidth();
  const [showStateDebug, setShowStateDebug] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("stateDebug");
  });
  const stateSnapshot = useStateDebugSnapshot(showStateDebug);

  // Refs for values only read inside callbacks (rerender-defer-reads)
  // This prevents the keyboard handler effect from re-running on every state change
  const canUndoRef = useRef(canUndo);
  const canRedoRef = useRef(canRedo);

  // Keep refs in sync with state
  canUndoRef.current = canUndo;
  canRedoRef.current = canRedo;

  // Polling for notifications and insight generation
  usePolling();
  useInsightLoop();
  useStateSignals();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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

  // Keyboard shortcuts for undo/redo and navigation
  // Uses refs for read-only values to prevent effect re-runs (rerender-defer-reads)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableEventTarget(e.target)) return;

      const isMod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Undo/Redo: Cmd+Z / Cmd+Shift+Z
      if (isMod && key === "z") {
        e.preventDefault();
        if (e.shiftKey && canRedoRef.current) {
          redo();
        } else if (!e.shiftKey && canUndoRef.current) {
          undo();
        }
        return;
      }

      // Toggle state debug overlay: Cmd/Ctrl+Shift+D
      if (isMod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowStateDebug((prev) => !prev);
        return;
      }

      // Return to Spaces grid: Cmd/Ctrl+Shift+H
      if (isMod && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        navigateToGrid();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, navigateToGrid]);

  // Find component by ID using Map for O(1) lookup (js-index-maps)
  const getComponent = useCallback(
    (id: string) => componentMap.get(id),
    [componentMap]
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Canvas header with back button */}
      <CanvasHeader />

      {/* Main canvas area */}
      <div className="relative flex-1 min-h-0">
        {/* Floating toolbar */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <div className="flex items-center border border-border rounded-md bg-card/80 backdrop-blur-sm shadow-sm">
            <UndoRedoControls size="md" />
          </div>
          <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <PopoverTrigger asChild>
              <div className="border border-border rounded-md bg-card/80 backdrop-blur-sm shadow-sm">
                <NotificationBadge />
              </div>
            </PopoverTrigger>
            <PopoverContent align="end" className="p-0 w-auto">
              <NotificationPanel onClose={() => setNotificationsOpen(false)} />
            </PopoverContent>
          </Popover>
          <GenerateTemplateButton />
          <AddComponentButton />
        </div>

        {/* Canvas area - full bleed */}
        <div
          ref={containerRef}
          className="h-full overflow-auto pt-16 px-4 pb-4"
          onClick={handleCanvasClick}
        >
        <StateDebugPanel
          open={showStateDebug}
          snapshot={stateSnapshot}
          onClose={() => setShowStateDebug(false)}
        />
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
                      : "border-border/50 bg-zinc-900/50 hover:border-border hover:bg-zinc-900/70 hover:shadow-sm"
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
    </div>
  );
}
