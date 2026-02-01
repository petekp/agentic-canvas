"use client";

// Notification Compound Components - composable notification UI parts
// Usage:
//   <NotificationProvider notification={n} onAction={handleAction} onDismiss={handleDismiss}>
//     <Notification.Root>
//       <Notification.Priority />
//       <Notification.Header>
//         <Notification.Title />
//         <Notification.Dismiss />
//       </Notification.Header>
//       <Notification.Message />
//       <Notification.Timestamp />
//       <Notification.Actions />
//     </Notification.Root>
//   </NotificationProvider>

import { type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { X, ExternalLink, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNotification } from "./NotificationContext";

// ============================================================================
// Priority Colors
// ============================================================================

const PRIORITY_COLORS = {
  low: "border-l-muted-foreground",
  medium: "border-l-blue-500",
  high: "border-l-amber-500",
  urgent: "border-l-red-500",
} as const;

// ============================================================================
// Root Component
// ============================================================================

interface NotificationRootProps {
  children: ReactNode;
  className?: string;
}

/**
 * Root container for a notification
 * Handles base styling and priority-based left border
 */
export function NotificationRoot({ children, className }: NotificationRootProps) {
  const { notification } = useNotification();

  return (
    <div
      className={cn(
        "p-3 border-l-2 bg-card rounded-r-lg",
        PRIORITY_COLORS[notification.priority],
        !notification.read && "bg-muted/50",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Header Component
// ============================================================================

interface NotificationHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * Header row containing title and dismiss button
 */
export function NotificationHeader({ children, className }: NotificationHeaderProps) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      {children}
    </div>
  );
}

// ============================================================================
// Content Components
// ============================================================================

interface NotificationTitleProps {
  className?: string;
}

/**
 * Notification title text
 */
export function NotificationTitle({ className }: NotificationTitleProps) {
  const { notification } = useNotification();

  return (
    <div className="flex-1 min-w-0">
      <p className={cn("text-sm font-medium truncate", className)}>
        {notification.title}
      </p>
    </div>
  );
}

interface NotificationMessageProps {
  className?: string;
}

/**
 * Notification message/body text
 */
export function NotificationMessage({ className }: NotificationMessageProps) {
  const { notification } = useNotification();

  return (
    <p className={cn("text-xs text-muted-foreground mt-0.5", className)}>
      {notification.message}
    </p>
  );
}

interface NotificationTimestampProps {
  className?: string;
}

/**
 * Relative timestamp (e.g., "5 minutes ago")
 */
export function NotificationTimestamp({ className }: NotificationTimestampProps) {
  const { notification } = useNotification();

  return (
    <p className={cn("text-[10px] text-muted-foreground mt-1", className)}>
      {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
    </p>
  );
}

// ============================================================================
// Priority Indicator
// ============================================================================

interface NotificationPriorityIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

/**
 * Visual priority indicator (optional, since Root handles border)
 * Can show label if needed for accessibility
 */
export function NotificationPriorityIndicator({
  className,
  showLabel = false,
}: NotificationPriorityIndicatorProps) {
  const { notification } = useNotification();

  if (!showLabel) return null;

  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wider font-medium",
        notification.priority === "urgent" && "text-red-500",
        notification.priority === "high" && "text-amber-500",
        notification.priority === "medium" && "text-blue-500",
        notification.priority === "low" && "text-muted-foreground",
        className
      )}
    >
      {notification.priority}
    </span>
  );
}

// ============================================================================
// Action Components
// ============================================================================

interface NotificationDismissProps {
  className?: string;
}

/**
 * Dismiss button (X icon)
 */
export function NotificationDismiss({ className }: NotificationDismissProps) {
  const { onDismiss } = useNotification();

  return (
    <button
      onClick={onDismiss}
      className={cn("p-1 hover:bg-muted rounded shrink-0", className)}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

interface NotificationActionsProps {
  className?: string;
}

/**
 * Action buttons container
 * Renders notification.actions if present
 */
export function NotificationActions({ className }: NotificationActionsProps) {
  const { notification, onAction } = useNotification();

  if (!notification.actions || notification.actions.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex gap-2 mt-2", className)}>
      {notification.actions.map((action, i) => (
        <Button
          key={i}
          size="sm"
          variant={action.variant === "primary" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => onAction(action)}
        >
          {action.action.type === "open_url" && (
            <ExternalLink className="h-3 w-3 mr-1" />
          )}
          {action.action.type === "send_chat" && (
            <MessageSquare className="h-3 w-3 mr-1" />
          )}
          {action.label}
        </Button>
      ))}
    </div>
  );
}

// ============================================================================
// Namespace Export
// ============================================================================

/**
 * Namespace export for compound component pattern
 * Usage: <Notification.Root>, <Notification.Title>, etc.
 */
export const Notification = {
  Root: NotificationRoot,
  Header: NotificationHeader,
  Title: NotificationTitle,
  Message: NotificationMessage,
  Timestamp: NotificationTimestamp,
  Priority: NotificationPriorityIndicator,
  Dismiss: NotificationDismiss,
  Actions: NotificationActions,
};
