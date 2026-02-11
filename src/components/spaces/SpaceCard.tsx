"use client";

// SpaceCard - Individual space card with metrics and context menu
// See: .claude/plans/spaces-navigation-v0.2.md

import { useState, useCallback, useRef, useEffect } from "react";
import { Pin, Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SpaceCardMenu } from "./SpaceCardMenu";
import { SpaceMetrics } from "./SpaceMetrics";
import type { Space } from "@/types";

interface SpaceCardProps {
  space: Space;
  onSelect: () => void;
  onRename: (newName: string) => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function SpaceCard({
  space,
  onSelect,
  onRename,
  onDuplicate,
  onTogglePin,
  onDelete,
}: SpaceCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(space.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartRename = useCallback(() => {
    setEditName(space.name);
    setIsEditing(true);
  }, [space.name]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== space.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  }, [editName, space.name, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameSubmit();
      } else if (e.key === "Escape") {
        setIsEditing(false);
        setEditName(space.name);
      }
    },
    [handleRenameSubmit, space.name]
  );

  const handleClick = useCallback(() => {
    if (!isEditing) {
      onSelect();
    }
  }, [isEditing, onSelect]);

  return (
    <div
      onClick={handleClick}
      className="group relative p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-accent transition-colors cursor-pointer"
    >
      {/* Header with name and menu */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {space.pinned && (
            <Pin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )}
          {space.createdBy === "assistant" && !space.pinned && (
            <Bot className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
          )}
          {isEditing ? (
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="h-6 px-1 py-0 text-sm font-medium"
            />
          ) : (
            <h3 className="font-medium truncate">{space.name}</h3>
          )}
        </div>

        <SpaceCardMenu
          isPinned={space.pinned}
          isSystemManaged={space.meta.systemManaged}
          onRename={handleStartRename}
          onDuplicate={onDuplicate}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
        />
      </div>

      {/* Metrics */}
      <SpaceMetrics space={space} />

      {/* Footer with timestamp */}
      <div className="mt-3 text-xs text-muted-foreground/60">
        {formatTimeAgo(space.lastVisitedAt || space.updatedAt)}
      </div>
    </div>
  );
}
