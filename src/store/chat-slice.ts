// Chat Slice - manages chat messages and streaming state
// See implementation plan for architecture details

import { StateCreator } from "zustand";
import { nanoid } from "nanoid";
import type { AgenticCanvasStore } from "./index";

// ============================================================================
// Types
// ============================================================================

export type MessageRole = "user" | "assistant";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  createdAt: number;
}

export interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
}

// ============================================================================
// Slice Interface
// ============================================================================

export interface ChatSlice {
  // State
  chat: ChatState;
  lastUserMessage: string | null;

  // Actions
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string, toolCalls?: ToolCall[]) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setLastUserMessage: (content: string | null) => void;
  setStreaming: (isStreaming: boolean) => void;
  updateStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  finalizeStreamingMessage: (toolCalls?: ToolCall[]) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  updateToolCallResult: (messageId: string, toolCallId: string, result: unknown) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialChatState: ChatState = {
  messages: [],
  isStreaming: false,
  streamingContent: "",
  error: null,
};

// ============================================================================
// Slice Creator
// ============================================================================

export const createChatSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  ChatSlice
> = (set) => ({
  chat: initialChatState,
  lastUserMessage: null,

  addUserMessage: (content) => {
    set((state) => {
      state.chat.messages.push({
        id: nanoid(),
        role: "user",
        content,
        createdAt: Date.now(),
      });
      state.chat.error = null;
      state.lastUserMessage = content;
    });
  },

  addAssistantMessage: (content, toolCalls) => {
    set((state) => {
      state.chat.messages.push({
        id: nanoid(),
        role: "assistant",
        content,
        toolCalls,
        createdAt: Date.now(),
      });
    });
  },

  setMessages: (messages) => {
    set((state) => {
      state.chat.messages = messages;
    });
  },

  setLastUserMessage: (content) => {
    set((state) => {
      state.lastUserMessage = content;
    });
  },

  setStreaming: (isStreaming) => {
    set((state) => {
      state.chat.isStreaming = isStreaming;
      if (isStreaming) {
        state.chat.streamingContent = "";
      }
    });
  },

  updateStreamingContent: (content) => {
    set((state) => {
      state.chat.streamingContent = content;
    });
  },

  appendStreamingContent: (chunk) => {
    set((state) => {
      state.chat.streamingContent += chunk;
    });
  },

  finalizeStreamingMessage: (toolCalls) => {
    set((state) => {
      if (state.chat.streamingContent) {
        state.chat.messages.push({
          id: nanoid(),
          role: "assistant",
          content: state.chat.streamingContent,
          toolCalls,
          createdAt: Date.now(),
        });
      }
      state.chat.streamingContent = "";
      state.chat.isStreaming = false;
    });
  },

  setError: (error) => {
    set((state) => {
      state.chat.error = error;
      state.chat.isStreaming = false;
    });
  },

  clearMessages: () => {
    set((state) => {
      state.chat.messages = [];
      state.chat.streamingContent = "";
      state.chat.isStreaming = false;
      state.chat.error = null;
    });
  },

  updateToolCallResult: (messageId, toolCallId, result) => {
    set((state) => {
      const message = state.chat.messages.find((m) => m.id === messageId);
      if (message?.toolCalls) {
        const toolCall = message.toolCalls.find((tc) => tc.id === toolCallId);
        if (toolCall) {
          toolCall.result = result;
        }
      }
    });
  },
});
