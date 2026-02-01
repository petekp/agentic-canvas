// Tool Executor - executes AI tool calls client-side via store actions
// This module bridges AI tool calls to Zustand store mutations

import type { AgenticCanvasStore } from "@/store";
import type { CreateComponentPayload, UpdateComponentPayload } from "@/types";
import type {
  AddComponentParams,
  RemoveComponentParams,
  MoveComponentParams,
  ResizeComponentParams,
  UpdateComponentParams,
  ClearCanvasParams,
} from "./ai-tools";

// View tool params
interface CreateViewParams {
  name: string;
  components?: Array<{
    type_id: string;
    config?: Record<string, unknown>;
    position?: { col: number; row: number };
    size?: { cols: number; rows: number };
    label?: string;
  }>;
  switch_to: boolean;
}

interface SwitchViewParams {
  view: string;
}

interface PinViewParams {
  view?: string;
}

interface UnpinViewParams {
  view?: string;
}

// Default sizes for component types
const DEFAULT_SIZES: Record<string, { cols: number; rows: number }> = {
  // GitHub components
  "github.stat-tile": { cols: 2, rows: 2 },
  "github.pr-list": { cols: 4, rows: 3 },
  "github.issue-grid": { cols: 4, rows: 3 },
  "github.activity-timeline": { cols: 3, rows: 4 },
  "github.my-activity": { cols: 4, rows: 5 },
  // PostHog components
  "posthog.site-health": { cols: 4, rows: 3 },
  "posthog.property-breakdown": { cols: 4, rows: 3 },
  "posthog.top-pages": { cols: 4, rows: 4 },
};

// Default data bindings for component types
const DEFAULT_BINDINGS: Record<string, { source: string; query: { type: string; params: Record<string, unknown> }; refreshInterval: number | null }> = {
  "github.stat-tile": {
    source: "mock-github",
    query: { type: "stats", params: { metric: "open_prs" } },
    refreshInterval: 60000,
  },
  "github.pr-list": {
    source: "mock-github",
    query: { type: "pull_requests", params: {} },
    refreshInterval: 60000,
  },
  "github.issue-grid": {
    source: "mock-github",
    query: { type: "issues", params: {} },
    refreshInterval: 60000,
  },
  "github.activity-timeline": {
    source: "mock-github",
    query: { type: "activity", params: {} },
    refreshInterval: 60000,
  },
  "github.my-activity": {
    source: "mock-github",
    query: { type: "my_activity", params: { timeWindow: "7d", feedLimit: 10 } },
    refreshInterval: 60000,
  },
  // PostHog components
  "posthog.site-health": {
    source: "posthog",
    query: { type: "site_health", params: { timeWindow: "7d" } },
    refreshInterval: 120000,
  },
  "posthog.property-breakdown": {
    source: "posthog",
    query: { type: "property_breakdown", params: { timeWindow: "7d", metric: "visitors" } },
    refreshInterval: 120000,
  },
  "posthog.top-pages": {
    source: "posthog",
    query: { type: "top_pages", params: { timeWindow: "7d", limit: 10 } },
    refreshInterval: 120000,
  },
};

// Tool execution result
export interface ToolExecutionResult {
  success: boolean;
  result: unknown;
  error?: string;
}

/**
 * Creates a tool executor bound to a store instance
 */
export function createToolExecutor(store: AgenticCanvasStore) {
  return {
    /**
     * Execute an add_component tool call
     */
    addComponent(params: AddComponentParams): ToolExecutionResult {
      try {
        const { type_id, config, position, size, label } = params;

        const payload: CreateComponentPayload = {
          typeId: type_id,
          config: config ?? {},
          position: position ? { col: position.col, row: position.row } : undefined,
          size: size ? { cols: size.cols, rows: size.rows } : DEFAULT_SIZES[type_id],
          dataBinding: DEFAULT_BINDINGS[type_id],
          meta: {
            createdBy: "assistant",
            label,
          },
        };

        const result = store.addComponent(payload);

        if (result.success) {
          return {
            success: true,
            result: {
              componentId: result.affectedComponentIds[0],
              message: result.explanation,
            },
          };
        } else {
          return {
            success: false,
            result: null,
            error: result.error?.message ?? "Failed to add component",
          };
        }
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute a remove_component tool call
     */
    removeComponent(params: RemoveComponentParams): ToolExecutionResult {
      try {
        const result = store.removeComponent(params.component_id);

        if (result.success) {
          return {
            success: true,
            result: { message: result.explanation },
          };
        } else {
          return {
            success: false,
            result: null,
            error: result.error?.message ?? "Component not found",
          };
        }
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute a move_component tool call
     */
    moveComponent(params: MoveComponentParams): ToolExecutionResult {
      try {
        const result = store.moveComponent(params.component_id, {
          col: params.position.col,
          row: params.position.row,
        });

        if (result.success) {
          return {
            success: true,
            result: { message: result.explanation },
          };
        } else {
          return {
            success: false,
            result: null,
            error: result.error?.message ?? "Failed to move component",
          };
        }
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute a resize_component tool call
     */
    resizeComponent(params: ResizeComponentParams): ToolExecutionResult {
      try {
        const result = store.resizeComponent(params.component_id, {
          cols: params.size.cols,
          rows: params.size.rows,
        });

        if (result.success) {
          return {
            success: true,
            result: { message: result.explanation },
          };
        } else {
          return {
            success: false,
            result: null,
            error: result.error?.message ?? "Failed to resize component",
          };
        }
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute an update_component tool call
     */
    updateComponent(params: UpdateComponentParams): ToolExecutionResult {
      try {
        const payload: UpdateComponentPayload = {
          componentId: params.component_id,
          config: params.config,
          meta: {
            ...(params.label !== undefined && { label: params.label }),
            ...(params.pinned !== undefined && { pinned: params.pinned }),
          },
        };

        const result = store.updateComponent(payload);

        if (result.success) {
          return {
            success: true,
            result: { message: result.explanation },
          };
        } else {
          return {
            success: false,
            result: null,
            error: result.error?.message ?? "Failed to update component",
          };
        }
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute a clear_canvas tool call
     */
    clearCanvas(params: ClearCanvasParams): ToolExecutionResult {
      try {
        const result = store.clearCanvas(params.preserve_pinned);

        if (result.success) {
          return {
            success: true,
            result: { message: result.explanation },
          };
        } else {
          return {
            success: false,
            result: null,
            error: result.error?.message ?? "Failed to clear canvas",
          };
        }
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute a create_view tool call
     */
    createView(params: CreateViewParams): ToolExecutionResult {
      try {
        const { name, components, switch_to } = params;

        // Create the view
        const viewId = store.createEmptyView({
          name,
          createdBy: "assistant",
          switchTo: switch_to,
        });

        // Add components if provided
        if (components && components.length > 0 && switch_to) {
          for (const comp of components) {
            const payload: CreateComponentPayload = {
              typeId: comp.type_id,
              config: comp.config ?? {},
              position: comp.position ? { col: comp.position.col, row: comp.position.row } : undefined,
              size: comp.size ? { cols: comp.size.cols, rows: comp.size.rows } : DEFAULT_SIZES[comp.type_id],
              dataBinding: DEFAULT_BINDINGS[comp.type_id],
              meta: {
                createdBy: "assistant",
                label: comp.label,
              },
            };

            store.addComponent(payload);
          }
        }

        return {
          success: true,
          result: {
            viewId,
            message: `Created view "${name}"${components ? ` with ${components.length} components` : ""}`,
          },
        };
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute a switch_view tool call
     */
    switchView(params: SwitchViewParams): ToolExecutionResult {
      try {
        const { view } = params;
        const views = store.getViews();

        // Find view by name or ID
        const targetView = views.find((v) => v.id === view || v.name === view);

        if (!targetView) {
          return {
            success: false,
            result: null,
            error: `View not found: ${view}`,
          };
        }

        const result = store.loadView(targetView.id);

        if (result.success) {
          return {
            success: true,
            result: { message: `Switched to view "${targetView.name}"` },
          };
        } else {
          return {
            success: false,
            result: null,
            error: result.error?.message ?? "Failed to switch view",
          };
        }
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute a pin_view tool call
     */
    pinView(params: PinViewParams): ToolExecutionResult {
      try {
        const { view } = params;
        let viewId: string | null = null;

        if (view) {
          const views = store.getViews();
          const targetView = views.find((v) => v.id === view || v.name === view);
          if (!targetView) {
            return {
              success: false,
              result: null,
              error: `View not found: ${view}`,
            };
          }
          viewId = targetView.id;
        } else {
          // Use active view
          // Access state directly since store doesn't expose activeViewId as a getter
          const state = store as unknown as { activeViewId: string | null };
          viewId = state.activeViewId;
        }

        if (!viewId) {
          return {
            success: false,
            result: null,
            error: "No view specified and no active view",
          };
        }

        store.pinView(viewId);

        return {
          success: true,
          result: { message: "View pinned" },
        };
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute an unpin_view tool call
     */
    unpinView(params: UnpinViewParams): ToolExecutionResult {
      try {
        const { view } = params;
        let viewId: string | null = null;

        if (view) {
          const views = store.getViews();
          const targetView = views.find((v) => v.id === view || v.name === view);
          if (!targetView) {
            return {
              success: false,
              result: null,
              error: `View not found: ${view}`,
            };
          }
          viewId = targetView.id;
        } else {
          // Use active view
          const state = store as unknown as { activeViewId: string | null };
          viewId = state.activeViewId;
        }

        if (!viewId) {
          return {
            success: false,
            result: null,
            error: "No view specified and no active view",
          };
        }

        store.unpinView(viewId);

        return {
          success: true,
          result: { message: "View unpinned" },
        };
      } catch (err) {
        return {
          success: false,
          result: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },

    /**
     * Execute a tool call by name
     */
    execute(toolName: string, args: Record<string, unknown>): ToolExecutionResult {
      switch (toolName) {
        case "add_component":
          return this.addComponent(args as AddComponentParams);
        case "remove_component":
          return this.removeComponent(args as RemoveComponentParams);
        case "move_component":
          return this.moveComponent(args as MoveComponentParams);
        case "resize_component":
          return this.resizeComponent(args as ResizeComponentParams);
        case "update_component":
          return this.updateComponent(args as UpdateComponentParams);
        case "clear_canvas":
          return this.clearCanvas(args as ClearCanvasParams);
        case "create_view":
          return this.createView(args as unknown as CreateViewParams);
        case "switch_view":
          return this.switchView(args as unknown as SwitchViewParams);
        case "pin_view":
          return this.pinView(args as unknown as PinViewParams);
        case "unpin_view":
          return this.unpinView(args as unknown as UnpinViewParams);
        default:
          return {
            success: false,
            result: null,
            error: `Unknown tool: ${toolName}`,
          };
      }
    },
  };
}

export type ToolExecutor = ReturnType<typeof createToolExecutor>;
