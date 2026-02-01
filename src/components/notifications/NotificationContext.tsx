"use client";

// Notification Context - provides notification data to compound components
// See: React composition patterns for flexible notification customization

import { createContext, useContext, type ReactNode } from "react";
import type { Notification, NotificationAction } from "@/store/notification-slice";

// ============================================================================
// Types
// ============================================================================

interface NotificationContextValue {
  notification: Notification;
  onAction: (action: NotificationAction) => void;
  onDismiss: () => void;
}

// ============================================================================
// Context
// ============================================================================

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Hook to access notification context
 * Must be used within a NotificationProvider
 */
export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
}

// ============================================================================
// Provider
// ============================================================================

interface NotificationProviderProps {
  notification: Notification;
  onAction: (action: NotificationAction) => void;
  onDismiss: () => void;
  children: ReactNode;
}

/**
 * Provider component that wraps notification compound components
 * Supplies notification data and action handlers to children
 */
export function NotificationProvider({
  notification,
  onAction,
  onDismiss,
  children,
}: NotificationProviderProps) {
  return (
    <NotificationContext.Provider value={{ notification, onAction, onDismiss }}>
      {children}
    </NotificationContext.Provider>
  );
}
