import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { validateToolLoopIntegrity } from "@/lib/pi-adapter-contract";
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

async function runAdversarialChatToolCall(input: {
  toolName: "read_file" | "write_file";
  toolInput: Record<string, unknown>;
  workspaceId: string;
  threadId: string;
  activeSpaceId: string;
  runtimeRoot: string;
  allowedRoot: string;
}) {
  vi.stubEnv("PI_RUNTIME_ROOT", input.runtimeRoot);
  vi.stubEnv("PI_FS_ALLOWED_ROOT", input.allowedRoot);
  vi.stubEnv("PI_FILESYSTEM_TOOLS_ENABLED", "1");
  vi.stubEnv("PI_FS_DELETE_ENABLED", "0");
  vi.stubEnv("PI_RUNTIME_ENGINE_MODULE", "");
  vi.stubEnv("PI_EPISODE_LOG_DISABLED", "0");

  const mockModel = new MockLanguageModelV3({
    provider: "mock-provider",
    modelId: "mock-fs-adversarial",
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
                  toolCallId: "tc_adversarial",
                  toolName: input.toolName,
                  input: JSON.stringify(input.toolInput),
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
              { type: "text-delta", id: "txt_final", delta: "adversarial path checked" },
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
          parts: [{ type: "text", text: "run adversarial fs check" }],
        },
      ],
      canvas: {
        grid: { columns: 12, rows: 8 },
        components: [],
      },
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      activeSpaceId: input.activeSpaceId,
    }),
  });

  const res = await POST(req as unknown as NextRequest);
  const body = await res.text();
  expect(res.status, body).toBe(200);
  expect(body).toContain("adversarial path checked");

  const session = resolveChatSessionScope({
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    activeSpaceId: input.activeSpaceId,
  });

  const events = await readToolLoopEventsFromFilesystem(input.runtimeRoot, session.sessionId);
  expect(events).toHaveLength(2);
  expect(validateToolLoopIntegrity(events)).toEqual({ ok: true });
  return events;
}

describe("chat route filesystem adversarial integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetPiRuntimeEngineResolverForTests();
    resetPiRetentionSchedulerForTests();
  });

  it("blocks traversal attempts through write_file and records failure in ledger", async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-chat-fs-adv-traversal-ledger-"));
    const allowedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-chat-fs-adv-traversal-root-"));
    const outsideFileName = `escape-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    const traversalPath = `../${outsideFileName}`;
    const resolvedOutsidePath = path.resolve(allowedRoot, traversalPath);

    const events = await runAdversarialChatToolCall({
      toolName: "write_file",
      toolInput: {
        path: traversalPath,
        content: "attack",
        mode: "overwrite",
        createParents: true,
      },
      workspaceId: "ws_pi_fs_adv_traversal",
      threadId: "thread_pi_fs_adv_traversal",
      activeSpaceId: "space_pi_fs_adv_traversal",
      runtimeRoot,
      allowedRoot,
    });

    const [callEvent, resultEvent] = events;
    expect(callEvent).toMatchObject({
      kind: "call",
      toolCallId: "tc_adversarial",
      toolName: "write_file",
      args: {
        path: traversalPath,
      },
    });
    expect(resultEvent).toMatchObject({
      kind: "result",
      toolCallId: "tc_adversarial",
      toolName: "write_file",
      isError: false,
      result: {
        success: false,
        code: "path_outside_root",
      },
    });

    await expect(fs.stat(resolvedOutsidePath)).rejects.toThrow();
  });

  it("blocks symlink escape through read_file and records failure in ledger", async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-chat-fs-adv-symlink-ledger-"));
    const allowedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-chat-fs-adv-symlink-root-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-chat-fs-adv-symlink-outside-"));
    const outsideFile = path.join(outsideRoot, "outside-secret.txt");
    await fs.writeFile(outsideFile, "secret", "utf8");

    const symlinkPath = path.join(allowedRoot, "outside-link.txt");
    await fs.symlink(outsideFile, symlinkPath);

    const events = await runAdversarialChatToolCall({
      toolName: "read_file",
      toolInput: {
        path: "outside-link.txt",
      },
      workspaceId: "ws_pi_fs_adv_symlink",
      threadId: "thread_pi_fs_adv_symlink",
      activeSpaceId: "space_pi_fs_adv_symlink",
      runtimeRoot,
      allowedRoot,
    });

    const [callEvent, resultEvent] = events;
    expect(callEvent).toMatchObject({
      kind: "call",
      toolCallId: "tc_adversarial",
      toolName: "read_file",
      args: {
        path: "outside-link.txt",
      },
    });
    expect(resultEvent).toMatchObject({
      kind: "result",
      toolCallId: "tc_adversarial",
      toolName: "read_file",
      isError: false,
      result: {
        success: false,
        code: "symlink_escape",
      },
    });
  });
});
