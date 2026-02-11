"use client";

// CanvasHeader - Header bar for the canvas view with back button and space name
// See: .claude/plans/spaces-navigation-v0.2.md

import { useState, useCallback, useRef, useEffect } from "react";
import { LayoutGrid, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpaces } from "@/hooks/useSpaces";
import { useSpaceNavigation } from "@/hooks/useSpaceNavigation";

export function CanvasHeader() {
  const { navigateToGrid } = useSpaceNavigation();
  const { activeSpaceId, spaces, renameSpace, hasUnsavedChanges, saveSpace } = useSpaces();
  const space = spaces.find((s) => s.id === activeSpaceId);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(space?.name ?? "Untitled");
  const inputRef = useRef<HTMLInputElement>(null);

  // Track mount state to avoid hydration mismatch with hasUnsavedChanges
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Keep draft name aligned when switching spaces without subscribing to unstable space refs.
  useEffect(() => {
    if (!isEditing) {
      setEditName(space?.name ?? "Untitled");
    }
  }, [activeSpaceId, isEditing]);

  const handleStartEdit = useCallback(() => {
    if (space) {
      setEditName(space.name);
      setIsEditing(true);
    }
  }, [space]);

  const handleSave = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== space?.name && activeSpaceId) {
      renameSpace(activeSpaceId, trimmed);
    }
    setIsEditing(false);
  }, [editName, space?.name, activeSpaceId, renameSpace]);

  const handleCancel = useCallback(() => {
    setEditName(space?.name ?? "Untitled");
    setIsEditing(false);
  }, [space?.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const handleBackClick = useCallback(() => {
    // Auto-save if there are unsaved changes
    if (mounted && hasUnsavedChanges() && activeSpaceId && space) {
      saveSpace({
        spaceId: activeSpaceId,
        name: space.name,
        description: space.description,
      });
    }
    navigateToGrid();
  }, [mounted, hasUnsavedChanges, activeSpaceId, space, saveSpace, navigateToGrid]);

  const currentHasChanges = mounted && hasUnsavedChanges();

  return (
    <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50">
      {/* Back to grid button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBackClick}
        title="Back to Spaces"
        className="h-8 w-8"
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>

      {/* Space name (editable) */}
      {isEditing ? (
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 w-48 px-2 text-sm font-medium"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
            <Check className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          onClick={handleStartEdit}
          className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-2"
        >
          {space?.name ?? "Untitled"}
          {currentHasChanges && (
            <span className="w-2 h-2 rounded-full bg-amber-500" title="Unsaved changes" />
          )}
        </button>
      )}
    </header>
  );
}
