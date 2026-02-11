"use client";

import { useShallow } from "zustand/shallow";
import { useStore } from "@/store";

export function useNotifications() {
  return useStore(
    useShallow((state) => ({
      notifications: state.getActive(),
      unreadCount: state.getUnreadCount(),
      pollingEnabled: state.pollingEnabled,
      markAsRead: state.markAsRead,
      markAllAsRead: state.markAllAsRead,
      dismiss: state.dismiss,
      dismissAll: state.dismissAll,
      setPollingEnabled: state.setPollingEnabled,
      addNotification: state.addNotification,
    }))
  );
}

