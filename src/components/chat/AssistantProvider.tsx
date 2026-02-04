"use client";

// AssistantProvider - wraps useChatRuntime with canvas context
// Uses AssistantChatTransport to forward system messages and body data to the API

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "@ai-sdk/react";
import { useStore } from "@/store";
import { formatRecentChanges } from "@/lib/canvas-context";
import { useRef } from "react";

interface AssistantProviderProps {
  children: React.ReactNode;
}

export function AssistantProvider({ children }: AssistantProviderProps) {
  // Keep a stable reference to the transport
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transportRef = useRef<InstanceType<typeof AssistantChatTransport<UIMessage>>>(null!);
  if (!transportRef.current) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transportRef.current = new (AssistantChatTransport as any)({
      api: "/api/chat",
      // Body is computed dynamically via the getter function
      body: () => {
        const state = useStore.getState();
        return {
          canvas: state.canvas,
          recentChanges: formatRecentChanges(
            [...state.undoStack].reverse().slice(0, 10),
            5
          ),
          activeSpaceName: (() => {
            if (!state.activeSpaceId) return null;
            const space = state.workspace.spaces.find((s) => s.id === state.activeSpaceId);
            return space?.name ?? null;
          })(),
          spaces: state.workspace.spaces,
        };
      },
    });
  }

  // Create runtime with the stable transport
  const runtime = useChatRuntime({
    transport: transportRef.current,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
