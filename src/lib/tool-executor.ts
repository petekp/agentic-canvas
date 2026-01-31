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
