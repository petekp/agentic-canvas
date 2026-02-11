import { describe, expect, it } from "vitest";
import {
  assertStrictlyIncreasingSequence,
  assistantBridgeEventSchema,
  buildAgentSessionId,
  buildToolIdempotencyKey,
  getSessionFilesystemLayout,
  mapPiEventToAssistantBridgeEvent,
  piStreamEventSchema,
  shouldCompactEpisode,
  validateToolLoopIntegrity,
  type PiStreamEvent,
  type ToolLoopEvent,
} from "./pi-adapter-contract";

describe("pi adapter contract", () => {
  it("validates and maps text delta events to assistant bridge events", () => {
    const piEvent = piStreamEventSchema.parse({
      type: "response.output_text.delta",
      runId: "run_123",
      timestamp: 1739300000000,
      sequence: 1,
      delta: "hello ",
    });

    const bridgeEvent = mapPiEventToAssistantBridgeEvent(piEvent, {
      sessionId: "ws_1:space_1:thread_1",
    });

    expect(
      assistantBridgeEventSchema.parse(bridgeEvent)
    ).toEqual({
      type: "assistant.message.delta",
      runId: "run_123",
      delta: "hello ",
    });
  });

  it("maps tool call events and derives idempotency keys", () => {
    const piEvent = piStreamEventSchema.parse({
      type: "response.tool_call",
      runId: "run_123",
      timestamp: 1739300000001,
      sequence: 2,
      toolCallId: "tc_abc",
      toolName: "add_component",
      args: {
        type_id: "github.pr-list",
      },
    });

    const bridgeEvent = mapPiEventToAssistantBridgeEvent(piEvent, {
      sessionId: "ws_1:space_1:thread_1",
    });

    expect(bridgeEvent.type).toBe("assistant.tool.call");
    if (bridgeEvent.type === "assistant.tool.call") {
      expect(bridgeEvent.idempotencyKey).toBe("ws_1:space_1:thread_1:tc_abc");
    }
  });

  it("enforces strictly increasing event sequence", () => {
    const validEvents = [
      {
        type: "response.created",
        runId: "run_1",
        timestamp: 1,
        sequence: 0,
      },
      {
        type: "response.output_text.delta",
        runId: "run_1",
        timestamp: 2,
        sequence: 1,
        delta: "A",
      },
      {
        type: "response.completed",
        runId: "run_1",
        timestamp: 3,
        sequence: 2,
      },
    ].map((event) => piStreamEventSchema.parse(event));

    expect(assertStrictlyIncreasingSequence(validEvents)).toEqual({ ok: true });

    const invalidEvents = [
      {
        type: "response.created",
        runId: "run_1",
        timestamp: 1,
        sequence: 0,
      },
      {
        type: "response.output_text.delta",
        runId: "run_1",
        timestamp: 2,
        sequence: 0,
        delta: "B",
      },
    ].map((event) => piStreamEventSchema.parse(event));

    expect(assertStrictlyIncreasingSequence(invalidEvents).ok).toBe(false);
  });

  it("validates tool loop integrity (result must match a prior call)", () => {
    const sessionId = "ws_1:space_1:thread_1";
    const callId = "tc_123";
    const idempotencyKey = buildToolIdempotencyKey(sessionId, callId);

    const validLoop: ToolLoopEvent[] = [
      {
        kind: "call",
        runId: "run_1",
        toolCallId: callId,
        toolName: "add_component",
        args: { type_id: "github.pr-list" },
        idempotencyKey,
      },
      {
        kind: "result",
        runId: "run_1",
        toolCallId: callId,
        toolName: "add_component",
        result: { success: true },
        isError: false,
        idempotencyKey,
      },
    ];

    expect(validateToolLoopIntegrity(validLoop)).toEqual({ ok: true });

    const invalidLoop: ToolLoopEvent[] = [
      {
        kind: "result",
        runId: "run_1",
        toolCallId: "tc_missing",
        toolName: "add_component",
        result: { success: true },
        isError: false,
        idempotencyKey: buildToolIdempotencyKey(sessionId, "tc_missing"),
      },
    ];

    expect(validateToolLoopIntegrity(invalidLoop).ok).toBe(false);
  });

  it("builds stable session ids and filesystem layout", () => {
    const sessionId = buildAgentSessionId({
      workspaceId: "ws_123",
      spaceId: "space_123",
      threadId: "thread_abc",
    });
    expect(sessionId).toBe("ws_123:space_123:thread_abc");

    const layout = getSessionFilesystemLayout(".runtime/pi", sessionId);
    expect(layout.sessionDir).toContain("sessions/ws_123%3Aspace_123%3Athread_abc");
    expect(layout.memoryDir.endsWith("/memory")).toBe(true);
    expect(layout.episodesDir.endsWith("/episodes")).toBe(true);
    expect(layout.ledgerDir.endsWith("/ledger")).toBe(true);
    expect(layout.snapshotsDir.endsWith("/snapshots")).toBe(true);
  });

  it("uses compaction policy defaults", () => {
    expect(shouldCompactEpisode(2)).toBe(false);
    expect(shouldCompactEpisode(3)).toBe(true);
  });

  it("accepts full canonical pi event sequence", () => {
    const sequence: PiStreamEvent[] = [
      {
        type: "response.created",
        runId: "run_2",
        timestamp: 1,
        sequence: 0,
        model: "gpt-4o",
      },
      {
        type: "response.output_text.delta",
        runId: "run_2",
        timestamp: 2,
        sequence: 1,
        delta: "Checking canvas...",
      },
      {
        type: "response.output_text.done",
        runId: "run_2",
        timestamp: 3,
        sequence: 2,
      },
      {
        type: "response.tool_call",
        runId: "run_2",
        timestamp: 4,
        sequence: 3,
        toolCallId: "tc_2",
        toolName: "create_space",
        args: { name: "Focus lane" },
      },
      {
        type: "response.completed",
        runId: "run_2",
        timestamp: 5,
        sequence: 4,
      },
    ].map((event) => piStreamEventSchema.parse(event));

    expect(sequence).toHaveLength(5);
    expect(assertStrictlyIncreasingSequence(sequence)).toEqual({ ok: true });
  });
});
