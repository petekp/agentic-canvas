// Undo/Redo Controls - Button UI for undo/redo operations
// See: .claude/plans/undo-redo-system-v2.md

"use client";

import { Undo2, Redo2 } from "lucide-react";
import { useUndoSimple } from "@/hooks/useUndo";
import { cn } from "@/lib/utils";

interface UndoRedoControlsProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
}

export function UndoRedoControls({
  className,
  size = "md",
  showLabels = false,
}: UndoRedoControlsProps) {
  const { canUndo, canRedo, undo, redo, undoDescription, redoDescription } =
    useUndoSimple();

  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const buttonSizes = {
    sm: "p-1.5",
    md: "p-2",
    lg: "p-2.5",
  };

  const iconSize = iconSizes[size];
  const buttonSize = buttonSizes[size];

  const buttonBaseClass = cn(
    "rounded-md transition-colors",
    "hover:bg-zinc-100 dark:hover:bg-zinc-800",
    "focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-1",
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
  );

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const modKey = isMac ? "Cmd" : "Ctrl";

  const undoTitle = canUndo
    ? `Undo${undoDescription ? `: ${undoDescription}` : ""} (${modKey}+Z)`
    : "Nothing to undo";

  const redoTitle = canRedo
    ? `Redo${redoDescription ? `: ${redoDescription}` : ""} (${modKey}+Shift+Z)`
    : "Nothing to redo";

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <button
        onClick={() => undo()}
        disabled={!canUndo}
        className={cn(buttonBaseClass, buttonSize)}
        title={undoTitle}
        aria-label={undoTitle}
      >
        <Undo2 className={cn(iconSize, "text-zinc-600 dark:text-zinc-400")} />
        {showLabels && (
          <span className="ml-1 text-sm text-zinc-600 dark:text-zinc-400">
            Undo
          </span>
        )}
      </button>

      <button
        onClick={() => redo()}
        disabled={!canRedo}
        className={cn(buttonBaseClass, buttonSize)}
        title={redoTitle}
        aria-label={redoTitle}
      >
        <Redo2 className={cn(iconSize, "text-zinc-600 dark:text-zinc-400")} />
        {showLabels && (
          <span className="ml-1 text-sm text-zinc-600 dark:text-zinc-400">
            Redo
          </span>
        )}
      </button>
    </div>
  );
}

// Compact version for tight spaces
export function UndoRedoButtons({ className }: { className?: string }) {
  const { canUndo, canRedo, undo, redo, undoDescription, redoDescription } =
    useUndoSimple();

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const modKey = isMac ? "Cmd" : "Ctrl";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        onClick={() => undo()}
        disabled={!canUndo}
        className={cn(
          "p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800",
          "disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        title={`Undo${undoDescription ? `: ${undoDescription}` : ""} (${modKey}+Z)`}
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        onClick={() => redo()}
        disabled={!canRedo}
        className={cn(
          "p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800",
          "disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        title={`Redo${redoDescription ? `: ${redoDescription}` : ""} (${modKey}+Shift+Z)`}
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}
