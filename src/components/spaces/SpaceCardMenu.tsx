"use client";

// SpaceCardMenu - Context menu for space cards
// See: .claude/plans/spaces-navigation-v0.2.md

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Copy, Pin, PinOff, Trash2 } from "lucide-react";

interface SpaceCardMenuProps {
  isPinned: boolean;
  isSystemManaged?: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}

export function SpaceCardMenu({
  isPinned,
  isSystemManaged = false,
  onRename,
  onDuplicate,
  onTogglePin,
  onDelete,
}: SpaceCardMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onRename} disabled={isSystemManaged}>
          <Pencil className="h-4 w-4 mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-2" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onTogglePin} disabled={isSystemManaged}>
          {isPinned ? (
            <>
              <PinOff className="h-4 w-4 mr-2" />
              Unpin
            </>
          ) : (
            <>
              <Pin className="h-4 w-4 mr-2" />
              Pin
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          disabled={isSystemManaged}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
