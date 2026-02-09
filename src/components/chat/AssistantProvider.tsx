"use client";

// AssistantProvider - wraps useChatRuntime with canvas context
// Uses AssistantChatTransport to forward system messages and body data to the API

import { AssistantRuntimeProvider, useAssistantState } from "@assistant-ui/react";
import { AssistantChatTransport, useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { useStore } from "@/store";
import { formatRecentChanges } from "@/lib/canvas-context";
import { createUIMessageFromAppendMessage } from "@/lib/ai-sdk-message";
import { useEffect, useMemo, useRef } from "react";

type SendRequestBody = {
  canvas: unknown;
  recentChanges: unknown;
  activeSpaceName: string | null;
  spaces: unknown;
  transforms: unknown;
  rules: unknown;
};

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
          transforms: state.getTransforms(),
          rules: state.getRulePack(),
        } satisfies SendRequestBody;
      },
    });
  }

  const chat = useChat({
    id: "assistant",
    transport: transportRef.current,
  });

  const runtime = useAISDKRuntime(chat, {
    toCreateMessage: createUIMessageFromAppendMessage,
  });

  if (transportRef.current instanceof AssistantChatTransport) {
    transportRef.current.setRuntime(runtime);
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantMessageSync />
      {children}
    </AssistantRuntimeProvider>
  );
}

function AssistantMessageSync() {
  const messages = useAssistantState((s) => s.thread.messages);
  const setMessages = useStore((s) => s.setMessages);

  const normalized = useMemo(
    () =>
      messages.map((message) => {
        const parts = Array.isArray(message.content)
          ? message.content
          : [];
        const text = parts
          .filter((part) => part.type === "text" && typeof part.text === "string")
          .map((part) => part.text)
          .join("");

        return {
          id: message.id ?? `msg_${message.role}_${message.createdAt?.getTime() ?? Date.now()}`,
          role: message.role as "user" | "assistant",
          content: text,
          createdAt: message.createdAt?.getTime() ?? Date.now(),
        };
      }),
    [messages]
  );

  useEffect(() => {
    setMessages(normalized);
  }, [normalized, setMessages]);

  return null;
}
