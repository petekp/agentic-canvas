"use client";

// Notification Badge - shows bell icon with unread count
// See: Polling + Notifications system plan

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";

interface NotificationBadgeProps {
  onClick?: () => void;
  className?: string;
}

export function NotificationBadge({ onClick, className }: NotificationBadgeProps) {
  const unreadCount = useStore((state) => state.getUnreadCount());
  const [pulse, setPulse] = useState(false);
  const prevCountRef = useRef(unreadCount);

  // Pulse animation when new notifications arrive
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 2000);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-2 rounded-lg hover:bg-muted transition-colors",
        pulse && "animate-pulse",
        className
      )}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
