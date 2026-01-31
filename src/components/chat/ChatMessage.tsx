// ChatMessage - displays a single chat message with role-based styling
// Supports tool call display for transparency

import type { ToolCall } from "@/store/chat-slice";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

export function ChatMessage({ role, content, toolCalls }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-[var(--grid-color)] text-[var(--foreground)]"
        }`}
      >
        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap">{content}</p>

        {/* Tool calls (assistant only) */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/20">
            {toolCalls.map((tc) => (
              <div key={tc.id} className="text-xs opacity-75 mb-1">
                <span className="font-mono">
                  {tc.name}({JSON.stringify(tc.arguments)})
                </span>
                {tc.result !== undefined && (
                  <span className="ml-1 text-green-300">✓</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
