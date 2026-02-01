"use client";

// Notification Panel - dropdown list of notifications with actions
// See: Polling + Notifications system plan

import { useCallback, useMemo } from "react";
import { useStore } from "@/store";
import { formatDistanceToNow } from "date-fns";
import { X, Check, ExternalLink, MessageSquare, Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Notification, NotificationAction } from "@/store/notification-slice";

interface NotificationPanelProps {
  onClose?: () => void;
}

function NotificationItem({
  notification,
  onAction,
  onDismiss,
}: {
  notification: Notification;
  onAction: (action: NotificationAction) => void;
  onDismiss: () => void;
}) {
  const priorityColors = {
    low: "border-l-muted-foreground",
    medium: "border-l-blue-500",
    high: "border-l-amber-500",
    urgent: "border-l-red-500",
  };

  return (
    <div
      className={cn(
        "p-3 border-l-2 bg-card rounded-r-lg",
        priorityColors[notification.priority],
        !notification.read && "bg-muted/50"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{notification.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
          </p>
        </div>
        <button onClick={onDismiss} className="p-1 hover:bg-muted rounded shrink-0">
          <X className="h-3 w-3" />
        </button>
      </div>

      {notification.actions && notification.actions.length > 0 && (
        <div className="flex gap-2 mt-2">
          {notification.actions.map((action, i) => (
            <Button
              key={i}
              size="sm"
              variant={action.variant === "primary" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => onAction(action)}
            >
              {action.action.type === "open_url" && <ExternalLink className="h-3 w-3 mr-1" />}
              {action.action.type === "send_chat" && <MessageSquare className="h-3 w-3 mr-1" />}
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  // Select raw state and actions separately to avoid infinite loop
  const rawNotifications = useStore((state) => state.notifications);
  const pollingEnabled = useStore((state) => state.pollingEnabled);
  const markAsRead = useStore((state) => state.markAsRead);
  const markAllAsRead = useStore((state) => state.markAllAsRead);
  const dismiss = useStore((state) => state.dismiss);
  const dismissAll = useStore((state) => state.dismissAll);
  const setPollingEnabled = useStore((state) => state.setPollingEnabled);
  const queueChatMessage = useStore((state) => state.queueChatMessage);

  // Helper to store insight feedback via API route
  const storeInsightFeedback = useCallback(
    async (insightId: string, action: "dismissed" | "acted_on" | "followed_up") => {
      try {
        await fetch("/api/memory/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ insightId, action }),
        });
      } catch (error) {
        console.error("Failed to store insight feedback:", error);
      }
    },
    []
  );

  // Filter active notifications (not dismissed, not expired)
  const notifications = useMemo(() => {
    const now = Date.now();
    return rawNotifications.filter(
      (n) => !n.dismissed && (!n.expiresAt || n.expiresAt > now)
    );
  }, [rawNotifications]);

  const handleAction = useCallback(
    async (notification: Notification, action: NotificationAction) => {
      markAsRead(notification.id);

      // Track feedback for assistant insights
      if (notification.category === "assistant" && notification.dedupeKey) {
        storeInsightFeedback(notification.dedupeKey, "acted_on");
      }

      switch (action.action.type) {
        case "open_url":
          window.open(action.action.url, "_blank");
          break;
        case "send_chat":
          queueChatMessage(action.action.message);
          onClose?.();
          break;
        case "dismiss":
          dismiss(notification.id);
          break;
      }
    },
    [markAsRead, storeInsightFeedback, queueChatMessage, onClose, dismiss]
  );

  const handleDismiss = useCallback(
    (notification: Notification) => {
      // Track dismissal for learning
      if (notification.category === "assistant" && notification.dedupeKey) {
        storeInsightFeedback(notification.dedupeKey, "dismissed");
      }

      dismiss(notification.id);
    },
    [storeInsightFeedback, dismiss]
  );

  return (
    <div className="w-80 bg-popover border rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold text-sm">Notifications</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPollingEnabled(!pollingEnabled)}
            className="p-1.5 hover:bg-muted rounded"
            title={pollingEnabled ? "Pause notifications" : "Resume notifications"}
          >
            {pollingEnabled ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {notifications.length > 0 && (
            <>
              <button
                onClick={markAllAsRead}
                className="p-1.5 hover:bg-muted rounded"
                title="Mark all as read"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={dismissAll} className="p-1.5 hover:bg-muted rounded" title="Dismiss all">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notifications list */}
      <ScrollArea className="max-h-96">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notifications</p>
            <p className="text-xs mt-1">
              {pollingEnabled ? "We'll notify you of changes" : "Notifications paused"}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onAction={(action) => handleAction(notification, action)}
                onDismiss={() => handleDismiss(notification)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
