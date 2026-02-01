"use client";

// Canvas component - the main grid-based workspace
// Uses react-grid-layout for drag & drop and resize functionality

import { useEffect, useCallback, useMemo, useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import { getCompactor } from "react-grid-layout/core";

// Allow overlap - items can stack freely, no pushing behavior
// This works well with undo/redo and future agent-driven layouts
const overlapCompactor = getCompactor(null, true, false);
import { useCanvas, useViews, useUndoSimple, usePolling, useInsightLoop } from "@/hooks";
import { ComponentContent } from "./ComponentContent";
import { ViewTabs } from "./ViewTabs";
import { UndoRedoControls } from "@/components/UndoRedoControls";
import type { ComponentInstance } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Plus, Layers, User, GitPullRequest, BarChart3, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// Component types available to add
// filter: personal GitHub filter (authored, review_requested, assigned, etc.)
// category: for grouping in dropdown
// Component types with tuned default sizes
// rowHeight=80, so: 2 rows=160px, 3 rows=240px, 4 rows=320px, 5 rows=400px
const componentTypes = [
  // === My Stuff (Personal Filters) ===
  {
    typeId: "github.pr-list",
    label: "My PRs",
    config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 5, filter: "authored" },
    size: { cols: 4, rows: 4 }, // 5 PRs @ ~50px each + padding
    queryType: "pull_requests",
    category: "personal",
  },
  {
    typeId: "github.pr-list",
    label: "PRs to Review",
    config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 5, filter: "review_requested" },
    size: { cols: 4, rows: 4 },
    queryType: "pull_requests",
    category: "personal",
  },
  {
    typeId: "github.issue-grid",
    label: "My Issues",
    config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 6, filter: "assigned" },
    size: { cols: 4, rows: 4 }, // 6 issues @ ~50px each
    queryType: "issues",
    category: "personal",
  },
  {
    typeId: "github.my-activity",
    label: "My Activity",
    config: { timeWindow: "7d", feedLimit: 8 },
    size: { cols: 4, rows: 5 }, // Stats row + sparkline + feed
    queryType: "my_activity",
    category: "personal",
  },
  // === GitHub (All) ===
  {
    typeId: "github.stat-tile",
    label: "Stat Tile",
    config: { repo: "assistant-ui/assistant-ui", metric: "open_prs" },
    size: { cols: 2, rows: 2 }, // Compact: number + trend + sparkline
    queryType: "stats",
    category: "github",
  },
  {
    typeId: "github.pr-list",
    label: "All PRs",
    config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 5 },
    size: { cols: 4, rows: 4 },
    queryType: "pull_requests",
    category: "github",
  },
  {
    typeId: "github.issue-grid",
    label: "All Issues",
    config: { repo: "assistant-ui/assistant-ui", state: "open", limit: 6 },
    size: { cols: 4, rows: 4 },
    queryType: "issues",
    category: "github",
  },
  {
    typeId: "github.activity-timeline",
    label: "Activity Timeline",
    config: { repo: "assistant-ui/assistant-ui", limit: 8 },
    size: { cols: 3, rows: 4 }, // Narrow feed, 8 items @ ~40px
    queryType: "activity",
    category: "github",
  },
  {
    typeId: "github.commits",
    label: "Commits",
    config: { repo: "assistant-ui/assistant-ui", timeWindow: "7d", limit: 20 },
    size: { cols: 4, rows: 4 }, // Commit list with sha + message
    queryType: "commits",
    category: "github",
  },
  {
    typeId: "github.team-activity",
    label: "Team Activity",
    config: { repo: "assistant-ui/assistant-ui", timeWindow: "7d" },
    size: { cols: 4, rows: 5 }, // Summary + sparkline + contributor cards
    queryType: "team_activity",
    category: "github",
  },
  // === PostHog Analytics ===
  {
    typeId: "posthog.site-health",
    label: "Site Health",
    config: { timeWindow: "7d" },
    size: { cols: 3, rows: 3 }, // 3 stats + sparkline
    queryType: "site_health",
    source: "posthog",
    category: "posthog",
  },
  {
    typeId: "posthog.property-breakdown",
    label: "Property Breakdown",
    config: { timeWindow: "7d", metric: "visitors" },
    size: { cols: 3, rows: 4 }, // Vertical bar list
    queryType: "property_breakdown",
    source: "posthog",
    category: "posthog",
  },
  {
    typeId: "posthog.top-pages",
    label: "Top Pages",
    config: { timeWindow: "7d", limit: 8 },
    size: { cols: 4, rows: 4 }, // Page list with paths
    queryType: "top_pages",
    source: "posthog",
    category: "posthog",
  },
  // === Slack ===
  {
    typeId: "slack.channel-activity",
    label: "Channel Activity",
    config: { channelName: "general", limit: 10 },
    size: { cols: 4, rows: 4 }, // Messages @ ~60px each with reactions
    queryType: "channel_activity",
    source: "slack",
    category: "slack",
  },
  {
    typeId: "slack.mentions",
    label: "My Mentions",
    config: { limit: 8 },
    size: { cols: 4, rows: 4 }, // Mentions with channel context
    queryType: "mentions",
    source: "slack",
    category: "slack",
  },
  {
    typeId: "slack.thread-watch",
    label: "Thread Watch",
    config: {},
    size: { cols: 3, rows: 4 }, // Parent + replies, narrow
    queryType: "thread_watch",
    source: "slack",
    category: "slack",
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
        source: type.source ?? "mock-github",
        query: {
          type: type.queryType,
          params: type.config, // Includes filter if present
        },
        refreshInterval: type.source === "posthog" ? 120000 : null,
      },
    });
  };

  // Group components by category
  const personalTypes = componentTypes.filter((t) => t.category === "personal");
  const githubTypes = componentTypes.filter((t) => t.category === "github");
  const posthogTypes = componentTypes.filter((t) => t.category === "posthog");
  const slackTypes = componentTypes.filter((t) => t.category === "slack");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Component
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {/* My Stuff */}
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
          <User className="h-3 w-3" />
          My Stuff
        </DropdownMenuLabel>
        {personalTypes.map((type, i) => (
          <DropdownMenuItem key={`personal-${i}`} onClick={() => handleAdd(type)}>
            <Layers className="h-4 w-4 mr-2 text-muted-foreground" />
            {type.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* GitHub */}
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
          <GitPullRequest className="h-3 w-3" />
          GitHub (All)
        </DropdownMenuLabel>
        {githubTypes.map((type, i) => (
          <DropdownMenuItem key={`github-${i}`} onClick={() => handleAdd(type)}>
            <Layers className="h-4 w-4 mr-2 text-muted-foreground" />
            {type.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* PostHog */}
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
          <BarChart3 className="h-3 w-3" />
          PostHog
        </DropdownMenuLabel>
        {posthogTypes.map((type, i) => (
          <DropdownMenuItem key={`posthog-${i}`} onClick={() => handleAdd(type)}>
            <Layers className="h-4 w-4 mr-2 text-muted-foreground" />
            {type.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Slack */}
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" />
          Slack
        </DropdownMenuLabel>
        {slackTypes.map((type, i) => (
          <DropdownMenuItem key={`slack-${i}`} onClick={() => handleAdd(type)}>
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
  const { canUndo, canRedo, undo, redo } = useUndoSimple();
  const { views, activeViewId, saveView, loadView } = useViews();
  const { width, containerRef, mounted } = useContainerWidth();

  // Polling for notifications and insight generation
  usePolling();
  useInsightLoop();
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

  // Keyboard shortcuts for undo/redo and view management
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;

      // Undo/Redo: Cmd+Z / Cmd+Shift+Z
      if (isMod && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey && canRedo) {
          redo();
        } else if (!e.shiftKey && canUndo) {
          undo();
        }
        return;
      }

      // Save view: Cmd+S (update active) / Cmd+Shift+S (save as new)
      if (isMod && e.key === "s") {
        e.preventDefault();
        if (e.shiftKey || !activeViewId) {
          // Save as new view
          const existingNames = views.map((v) => v.name);
          let name = "Untitled";
          let counter = 1;
          while (existingNames.includes(name)) {
            name = `Untitled ${counter}`;
            counter++;
          }
          saveView({ name, description: "" });
        } else {
          // Update current view
          const activeView = views.find((v) => v.id === activeViewId);
          if (activeView) {
            saveView({ viewId: activeViewId, name: activeView.name, description: activeView.description });
          }
        }
        return;
      }

      // Switch views: Cmd+1-9
      if (isMod && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < views.length) {
          loadView(views[index].id);
        }
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo, views, activeViewId, saveView, loadView]);

  // Find component by ID using Map for O(1) lookup (js-index-maps)
  const getComponent = useCallback(
    (id: string) => componentMap.get(id),
    [componentMap]
  );

  return (
    <div className="flex flex-col h-full">
      {/* View tabs */}
      <ViewTabs />

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
