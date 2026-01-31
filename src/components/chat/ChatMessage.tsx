// ChatMessage - displays a single chat message with role-based styling
// Uses shadcn semantic colors for consistency

import type { ToolCall } from "@/store/chat-slice";
import { cn } from "@/lib/utils";
import { Check, Wrench } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

export function ChatMessage({ role, content, toolCalls }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex mb-3", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {/* Message content */}
        <p className="whitespace-pre-wrap">{content}</p>

        {/* Tool calls (assistant only) */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-2 pt-2 border-t border-primary-foreground/20">
            {toolCalls.map((tc) => (
              <div
                key={tc.id}
                className="flex items-center gap-1.5 text-xs opacity-80 mb-1"
              >
                <Wrench className="h-3 w-3" />
                <span className="font-mono truncate">
                  {tc.name}
                </span>
                {tc.result !== undefined && (
                  <Check className="h-3 w-3 text-green-300 ml-auto shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
