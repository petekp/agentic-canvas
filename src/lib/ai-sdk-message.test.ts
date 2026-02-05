import { describe, expect, it } from "vitest";
import type { AppendMessage } from "@assistant-ui/react";
import { createUIMessageFromAppendMessage } from "./ai-sdk-message";

describe("createUIMessageFromAppendMessage", () => {
  it("strips non-serializable metadata so structuredClone succeeds", () => {
    const message: AppendMessage = {
      role: "user",
      createdAt: new Date(),
      content: [{ type: "text", text: "show my slack mentions" }],
      attachments: [],
      metadata: {
        custom: {
          unsafe: () => "nope",
        } as unknown as Record<string, unknown>,
      },
      parentId: null,
      sourceId: null,
      runConfig: undefined,
    };

    const uiMessage = createUIMessageFromAppendMessage(message);

    expect(uiMessage.parts).toEqual([{ type: "text", text: "show my slack mentions" }]);
    expect(() => structuredClone(uiMessage)).not.toThrow();
    expect((uiMessage.metadata as Record<string, unknown> | undefined)?.custom).toEqual({});
  });
});
