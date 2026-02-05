"use client";

// DeleteSpaceDialog - Confirmation modal for deleting a space
// See: .claude/plans/spaces-navigation-v0.2.md

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

interface DeleteSpaceDialogProps {
  open: boolean;
  spaceName: string;
  componentCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteSpaceDialog({
  open,
  spaceName,
  componentCount,
  onOpenChange,
  onConfirm,
}: DeleteSpaceDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{spaceName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove all {componentCount} component{componentCount !== 1 ? "s" : ""} in this space.
            This action can be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
