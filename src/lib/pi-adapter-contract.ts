import path from "node:path";
import { z } from "zod";

const piEventBaseSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
});

const piResponseCreatedSchema = piEventBaseSchema.extend({
  type: z.literal("response.created"),
  model: z.string().optional(),
});

const piResponseOutputTextDeltaSchema = piEventBaseSchema.extend({
  type: z.literal("response.output_text.delta"),
  delta: z.string(),
});

const piResponseOutputTextDoneSchema = piEventBaseSchema.extend({
  type: z.literal("response.output_text.done"),
});

const piResponseToolCallSchema = piEventBaseSchema.extend({
  type: z.literal("response.tool_call"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

const piResponseCompletedSchema = piEventBaseSchema.extend({
  type: z.literal("response.completed"),
});

const piResponseErrorSchema = piEventBaseSchema.extend({
  type: z.literal("response.error"),
  error: z.string().min(1),
  retryable: z.boolean().default(false),
});

const piResponseCancelledSchema = piEventBaseSchema.extend({
  type: z.literal("response.cancelled"),
  reason: z.string().optional(),
});

export const piStreamEventSchema = z.discriminatedUnion("type", [
  piResponseCreatedSchema,
  piResponseOutputTextDeltaSchema,
  piResponseOutputTextDoneSchema,
  piResponseToolCallSchema,
  piResponseCompletedSchema,
  piResponseErrorSchema,
  piResponseCancelledSchema,
]);

export type PiStreamEvent = z.infer<typeof piStreamEventSchema>;

const assistantMessageStartSchema = z.object({
  type: z.literal("assistant.message.start"),
  runId: z.string().min(1),
});

const assistantMessageDeltaSchema = z.object({
  type: z.literal("assistant.message.delta"),
  runId: z.string().min(1),
  delta: z.string(),
});

const assistantMessageDoneSchema = z.object({
  type: z.literal("assistant.message.done"),
  runId: z.string().min(1),
});

const assistantToolCallSchema = z.object({
  type: z.literal("assistant.tool.call"),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1),
});

const assistantRunCompletedSchema = z.object({
  type: z.literal("assistant.run.completed"),
  runId: z.string().min(1),
});

const assistantRunErrorSchema = z.object({
  type: z.literal("assistant.run.error"),
  runId: z.string().min(1),
  error: z.string().min(1),
  retryable: z.boolean(),
});

const assistantRunCancelledSchema = z.object({
  type: z.literal("assistant.run.cancelled"),
  runId: z.string().min(1),
  reason: z.string().optional(),
});

export const assistantBridgeEventSchema = z.discriminatedUnion("type", [
  assistantMessageStartSchema,
  assistantMessageDeltaSchema,
  assistantMessageDoneSchema,
  assistantToolCallSchema,
  assistantRunCompletedSchema,
  assistantRunErrorSchema,
  assistantRunCancelledSchema,
]);

export type AssistantBridgeEvent = z.infer<typeof assistantBridgeEventSchema>;

export const sessionScopeSchema = z.object({
  workspaceId: z.string().min(1),
  threadId: z.string().min(1),
  spaceId: z.string().min(1).nullable(),
});

export type SessionScope = z.infer<typeof sessionScopeSchema>;

export function buildAgentSessionId(scope: SessionScope): string {
  const normalized = sessionScopeSchema.parse(scope);
  const scopeSpace = normalized.spaceId ?? "none";
  return `${normalized.workspaceId}:${scopeSpace}:${normalized.threadId}`;
}

export function buildToolIdempotencyKey(sessionId: string, toolCallId: string): string {
  return `${sessionId}:${toolCallId}`;
}

export function mapPiEventToAssistantBridgeEvent(
  event: PiStreamEvent,
  options: { sessionId: string }
): AssistantBridgeEvent {
  switch (event.type) {
    case "response.created":
      return { type: "assistant.message.start", runId: event.runId };
    case "response.output_text.delta":
      return { type: "assistant.message.delta", runId: event.runId, delta: event.delta };
    case "response.output_text.done":
      return { type: "assistant.message.done", runId: event.runId };
    case "response.tool_call":
      return {
        type: "assistant.tool.call",
        runId: event.runId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        idempotencyKey: buildToolIdempotencyKey(options.sessionId, event.toolCallId),
      };
    case "response.completed":
      return { type: "assistant.run.completed", runId: event.runId };
    case "response.error":
      return {
        type: "assistant.run.error",
        runId: event.runId,
        error: event.error,
        retryable: event.retryable,
      };
    case "response.cancelled":
      return { type: "assistant.run.cancelled", runId: event.runId, reason: event.reason };
  }
}

export function assertStrictlyIncreasingSequence(events: PiStreamEvent[]): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1];
    const current = events[i];
    if (current.sequence <= prev.sequence) {
      return {
        ok: false,
        error: `Non-monotonic sequence at index ${i}: ${prev.sequence} -> ${current.sequence}`,
      };
    }
  }
  return { ok: true };
}

const toolCallEnvelopeSchema = z.object({
  kind: z.literal("call"),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(1),
});

const toolResultEnvelopeSchema = z.object({
  kind: z.literal("result"),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  result: z.unknown(),
  isError: z.boolean().default(false),
  idempotencyKey: z.string().min(1),
});

export const toolLoopEventSchema = z.discriminatedUnion("kind", [
  toolCallEnvelopeSchema,
  toolResultEnvelopeSchema,
]);

export type ToolLoopEvent = z.infer<typeof toolLoopEventSchema>;
export type ToolCallEnvelope = z.infer<typeof toolCallEnvelopeSchema>;
export type ToolResultEnvelope = z.infer<typeof toolResultEnvelopeSchema>;

export function validateToolLoopIntegrity(events: ToolLoopEvent[]): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  const seenCalls = new Map<string, ToolCallEnvelope>();

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.kind === "call") {
      seenCalls.set(event.toolCallId, event);
      continue;
    }

    const call = seenCalls.get(event.toolCallId);
    if (!call) {
      return {
        ok: false,
        error: `Tool result at index ${i} has no prior call for toolCallId=${event.toolCallId}`,
      };
    }

    if (call.runId !== event.runId) {
      return {
        ok: false,
        error: `Tool result at index ${i} runId mismatch for toolCallId=${event.toolCallId}`,
      };
    }

    if (call.idempotencyKey !== event.idempotencyKey) {
      return {
        ok: false,
        error: `Tool result at index ${i} idempotency mismatch for toolCallId=${event.toolCallId}`,
      };
    }
  }

  return { ok: true };
}

export interface SessionRetentionPolicy {
  episodesTtlDays: number;
  compactAfterDays: number;
  ledgerTtlDays: number;
}

export const DEFAULT_SESSION_RETENTION_POLICY: SessionRetentionPolicy = {
  episodesTtlDays: 14,
  compactAfterDays: 3,
  ledgerTtlDays: 30,
};

export function shouldCompactEpisode(
  episodeAgeDays: number,
  policy: SessionRetentionPolicy = DEFAULT_SESSION_RETENTION_POLICY
): boolean {
  return episodeAgeDays >= policy.compactAfterDays;
}

export interface SessionFilesystemLayout {
  rootDir: string;
  sessionDir: string;
  memoryDir: string;
  episodesDir: string;
  ledgerDir: string;
  snapshotsDir: string;
}

export function getSessionFilesystemLayout(rootDir: string, sessionId: string): SessionFilesystemLayout {
  const safeSessionId = encodeURIComponent(sessionId);
  const sessionDir = path.join(rootDir, "sessions", safeSessionId);
  return {
    rootDir,
    sessionDir,
    memoryDir: path.join(sessionDir, "memory"),
    episodesDir: path.join(sessionDir, "episodes"),
    ledgerDir: path.join(sessionDir, "ledger"),
    snapshotsDir: path.join(sessionDir, "snapshots"),
  };
}
