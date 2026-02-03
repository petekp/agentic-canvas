"use client";

// Canvas Tools - Client-side tool definitions using assistant-ui's makeAssistantTool
// Tools execute automatically when AI calls them, with proper undo batching

import { makeAssistantTool, tool } from "@assistant-ui/react";
import { z } from "zod";
import { nanoid } from "nanoid";
import { useStore } from "@/store";
import { DEFAULT_BINDINGS, DEFAULT_SIZES, getDefaultBinding } from "@/lib/canvas-defaults";
import { serializeCanvasContext } from "@/lib/canvas-context";
import {
  compileTemplateToCommands,
  deriveIntent,
  getAllTemplates,
  getTemplate,
  registerDefaultTemplates,
  selectTopTemplate,
} from "@/lib/templates";
import { buildStateSnapshotFromSignals } from "@/lib/templates/state-signals";
import {
  executeCanvasCommand,
  summarizeGenerationResults,
  validateCanvasCommand,
} from "@/lib/templates/execution";
import type { AssistantCommandSource } from "@/lib/undo/types";
import type { CreateComponentPayload, UpdateComponentPayload } from "@/types";
import {
  Check,
  Loader2,
  Plus,
  Trash2,
  Move,
  Maximize2,
  Settings,
  Eraser,
  LayoutGrid,
  ArrowRightLeft,
  Pin,
  PinOff,
  Sparkles,
} from "lucide-react";

// ============================================================================
// Shared Components
// ============================================================================

function ToolStatus({ status }: { status: { type: string } }) {
  if (status.type === "running") {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }
  if (status.type === "complete") {
    return <Check className="h-3 w-3 text-green-500" />;
  }
  return null;
}

function getTypeName(typeId: string): string {
  const names: Record<string, string> = {
    "github.stat-tile": "stat tile",
    "github.pr-list": "PR list",
    "github.issue-grid": "issue grid",
    "github.activity-timeline": "activity timeline",
    "github.my-activity": "my activity",
    "github.commits": "commits",
    "github.team-activity": "team activity",
    "posthog.site-health": "site health",
    "posthog.property-breakdown": "property breakdown",
    "posthog.top-pages": "top pages",
    "slack.channel-activity": "channel activity",
    "slack.mentions": "mentions",
    "slack.thread-watch": "thread watch",
  };
  if (!typeId) return "component";
  return names[typeId] ?? typeId.split(".").pop() ?? typeId;
}

// ============================================================================
// Helper to create assistant source for undo attribution
// ============================================================================

function createToolSource(): AssistantCommandSource {
  // Generate IDs since they're not available from tool execution context
  return {
    type: "assistant",
    messageId: `msg_${nanoid(10)}`,
    toolCallId: `tc_${nanoid(10)}`,
  };
}

// ============================================================================
// Schema Definitions
// ============================================================================

const positionSchema = z.object({
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});

const sizeSchema = z.object({
  cols: z.number().int().min(1).max(12),
  rows: z.number().int().min(1).max(8),
});

const stateSchema = z.object({
  focus: z.number().min(0).max(1).optional(),
  energy: z.number().min(0).max(1).optional(),
  stress: z.number().min(0).max(1).optional(),
  time_pressure: z.number().min(0).max(1).optional(),
  interruptibility: z.number().min(0).max(1).optional(),
  mode: z.enum(["execute", "review", "explore", "recover", "monitor"]).optional(),
  ambient_light: z.enum(["low", "normal", "bright"]).optional(),
  noise_level: z.enum(["quiet", "moderate", "loud"]).optional(),
  motion_context: z.enum(["still", "moving"]).optional(),
});


// ============================================================================
// Tool Definitions
// ============================================================================

// Add Component Tool
const addComponentToolDef = tool({
  description: "Add a new component to the canvas",
  parameters: z.object({
    type_id: z.string(),
    config: z.record(z.string(), z.unknown()).optional(),
    position: positionSchema.optional(),
    size: sizeSchema.optional(),
    label: z.string().optional(),
  }),
  execute: async ({ type_id, config, position, size, label }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: add_component");
    try {
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
      store.commitBatch();

      return {
        success: result.success,
        componentId: result.affectedComponentIds?.[0],
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const AddComponentTool = makeAssistantTool({
  ...addComponentToolDef,
  toolName: "add_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Plus className="h-3 w-3 text-green-500" />
      <span>Add {args.label ?? getTypeName(args.type_id)}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Remove Component Tool
const removeComponentToolDef = tool({
  description: "Remove a component from the canvas by its ID",
  parameters: z.object({
    component_id: z.string(),
  }),
  execute: async ({ component_id }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: remove_component");
    try {
      const result = store.removeComponent(component_id);
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const RemoveComponentTool = makeAssistantTool({
  ...removeComponentToolDef,
  toolName: "remove_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Trash2 className="h-3 w-3 text-red-500" />
      <span>Remove component</span>
      <span className="text-muted-foreground font-mono">{args.component_id.slice(0, 8)}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Move Component Tool
const moveComponentToolDef = tool({
  description: "Move a component to a new position on the grid",
  parameters: z.object({
    component_id: z.string(),
    position: positionSchema,
  }),
  execute: async ({ component_id, position }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: move_component");
    try {
      const result = store.moveComponent(component_id, {
        col: position.col,
        row: position.row,
      });
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const MoveComponentTool = makeAssistantTool({
  ...moveComponentToolDef,
  toolName: "move_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Move className="h-3 w-3 text-blue-500" />
      <span>
        Move to ({args.position.col}, {args.position.row})
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Resize Component Tool
const resizeComponentToolDef = tool({
  description: "Resize a component on the grid",
  parameters: z.object({
    component_id: z.string(),
    size: sizeSchema,
  }),
  execute: async ({ component_id, size }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: resize_component");
    try {
      const result = store.resizeComponent(component_id, {
        cols: size.cols,
        rows: size.rows,
      });
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const ResizeComponentTool = makeAssistantTool({
  ...resizeComponentToolDef,
  toolName: "resize_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Maximize2 className="h-3 w-3 text-purple-500" />
      <span>
        Resize to {args.size.cols}x{args.size.rows}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Update Component Tool
const updateComponentToolDef = tool({
  description: "Update a component's configuration or label",
  parameters: z.object({
    component_id: z.string(),
    config: z.record(z.string(), z.unknown()).optional(),
    label: z.string().optional(),
    pinned: z.boolean().optional(),
  }),
  execute: async ({ component_id, config, label, pinned }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: update_component");
    try {
      const payload: UpdateComponentPayload = {
        componentId: component_id,
        config,
        meta: {
          ...(label !== undefined && { label }),
          ...(pinned !== undefined && { pinned }),
        },
      };

      const result = store.updateComponent(payload);
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const UpdateComponentTool = makeAssistantTool({
  ...updateComponentToolDef,
  toolName: "update_component",
  render: ({ args, status }) => {
    const changes: string[] = [];
    if (args.config) changes.push("config");
    if (args.label !== undefined) changes.push("label");
    if (args.pinned !== undefined) changes.push(args.pinned ? "pin" : "unpin");

    return (
      <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
        <Settings className="h-3 w-3 text-orange-500" />
        <span>Update {changes.join(", ") || "component"}</span>
        <ToolStatus status={status} />
      </div>
    );
  },
});

// Clear Canvas Tool
const clearCanvasToolDef = tool({
  description: "Clear all components from the canvas. Use preserve_pinned to keep pinned components.",
  parameters: z.object({
    preserve_pinned: z.boolean().default(true),
  }),
  execute: async ({ preserve_pinned }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: clear_canvas");
    try {
      const result = store.clearCanvas(preserve_pinned ?? true);
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const ClearCanvasTool = makeAssistantTool({
  ...clearCanvasToolDef,
  toolName: "clear_canvas",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Eraser className="h-3 w-3 text-amber-500" />
      <span>Clear canvas{args.preserve_pinned ? " (keep pinned)" : ""}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Generate Template Tool
const generateTemplateToolDef = tool({
  description: "Generate components from a template based on cognitive state or a specific template ID.",
  parameters: z.object({
    template_id: z.string().optional(),
    category: z.enum(["focus", "review", "explore", "monitor", "recover"]).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    state: stateSchema.optional(),
  }),
  execute: async ({ template_id, category, params, state }) => {
    const store = useStore.getState();
    const source = createToolSource();

    registerDefaultTemplates();

    const context = serializeCanvasContext(store.canvas);
    const snapshot = buildStateSnapshotFromSignals(state);
    const intent = deriveIntent(snapshot, context);

    const templates = getAllTemplates();
    if (templates.length === 0) {
      return { success: false, error: "No templates registered" };
    }

    const template = template_id ? getTemplate(template_id) : undefined;
    const ranked = template
      ? { template, reasons: [] as string[] }
      : selectTopTemplate(templates, snapshot, context, {
          category: category ?? intent.category,
        });

    if (!ranked?.template) {
      return { success: false, error: "Template not found" };
    }

    const compilation = compileTemplateToCommands({
      template: ranked.template,
      intent,
      state: snapshot,
      context,
      overrides: params,
      defaultBindings: getDefaultBinding,
      createdBy: "assistant",
    });

    const validationError = validateCanvasCommand(compilation.command);
    if (validationError) {
      return { success: false, error: validationError };
    }

    store.startBatch(source, "AI: generate_template");
    try {
      const results = executeCanvasCommand(store, compilation.command);
      store.commitBatch();

      const summary = summarizeGenerationResults({
        results,
        templateName: ranked.template.name,
        reasons: ranked.reasons ?? [],
        issues: compilation.issues,
      });

      if (!summary.success) {
        return {
          success: false,
          error: summary.error ?? "Template generation failed",
        };
      }

      return {
        success: true,
        templateId: ranked.template.id,
        message: summary.message ?? `Generated ${summary.createdCount} component(s)`,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const GenerateTemplateTool = makeAssistantTool({
  ...generateTemplateToolDef,
  toolName: "generate_template",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Sparkles className="h-3 w-3 text-purple-500" />
      <span>
        Generate template{args.template_id ? ` (${args.template_id})` : ""}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Create View Tool
const createViewToolDef = tool({
  description:
    "Create a new canvas view/tab. Use for organizing related components into separate workspaces. Views are ephemeral by default.",
  parameters: z.object({
    name: z.string(),
    components: z
      .array(
        z.object({
          type_id: z.string(),
          config: z.record(z.string(), z.unknown()).optional(),
          position: positionSchema.optional(),
          size: sizeSchema.optional(),
          label: z.string().optional(),
        })
      )
      .optional(),
    switch_to: z.boolean().default(true),
  }),
  execute: async ({ name, components, switch_to }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: create_view");
    try {
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

      store.commitBatch();

      return {
        success: true,
        viewId,
        message: `Created view "${name}"${components ? ` with ${components.length} components` : ""}`,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const CreateViewTool = makeAssistantTool({
  ...createViewToolDef,
  toolName: "create_view",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <LayoutGrid className="h-3 w-3 text-blue-500" />
      <span>
        Create view &quot;{args.name}&quot;
        {args.components?.length ? ` with ${args.components.length} components` : ""}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Switch View Tool
const switchViewToolDef = tool({
  description: "Switch to an existing view by name or ID",
  parameters: z.object({
    view: z.string(),
  }),
  execute: async ({ view }) => {
    const store = useStore.getState();
    const source = createToolSource();
    const views = store.getViews();

    const targetView = views.find((v) => v.id === view || v.name === view);
    if (!targetView) {
      return {
        success: false,
        error: `View not found: ${view}`,
      };
    }

    store.startBatch(source, "AI: switch_view");
    try {
      const result = store.loadView(targetView.id);
      store.commitBatch();

      return {
        success: result.success,
        message: `Switched to view "${targetView.name}"`,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const SwitchViewTool = makeAssistantTool({
  ...switchViewToolDef,
  toolName: "switch_view",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <ArrowRightLeft className="h-3 w-3 text-cyan-500" />
      <span>Switch to &quot;{args.view}&quot;</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Pin View Tool
const pinViewToolDef = tool({
  description: "Pin a view to keep it. Unpinned views may be auto-cleaned after 7 days.",
  parameters: z.object({
    view: z.string().optional(),
  }),
  execute: async ({ view }) => {
    const store = useStore.getState();
    const source = createToolSource();

    let viewId: string | null = null;

    if (view) {
      const views = store.getViews();
      const targetView = views.find((v) => v.id === view || v.name === view);
      if (!targetView) {
        return {
          success: false,
          error: `View not found: ${view}`,
        };
      }
      viewId = targetView.id;
    } else {
      const state = store as unknown as { activeViewId: string | null };
      viewId = state.activeViewId;
    }

    if (!viewId) {
      return {
        success: false,
        error: "No view specified and no active view",
      };
    }

    store.startBatch(source, "AI: pin_view");
    try {
      store.pinView(viewId);
      store.commitBatch();

      return {
        success: true,
        message: "View pinned",
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const PinViewTool = makeAssistantTool({
  ...pinViewToolDef,
  toolName: "pin_view",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Pin className="h-3 w-3 text-yellow-500" />
      <span>Pin {args.view ? `"${args.view}"` : "current view"}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Unpin View Tool
const unpinViewToolDef = tool({
  description: "Unpin a view. Unpinned views may be auto-cleaned after 7 days of inactivity.",
  parameters: z.object({
    view: z.string().optional(),
  }),
  execute: async ({ view }) => {
    const store = useStore.getState();
    const source = createToolSource();

    let viewId: string | null = null;

    if (view) {
      const views = store.getViews();
      const targetView = views.find((v) => v.id === view || v.name === view);
      if (!targetView) {
        return {
          success: false,
          error: `View not found: ${view}`,
        };
      }
      viewId = targetView.id;
    } else {
      const state = store as unknown as { activeViewId: string | null };
      viewId = state.activeViewId;
    }

    if (!viewId) {
      return {
        success: false,
        error: "No view specified and no active view",
      };
    }

    store.startBatch(source, "AI: unpin_view");
    try {
      store.unpinView(viewId);
      store.commitBatch();

      return {
        success: true,
        message: "View unpinned",
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const UnpinViewTool = makeAssistantTool({
  ...unpinViewToolDef,
  toolName: "unpin_view",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <PinOff className="h-3 w-3 text-gray-500" />
      <span>Unpin {args.view ? `"${args.view}"` : "current view"}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// ============================================================================
// Combined Tools Component
// ============================================================================

/**
 * Mount all canvas tools inside AssistantRuntimeProvider.
 * Tools register themselves and execute automatically when called by AI.
 */
export function CanvasTools() {
  return (
    <>
      <AddComponentTool />
      <RemoveComponentTool />
      <MoveComponentTool />
      <ResizeComponentTool />
      <UpdateComponentTool />
      <ClearCanvasTool />
      <GenerateTemplateTool />
      <CreateViewTool />
      <SwitchViewTool />
      <PinViewTool />
      <UnpinViewTool />
    </>
  );
}
