// execute-command.ts
//
// Command description and change detection for the undo system.
//
// ARCHITECTURAL NOTE: Snapshots vs Commands
// We use SNAPSHOTS for actual undo/redo (restoring beforeSnapshot/afterSnapshot).
// We use COMMANDS for human-readable descriptions and semantic tracking.
//
// WHY NOT COMMAND-BASED UNDO?
// Command inversion (invertCanvasCommand) works for simple operations but breaks
// for complex cases:
// - Bulk operations with interdependencies
// - Operations that trigger side effects (data refetches)
// - External state that can't be captured in a command
//
// Snapshots are more reliable: we literally restore the prior state. The trade-off
// is memory (~2KB per entry), which is acceptable for our scale.
//
// DESCRIPTION GENERATION:
// describeCanvasCommand() generates user-facing text for undo history. These appear
// in the undo dropdown: "Undo: Add github.stat-tile", "Redo: Move component".
//
// CHANGE DETECTION:
// detectChanges() compares two snapshots to find what was added/removed/modified.
// Used for audit logging and UI feedback (e.g., "3 components changed").
//
// See: .claude/plans/undo-redo-system-v2.md

import type { UndoCanvasCommand, FilesystemCommand, HybridCommand } from "./types";
import type { CanvasSnapshot } from "@/types";

// ============================================================================
// Snapshot-based State Restoration
// ============================================================================

/**
 * Restore canvas state from a snapshot.
 * This is the primary mechanism for undo/redo in our snapshot-based system.
 */
export function restoreFromSnapshot(
  snapshot: CanvasSnapshot
): CanvasSnapshot["components"] {
  // Deep clone to prevent mutations
  return structuredClone(snapshot.components);
}

// ============================================================================
// Command Description Generation
// ============================================================================

/**
 * Generate a human-readable description for a canvas command
 */
export function describeCanvasCommand(command: UndoCanvasCommand): string {
  switch (command.type) {
    case "component_add":
      return `Add ${command.component.typeId}`;

    case "component_remove":
      return `Remove ${command.snapshot.typeId}`;

    case "component_move":
      return `Move component to (${command.to.col}, ${command.to.row})`;

    case "component_resize":
      return `Resize component to ${command.to.cols}x${command.to.rows}`;

    case "component_update_config":
      return "Update component configuration";

    case "component_update_binding":
      return command.to ? "Update data binding" : "Remove data binding";

    case "layout_bulk_update":
      return `Update ${command.componentIds.length} component layouts`;

    case "view_create":
      return `Create view: ${command.viewName}`;

    case "view_delete":
      return `Delete view: ${command.viewName}`;

    case "view_rename":
      return `Rename view from "${command.from}" to "${command.to}"`;

    case "view_switch":
      return `Switch to view`;

    case "view_load":
      return `Load view: ${command.viewName}`;

    case "view_pin":
      return `Pin view: ${command.viewName}`;

    case "view_unpin":
      return `Unpin view: ${command.viewName}`;

    case "canvas_clear":
      return `Clear canvas (${command.removedCount} components)`;

    default:
      return "Unknown operation";
  }
}

/**
 * Generate a human-readable description for a filesystem command
 */
export function describeFilesystemCommand(command: FilesystemCommand): string {
  switch (command.type) {
    case "file_create":
      return `Create file: ${command.path}`;

    case "file_modify":
      return `Modify file: ${command.path}`;

    case "file_delete":
      return `Delete file: ${command.path}`;

    case "file_move":
      return `Move file from ${command.fromPath} to ${command.toPath}`;

    case "file_copy":
      return `Copy file from ${command.fromPath} to ${command.toPath}`;

    case "directory_create":
      return `Create directory: ${command.path}`;

    case "directory_delete":
      return `Delete directory: ${command.path}`;

    default:
      return "Unknown filesystem operation";
  }
}

/**
 * Generate a human-readable description for a hybrid command
 */
export function describeHybridCommand(command: HybridCommand): string {
  const canvasCount = command.canvas.length;
  const fsCount = command.filesystem.length;

  if (canvasCount > 0 && fsCount > 0) {
    return `${canvasCount} canvas + ${fsCount} filesystem operations`;
  } else if (canvasCount > 0) {
    return `${canvasCount} canvas operations`;
  } else if (fsCount > 0) {
    return `${fsCount} filesystem operations`;
  }
  return "Empty operation";
}

// ============================================================================
// Command Inversion (for future command-based undo)
// ============================================================================

/**
 * Create the inverse of a canvas command (for command-based undo)
 * Note: Currently we use snapshot-based restoration, but this is useful for semantic tracking
 */
export function invertCanvasCommand(command: UndoCanvasCommand): UndoCanvasCommand {
  switch (command.type) {
    case "component_add":
      return {
        type: "component_remove",
        componentId: command.component.id,
        snapshot: command.component,
      };

    case "component_remove":
      return {
        type: "component_add",
        component: command.snapshot,
      };

    case "component_move":
      return {
        type: "component_move",
        componentId: command.componentId,
        from: command.to,
        to: command.from,
      };

    case "component_resize":
      return {
        type: "component_resize",
        componentId: command.componentId,
        from: command.to,
        to: command.from,
      };

    case "component_update_config":
      return {
        type: "component_update_config",
        componentId: command.componentId,
        from: command.to,
        to: command.from,
      };

    case "component_update_binding":
      return {
        type: "component_update_binding",
        componentId: command.componentId,
        from: command.to,
        to: command.from,
      };

    case "view_rename":
      return {
        type: "view_rename",
        viewId: command.viewId,
        from: command.to,
        to: command.from,
      };

    case "view_pin":
      return {
        type: "view_unpin",
        viewId: command.viewId,
        viewName: command.viewName,
      };

    case "view_unpin":
      return {
        type: "view_pin",
        viewId: command.viewId,
        viewName: command.viewName,
      };

    // These commands are not easily invertible without more context
    case "layout_bulk_update":
    case "view_create":
    case "view_delete":
    case "view_switch":
    case "view_load":
    case "canvas_clear":
      // For these, we rely on snapshot restoration
      return command;

    default:
      return command;
  }
}

// ============================================================================
// Component Change Detection
// ============================================================================

/**
 * Detect what changed between two snapshots
 */
export function detectChanges(
  before: CanvasSnapshot,
  after: CanvasSnapshot
): {
  added: ComponentInstance[];
  removed: ComponentInstance[];
  modified: Array<{ before: ComponentInstance; after: ComponentInstance }>;
} {
  const beforeMap = new Map(before.components.map((c) => [c.id, c]));
  const afterMap = new Map(after.components.map((c) => [c.id, c]));

  const added: ComponentInstance[] = [];
  const removed: ComponentInstance[] = [];
  const modified: Array<{ before: ComponentInstance; after: ComponentInstance }> = [];

  // Find added and modified
  for (const [id, component] of afterMap) {
    const beforeComponent = beforeMap.get(id);
    if (!beforeComponent) {
      added.push(component);
    } else if (JSON.stringify(beforeComponent) !== JSON.stringify(component)) {
      modified.push({ before: beforeComponent, after: component });
    }
  }

  // Find removed
  for (const [id, component] of beforeMap) {
    if (!afterMap.has(id)) {
      removed.push(component);
    }
  }

  return { added, removed, modified };
}
