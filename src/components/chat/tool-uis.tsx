"use client";

// Tool UI components for rendering AI tool calls in the chat
// Uses makeAssistantToolUI from assistant-ui

import { makeAssistantToolUI } from "@assistant-ui/react";
import { Check, Loader2, Plus, Trash2, Move, Maximize2, Settings, Eraser } from "lucide-react";

// Shared tool status indicator
function ToolStatus({ status }: { status: { type: string } }) {
  if (status.type === "running") {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }
  if (status.type === "complete") {
    return <Check className="h-3 w-3 text-green-500" />;
  }
  return null;
}

// Type definitions for tool parameters
interface AddComponentArgs {
  type_id: string;
  label?: string;
  config?: Record<string, unknown>;
  position?: { col: number; row: number };
  size?: { cols: number; rows: number };
}

interface AddComponentResult {
  action: string;
  params: AddComponentArgs;
  success: boolean;
}

interface ComponentIdArgs {
  component_id: string;
}

interface MoveComponentArgs extends ComponentIdArgs {
  position: { col: number; row: number };
}

interface ResizeComponentArgs extends ComponentIdArgs {
  size: { cols: number; rows: number };
}

interface UpdateComponentArgs extends ComponentIdArgs {
  config?: Record<string, unknown>;
  label?: string;
  pinned?: boolean;
}

interface ClearCanvasArgs {
  preserve_pinned: boolean;
}

interface ToolResult {
  action: string;
  params: Record<string, unknown>;
  success: boolean;
}

// Helper to get a friendly type name
function getTypeName(typeId: string): string {
  const names: Record<string, string> = {
    "github.stat-tile": "stat tile",
    "github.pr-list": "PR list",
    "github.issue-grid": "issue grid",
    "github.activity-timeline": "activity timeline",
    "github.my-activity": "my activity",
    "posthog.site-health": "site health",
    "posthog.property-breakdown": "property breakdown",
    "posthog.top-pages": "top pages",
  };
  if (!typeId) return "component";
  return names[typeId] ?? typeId.split(".").pop() ?? typeId;
}

// Add component tool UI
export const AddComponentToolUI = makeAssistantToolUI<AddComponentArgs, AddComponentResult>({
  toolName: "add_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Plus className="h-3 w-3 text-green-500" />
      <span>
        Add {args.label ?? getTypeName(args.type_id)}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Remove component tool UI
export const RemoveComponentToolUI = makeAssistantToolUI<ComponentIdArgs, ToolResult>({
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

// Move component tool UI
export const MoveComponentToolUI = makeAssistantToolUI<MoveComponentArgs, ToolResult>({
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

// Resize component tool UI
export const ResizeComponentToolUI = makeAssistantToolUI<ResizeComponentArgs, ToolResult>({
  toolName: "resize_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Maximize2 className="h-3 w-3 text-purple-500" />
      <span>
        Resize to {args.size.cols}×{args.size.rows}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Update component tool UI
export const UpdateComponentToolUI = makeAssistantToolUI<UpdateComponentArgs, ToolResult>({
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

// Clear canvas tool UI
export const ClearCanvasToolUI = makeAssistantToolUI<ClearCanvasArgs, ToolResult>({
  toolName: "clear_canvas",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Eraser className="h-3 w-3 text-amber-500" />
      <span>
        Clear canvas{args.preserve_pinned ? " (keep pinned)" : ""}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Export all tool UIs for registration
export const toolUIs = [
  AddComponentToolUI,
  RemoveComponentToolUI,
  MoveComponentToolUI,
  ResizeComponentToolUI,
  UpdateComponentToolUI,
  ClearCanvasToolUI,
];
