// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantRuntimeProvider, ThreadPrimitive, useLocalRuntime } from "@assistant-ui/react";
import type { ChatModelAdapter } from "@assistant-ui/react";
import { AssistantComposer, AssistantThreadMessages } from "./AssistantThread";
import { describe, expect, it } from "vitest";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = TestResizeObserver as typeof ResizeObserver;
}

if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = () => {};
}

const adapter: ChatModelAdapter = {
  run: async () => ({ content: [] }),
};

function TestApp() {
  const runtime = useLocalRuntime(adapter, {});
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <AssistantThreadMessages />
        <AssistantComposer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

describe("AssistantComposer", () => {
  it("sends a message and renders it in the thread", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    const input = screen.getByRole("textbox");
    await user.type(input, "Hello there{enter}");

    const message = await screen.findByText("Hello there");
    expect(message).toBeTruthy();
  });
});
