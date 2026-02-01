"use client";

// ViewTabs - Tab bar for switching between saved views
// Supports: click to switch, double-click to rename, right-click context menu

import { useState, useCallback, useRef, useEffect } from "react";
import { useViews } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, X, Copy, Pencil, Trash2, Circle } from "lucide-react";
import type { ViewId } from "@/types";

interface ViewTabProps {
  name: string;
  isActive: boolean;
  hasChanges: boolean;
  onSelect: () => void;
  onRename: (newName: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function ViewTab({
  name,
  isActive,
  hasChanges,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: ViewTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = useCallback(() => {
    setEditName(name);
    setIsEditing(true);
  }, [name]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  }, [editName, name, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameSubmit();
      } else if (e.key === "Escape") {
        setIsEditing(false);
        setEditName(name);
      }
    },
    [handleRenameSubmit, name]
  );

  const startRename = useCallback(() => {
    setEditName(name);
    setIsEditing(true);
  }, [name]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer border-b-2 transition-colors ${
            isActive
              ? "border-primary bg-background text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          onClick={onSelect}
          onDoubleClick={handleDoubleClick}
        >
          {/* Unsaved indicator */}
          {hasChanges && (
            <Circle className="h-2 w-2 fill-current text-amber-500" />
          )}

          {/* Tab name or edit input */}
          {isEditing ? (
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-24 px-1 py-0 text-sm"
            />
          ) : (
            <span className="truncate max-w-[120px]">{name}</span>
          )}

          {/* Close button (visible on hover or when active) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={`ml-1 p-0.5 rounded hover:bg-muted ${
              isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            } transition-opacity`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={startRename}>
          <Pencil className="h-4 w-4 mr-2" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-2" />
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ViewTabs() {
  const {
    views,
    activeViewId,
    loadView,
    deleteView,
    renameView,
    duplicateView,
    createEmptyView,
    setActiveView,
    hasUnsavedChanges,
  } = useViews();

  const [deleteConfirmId, setDeleteConfirmId] = useState<ViewId | null>(null);
  const viewToDelete = views.find((v) => v.id === deleteConfirmId);

  // Create new empty view (clears canvas)
  const handleNewView = useCallback(() => {
    createEmptyView();
  }, [createEmptyView]);

  // Switch to a view
  const handleSelectView = useCallback(
    (viewId: ViewId) => {
      if (viewId !== activeViewId) {
        loadView(viewId);
      }
    },
    [activeViewId, loadView]
  );

  // Close a view tab (deselect if active, or prompt to delete)
  const handleCloseView = useCallback(
    (viewId: ViewId) => {
      if (viewId === activeViewId) {
        // If closing active view, just deselect it
        setActiveView(null);
      } else {
        // If closing non-active view, confirm delete
        setDeleteConfirmId(viewId);
      }
    },
    [activeViewId, setActiveView]
  );

  // Confirm delete
  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirmId) {
      deleteView(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  }, [deleteConfirmId, deleteView]);

  // Check if current canvas has unsaved changes
  const currentHasChanges = hasUnsavedChanges();

  return (
    <>
      <div className="flex items-center border-b border-border bg-card/50 px-2">
        {/* View tabs */}
        <div className="flex items-center overflow-x-auto gap-1">
          {views.map((view) => (
            <ViewTab
              key={view.id}
              name={view.name}
              isActive={view.id === activeViewId}
              hasChanges={view.id === activeViewId && currentHasChanges}
              onSelect={() => handleSelectView(view.id)}
              onRename={(newName) => renameView(view.id, newName)}
              onDuplicate={() => duplicateView(view.id)}
              onDelete={() => setDeleteConfirmId(view.id)}
              onClose={() => handleCloseView(view.id)}
            />
          ))}
        </div>

        {/* New view button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewView}
          className="ml-1 h-7 w-7 p-0"
          title="Create new empty view"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open: boolean) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete view?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{viewToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
