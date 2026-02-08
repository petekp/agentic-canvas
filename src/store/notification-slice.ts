// Notification Slice - manages notifications from polling and change detection
// See: Polling + Notifications system plan

import { StateCreator } from "zustand";
import { nanoid } from "nanoid";
import type { AgenticCanvasStore } from "./index";

// ============================================================================
// Types
// ============================================================================

export type NotificationPriority = "low" | "medium" | "high" | "urgent";
export type NotificationCategory = "github" | "posthog" | "system" | "assistant";

export interface NotificationAction {
  label: string;
  action:
    | { type: "open_url"; url: string }
    | { type: "send_chat"; message: string }
    | { type: "dismiss" }
    | { type: "custom"; handler: string };
  variant?: "default" | "primary" | "destructive";
}

export interface Notification {
  id: string;

  // Content
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;

  // Source context
  source: {
    type: "github" | "posthog" | "system";
    componentId?: string;
    externalUrl?: string;
    externalId?: string;
  };

  // Actions
  actions?: NotificationAction[];

  // State
  read: boolean;
  dismissed: boolean;
  createdAt: number;
  expiresAt?: number;

  // For deduplication
  dedupeKey?: string;
}

// ============================================================================
// State & Actions
// ============================================================================

export interface NotificationState {
  notifications: Notification[];
  maxNotifications: number;

  // Polling state
  pollingEnabled: boolean;
  pollingIntervalMs: number;
  lastPollTime: Record<string, number>;

  // Chat integration - queue messages to send from notifications
  pendingChatMessage: string | null;
}

export interface NotificationActions {
  // CRUD
  addNotification: (
    notification: Omit<Notification, "id" | "createdAt" | "read" | "dismissed">
  ) => Notification;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;

  // Queries
  getUnreadCount: () => number;
  getByCategory: (category: NotificationCategory) => Notification[];
  getActive: () => Notification[];

  // Polling control
  setPollingEnabled: (enabled: boolean) => void;
  updateLastPollTime: (source: string) => void;

  // Chat integration
  queueChatMessage: (message: string) => void;
  clearPendingChatMessage: () => void;
}

export type NotificationSlice = NotificationState & NotificationActions;

// ============================================================================
// Slice Creator
// ============================================================================

export const createNotificationSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  NotificationSlice
> = (set, get) => ({
  // Initial state
  notifications: [],
  maxNotifications: 50,
  pollingEnabled: true,
  pollingIntervalMs: 60000, // 1 minute default
  lastPollTime: {},
  pendingChatMessage: null,

  addNotification: (notification) => {
    const id = nanoid(10);
    const now = Date.now();

    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: now,
      read: false,
      dismissed: false,
    };

    set((draft) => {
      // Check for duplicate by dedupeKey
      if (notification.dedupeKey) {
        const existing = draft.notifications.find(
          (n) => n.dedupeKey === notification.dedupeKey && !n.dismissed
        );
        if (existing) {
          // Update existing instead of adding new
          Object.assign(existing, notification);
          existing.createdAt = now;
          return;
        }
      }

      // Add to front
      draft.notifications.unshift(newNotification);

      // Prune old notifications
      if (draft.notifications.length > draft.maxNotifications) {
        draft.notifications = draft.notifications.slice(0, draft.maxNotifications);
      }
    });

    return newNotification;
  },

  markAsRead: (id) => {
    set((draft) => {
      const notification = draft.notifications.find((n) => n.id === id);
      if (notification) notification.read = true;
    });
  },

  markAllAsRead: () => {
    set((draft) => {
      for (const n of draft.notifications) {
        n.read = true;
      }
    });
  },

  dismiss: (id) => {
    set((draft) => {
      const notification = draft.notifications.find((n) => n.id === id);
      if (notification) notification.dismissed = true;
    });
  },

  dismissAll: () => {
    set((draft) => {
      for (const n of draft.notifications) {
        n.dismissed = true;
      }
    });
  },

  getUnreadCount: () => {
    return get().notifications.filter((n) => !n.read && !n.dismissed).length;
  },

  getByCategory: (category) => {
    return get().notifications.filter((n) => n.category === category && !n.dismissed);
  },

  getActive: () => {
    const now = Date.now();
    return get().notifications.filter(
      (n) => !n.dismissed && (!n.expiresAt || n.expiresAt > now)
    );
  },

  setPollingEnabled: (enabled) => {
    set((draft) => {
      draft.pollingEnabled = enabled;
    });
  },

  updateLastPollTime: (source) => {
    set((draft) => {
      draft.lastPollTime[source] = Date.now();
    });
  },

  queueChatMessage: (message) => {
    set((draft) => {
      draft.pendingChatMessage = message;
    });
  },

  clearPendingChatMessage: () => {
    set((draft) => {
      draft.pendingChatMessage = null;
    });
  },
});
