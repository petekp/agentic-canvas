import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { buildToolIdempotencyKey } from "./pi-adapter-contract";
import {
  appendToolLoopEventToFilesystem,
  extractToolResultCandidatesFromMessages,
  ingestHistoricalToolResultsFromMessages,
  maybeRunPiRetentionJobs,
  readToolLoopEventsFromFilesystem,
  resetPiRuntimeEngineResolverForTests,
  resetPiRetentionSchedulerForTests,
  streamWithPiRuntime,
} from "./pi-runtime";

describe("pi runtime", () => {
  beforeEach(() => {
    resetPiRetentionSchedulerForTests();
    resetPiRuntimeEngineResolverForTests();
    vi.unstubAllEnvs();
  });

  it("appends and reads ledger tool-loop events from filesystem", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-runtime-ledger-"));
    const sessionId = "ws_1:space_1:thread_1";

    await appendToolLoopEventToFilesystem(root, sessionId, {
      kind: "call",
      runId: "run_1",
      toolCallId: "tc_1",
      toolName: "add_component",
      args: { type_id: "github.pr-list" },
      idempotencyKey: buildToolIdempotencyKey(sessionId, "tc_1"),
    });

    const events = await readToolLoopEventsFromFilesystem(root, sessionId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "call",
      runId: "run_1",
      toolCallId: "tc_1",
      toolName: "add_component",
    });
  });

  it("extracts tool-result and tool-error parts from model messages", () => {
    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tc_1",
            toolName: "create_space",
            output: { success: true },
          },
          {
            type: "tool-error",
            toolCallId: "tc_2",
            toolName: "create_space",
            error: "boom",
          },
        ],
      },
    ] as unknown as ModelMessage[];

    expect(extractToolResultCandidatesFromMessages(messages)).toEqual([
      {
        toolCallId: "tc_1",
        toolName: "create_space",
        result: { success: true },
        isError: false,
      },
      {
        toolCallId: "tc_2",
        toolName: "create_space",
        result: null,
        isError: true,
      },
    ]);
  });

  it("unwraps assistant-ui tool-result payload wrappers", () => {
    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tc_3",
            toolName: "create_space",
            output: {
              type: "json",
              value: { success: true, spaceId: "space_1" },
            },
          },
        ],
      },
    ] as unknown as ModelMessage[];

    expect(extractToolResultCandidatesFromMessages(messages)).toEqual([
      {
        toolCallId: "tc_3",
        toolName: "create_space",
        result: { success: true, spaceId: "space_1" },
        isError: false,
      },
    ]);
  });

  it("ingests historical tool results only when a prior call exists and de-dupes by idempotency", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-runtime-ingest-"));
    const sessionId = "ws_2:none:thread_2";
    const callEvent = {
      kind: "call" as const,
      runId: "run_2",
      toolCallId: "tc_known",
      toolName: "add_component",
      args: { type_id: "github.issue-grid" },
      idempotencyKey: buildToolIdempotencyKey(sessionId, "tc_known"),
    };
    await appendToolLoopEventToFilesystem(root, sessionId, callEvent);

    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "tc_known",
            toolName: "add_component",
            output: { success: true },
          },
          {
            type: "tool-result",
            toolCallId: "tc_missing",
            toolName: "add_component",
            output: { success: true },
          },
        ],
      },
    ] as unknown as ModelMessage[];

    const first = await ingestHistoricalToolResultsFromMessages({
      runtimeRoot: root,
      sessionId,
      messages,
    });
    expect(first).toEqual({
      appended: 1,
      duplicates: 0,
      missingCalls: 1,
    });

    const second = await ingestHistoricalToolResultsFromMessages({
      runtimeRoot: root,
      sessionId,
      messages,
    });
    expect(second).toEqual({
      appended: 0,
      duplicates: 1,
      missingCalls: 1,
    });

    const events = await readToolLoopEventsFromFilesystem(root, sessionId);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      kind: "result",
      runId: "run_2",
      toolCallId: "tc_known",
      toolName: "add_component",
      idempotencyKey: buildToolIdempotencyKey(sessionId, "tc_known"),
      isError: false,
    });
  });

  it("runs retention jobs on interval and skips repeated calls inside the same window", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-runtime-retention-"));

    const first = await maybeRunPiRetentionJobs({
      runtimeRoot: root,
      nowMs: 1_000,
      intervalMs: 500,
    });
    expect(first).toBe(true);

    const second = await maybeRunPiRetentionJobs({
      runtimeRoot: root,
      nowMs: 1_200,
      intervalMs: 500,
    });
    expect(second).toBe(false);

    const third = await maybeRunPiRetentionJobs({
      runtimeRoot: root,
      nowMs: 1_600,
      intervalMs: 500,
    });
    expect(third).toBe(true);
  });

  it("delegates orchestration to an externally configured pi runtime engine module", async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-runtime-engine-"));
    const modulePath = path.join(runtimeRoot, "external-engine.cjs");
    await fs.writeFile(
      modulePath,
      [
        "let calls = 0;",
        "module.exports.piRuntimeEngine = {",
        "id: 'external-test-engine',",
        "stream(input) {",
        "calls += 1;",
        "globalThis.__piRuntimeEngineCalls = calls;",
        "globalThis.__piRuntimeEngineSessionId = input.context.session.sessionId;",
        "return {",
        "toUIMessageStreamResponse() {",
        "return new Response('ok');",
        "}",
        "};",
        "}",
        "};",
      ].join("\n"),
      "utf8"
    );

    vi.stubEnv("PI_RUNTIME_ENGINE_MODULE", modulePath);
    vi.stubEnv("PI_EPISODE_LOG_DISABLED", "1");

    const result = await streamWithPiRuntime({
      model: { modelId: "gpt-4o-mini" } as never,
      system: "system",
      messages: [],
      session: {
        workspaceId: "ws_ext",
        threadId: "thread_ext",
        spaceId: "space_ext",
        sessionId: "ws_ext:space_ext:thread_ext",
      },
    });

    expect(result.toUIMessageStreamResponse).toBeTypeOf("function");
    expect((globalThis as { __piRuntimeEngineCalls?: number }).__piRuntimeEngineCalls).toBe(1);
    expect(
      (globalThis as { __piRuntimeEngineSessionId?: string }).__piRuntimeEngineSessionId
    ).toBe("ws_ext:space_ext:thread_ext");
  });

  it("loads ESM runtime engine modules via file URL specifier", async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-runtime-engine-esm-"));
    const modulePath = path.join(runtimeRoot, "external-engine.mjs");
    await fs.writeFile(
      modulePath,
      [
        "export const piRuntimeEngine = {",
        "id: 'external-esm-engine',",
        "stream(input) {",
        "globalThis.__piEsmRuntimeEngineSessionId = input.context.session.sessionId;",
        "return {",
        "toUIMessageStreamResponse() {",
        "return new Response('esm-ok');",
        "}",
        "};",
        "}",
        "};",
      ].join("\n"),
      "utf8"
    );

    vi.stubEnv("PI_RUNTIME_ENGINE_MODULE", `file://${modulePath}`);
    vi.stubEnv("PI_EPISODE_LOG_DISABLED", "1");

    const result = await streamWithPiRuntime({
      model: { modelId: "gpt-4o-mini" } as never,
      system: "system",
      messages: [],
      session: {
        workspaceId: "ws_ext",
        threadId: "thread_ext",
        spaceId: "space_ext",
        sessionId: "ws_ext:space_ext:thread_ext",
      },
    });

    expect(result.toUIMessageStreamResponse).toBeTypeOf("function");
    expect(
      (globalThis as { __piEsmRuntimeEngineSessionId?: string }).__piEsmRuntimeEngineSessionId
    ).toBe("ws_ext:space_ext:thread_ext");
  });
});
