import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { getSessionFilesystemLayout, validateToolLoopIntegrity } from "@/lib/pi-adapter-contract";
import { resolveChatSessionScope } from "@/lib/pi-phase1-adapter";
import {
  readToolLoopEventsFromFilesystem,
  resetPiRuntimeEngineResolverForTests,
  resetPiRetentionSchedulerForTests,
} from "@/lib/pi-runtime";

vi.mock("@/lib/telemetry", () => ({
  appendTelemetry: vi.fn().mockResolvedValue(undefined),
}));

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
} as const;

function finishChunk(reason: "stop" | "tool-calls") {
  return {
    type: "finish" as const,
    finishReason: { unified: reason, raw: reason },
    usage,
  };
}

describe("chat route filesystem tool loop integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetPiRuntimeEngineResolverForTests();
    resetPiRetentionSchedulerForTests();
  });

  it("executes write_file + read_file via /api/chat and persists ledger call/result events", async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-chat-fs-ledger-"));
    const allowedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-chat-fs-root-"));
    const targetRelativePath = "sandbox/pi-e2e.txt";
    const expectedContent = "pi runtime fs tool e2e\n";

    vi.stubEnv("PI_RUNTIME_ROOT", runtimeRoot);
    vi.stubEnv("PI_FS_ALLOWED_ROOT", allowedRoot);
    vi.stubEnv("PI_FILESYSTEM_TOOLS_ENABLED", "1");
    vi.stubEnv("PI_FS_DELETE_ENABLED", "0");
    vi.stubEnv("PI_RUNTIME_ENGINE_MODULE", "");
    vi.stubEnv("PI_EPISODE_LOG_DISABLED", "0");

    const mockModel = new MockLanguageModelV3({
      provider: "mock-provider",
      modelId: "mock-fs-e2e",
      doStream: (() => {
        let callCount = 0;
        return async () => {
          callCount += 1;

          if (callCount === 1) {
            return {
              stream: simulateReadableStream({
                chunks: [
                  {
                    type: "tool-call",
                    toolCallId: "tc_write",
                    toolName: "write_file",
                    input: JSON.stringify({
                      path: targetRelativePath,
                      content: expectedContent,
                      mode: "overwrite",
                      createParents: true,
                    }),
                  },
                  finishChunk("tool-calls"),
                ],
              }),
            };
          }

          if (callCount === 2) {
            return {
              stream: simulateReadableStream({
                chunks: [
                  {
                    type: "tool-call",
                    toolCallId: "tc_read",
                    toolName: "read_file",
                    input: JSON.stringify({
                      path: targetRelativePath,
                    }),
                  },
                  finishChunk("tool-calls"),
                ],
              }),
            };
          }

          return {
            stream: simulateReadableStream({
              chunks: [
                { type: "text-start", id: "txt_final" },
                { type: "text-delta", id: "txt_final", delta: "filesystem loop complete" },
                { type: "text-end", id: "txt_final" },
                finishChunk("stop"),
              ],
            }),
          };
        };
      })(),
    });

    vi.doMock("@ai-sdk/openai", () => ({
      openai: vi.fn(() => mockModel),
    }));

    const { POST } = await import("@/app/api/chat/route");

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "write and read a local file" }],
          },
        ],
        canvas: {
          grid: { columns: 12, rows: 8 },
          components: [],
        },
        workspaceId: "ws_pi_fs_e2e",
        threadId: "thread_pi_fs_e2e",
        activeSpaceId: "space_pi_fs_e2e",
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    const body = await res.text();

    expect(res.status, body).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("filesystem loop complete");

    const absoluteTargetPath = path.join(allowedRoot, targetRelativePath);
    const writtenContent = await fs.readFile(absoluteTargetPath, "utf8");
    expect(writtenContent).toBe(expectedContent);

    const sessionScope = resolveChatSessionScope({
      workspaceId: "ws_pi_fs_e2e",
      threadId: "thread_pi_fs_e2e",
      activeSpaceId: "space_pi_fs_e2e",
    });

    const layout = getSessionFilesystemLayout(runtimeRoot, sessionScope.sessionId);
    const ledgerFiles = await fs.readdir(layout.ledgerDir);
    expect(ledgerFiles.some((name) => name.endsWith(".jsonl"))).toBe(true);

    const events = await readToolLoopEventsFromFilesystem(runtimeRoot, sessionScope.sessionId);
    expect(events).toHaveLength(4);

    const integrity = validateToolLoopIntegrity(events);
    expect(integrity).toEqual({ ok: true });
    const [writeCall, writeResult, readCall, readResult] = events;
    expect(writeCall).toMatchObject({
      kind: "call",
      toolCallId: "tc_write",
      toolName: "write_file",
      args: {
        path: targetRelativePath,
        content: expectedContent,
        mode: "overwrite",
        createParents: true,
      },
    });
    expect(writeResult).toMatchObject({
      kind: "result",
      toolCallId: "tc_write",
      toolName: "write_file",
      isError: false,
    });
    expect(readCall).toMatchObject({
      kind: "call",
      toolCallId: "tc_read",
      toolName: "read_file",
      args: {
        path: targetRelativePath,
      },
    });
    expect(readResult).toMatchObject({
      kind: "result",
      toolCallId: "tc_read",
      toolName: "read_file",
      isError: false,
    });

    if (writeCall.kind === "call" && writeResult.kind === "result") {
      expect(writeResult.idempotencyKey).toBe(writeCall.idempotencyKey);
    }
    if (readCall.kind === "call" && readResult.kind === "result") {
      expect(readResult.idempotencyKey).toBe(readCall.idempotencyKey);
      expect(readResult.result).toMatchObject({
        success: true,
        path: targetRelativePath,
        content: expectedContent,
      });
    }
  });
});
