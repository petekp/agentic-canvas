// ChatInput - text input for chat messages with Enter to send
// Uses shadcn Textarea and Button components

import { useState, useCallback, type KeyboardEvent, type ChangeEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SendHorizonal } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter without Shift sends the message
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !disabled) {
          onSend(value.trim());
          setValue("");
        }
      }
    },
    [value, disabled, onSend]
  );

  const handleSubmit = useCallback(() => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue("");
    }
  }, [value, disabled, onSend]);

  return (
    <div className="flex gap-2 p-3">
      <Textarea
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="min-h-10 max-h-32 resize-none"
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        size="icon"
        className="shrink-0"
      >
        <SendHorizonal className="h-4 w-4" />
      </Button>
    </div>
  );
}
