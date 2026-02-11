import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages } from "ai";
import { createSystemPrompt } from "@/lib/ai-tools";
import { appendTelemetry } from "@/lib/telemetry";
import {
  resolveChatSessionScope,
  streamWithPiPhase1Adapter,
  toFrontendToolSet,
} from "@/lib/pi-phase1-adapter";

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    convertToModelMessages: vi.fn(),
  };
});

vi.mock("@/lib/ai-tools", () => ({
  createSystemPrompt: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  appendTelemetry: vi.fn(),
}));

vi.mock("@/lib/pi-phase1-adapter", () => ({
  resolveChatSessionScope: vi.fn(),
  streamWithPiPhase1Adapter: vi.fn(),
  toFrontendToolSet: vi.fn(),
}));

function createChatRequest({
  body,
  signal,
}: {
  body?: Record<string, unknown>;
  signal?: AbortSignal;
} = {}) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      canvas: { components: [] },
      ...(body ?? {}),
    }),
    signal,
  });
}

describe("Chat API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(createSystemPrompt).mockReturnValue("Dynamic prompt");
    vi.mocked(convertToModelMessages).mockResolvedValue([]);
    vi.mocked(toFrontendToolSet).mockReturnValue(undefined);
    vi.mocked(openai).mockReturnValue({ modelId: "gpt-4o" } as never);
    vi.mocked(resolveChatSessionScope).mockReturnValue({
      workspaceId: "ws_123",
      threadId: "thread_123",
      spaceId: "space_123",
      sessionId: "ws_123:space_123:thread_123",
    });
    vi.mocked(appendTelemetry).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("propagates request abort signal into the phase-1 adapter", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const abortController = new AbortController();

    vi.mocked(streamWithPiPhase1Adapter).mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("ok")),
    } as never);

    const req = createChatRequest({
      body: {
        workspaceId: "ws_123",
        threadId: "thread_123",
        activeSpaceId: "space_123",
      },
      signal: abortController.signal,
    });
    await POST(req as unknown as NextRequest);

    expect(streamWithPiPhase1Adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        session: {
          workspaceId: "ws_123",
          threadId: "thread_123",
          spaceId: "space_123",
          sessionId: "ws_123:space_123:thread_123",
        },
      })
    );
    const call = vi.mocked(streamWithPiPhase1Adapter).mock.calls[0]?.[0];
    expect(call?.abortSignal).toBe(req.signal);
  });

  it("maps stream errors through route onError and emits stream_error telemetry", async () => {
    const { POST } = await import("@/app/api/chat/route");

    vi.mocked(streamWithPiPhase1Adapter).mockReturnValue({
      toUIMessageStreamResponse: vi.fn((options: { onError: (error: unknown) => string }) => {
        const message = options.onError(new Error("adapter exploded"));
        return new Response(message, { status: 200 });
      }),
    } as never);

    const res = await POST(createChatRequest() as unknown as NextRequest);
    const text = await res.text();

    expect(text).toBe("adapter exploded");
    expect(appendTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        source: "api.chat",
        event: "stream_error",
      })
    );
  });

  it("passes through partial stream output from adapter response", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const encoder = new TextEncoder();
    const partialStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("partial "));
        controller.enqueue(encoder.encode("output"));
        controller.close();
      },
    });

    vi.mocked(streamWithPiPhase1Adapter).mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() =>
        new Response(partialStream, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      ),
    } as never);

    const res = await POST(createChatRequest() as unknown as NextRequest);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe("partial output");
  });
});
