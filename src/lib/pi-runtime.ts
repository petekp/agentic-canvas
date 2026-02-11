import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stepCountIs, streamText, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { appendTelemetry } from "@/lib/telemetry";
import {
  buildToolIdempotencyKey,
  getSessionFilesystemLayout,
  mapPiEventToAssistantBridgeEvent,
  piStreamEventSchema,
  toolLoopEventSchema,
  type PiStreamEvent,
  type ToolLoopEvent,
} from "./pi-adapter-contract";
import { getPiFilesystemToolDiagnosticsFromEnv } from "./pi-filesystem-tools";
import { runPiRetentionJobs } from "./pi-retention";

export interface PiRuntimeSessionScope {
  workspaceId: string;
  threadId: string;
  spaceId: string | null;
  sessionId: string;
}

type PiRuntimeEmitContext = {
  session: PiRuntimeSessionScope;
  runId: string;
  sequenceRef: { value: number };
  runtimeRoot: string;
  persistToFilesystem: boolean;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type PiEmitPayload = DistributiveOmit<PiStreamEvent, "runId" | "sequence" | "timestamp">;
type PiRuntimeStreamResult = ReturnType<typeof streamText>;

export interface PiRuntimeEngineContext {
  session: PiRuntimeSessionScope;
  runId: string;
  runtimeRoot: string;
  persistToFilesystem: boolean;
  emitPiEvent: (payload: PiEmitPayload) => void;
  appendToolLoopEvent: (event: ToolLoopEvent) => Promise<void>;
}

export interface PiRuntimeEngineInput {
  options: StreamWithPiRuntimeOptions;
  context: PiRuntimeEngineContext;
}

export interface PiRuntimeEngine {
  id: string;
  stream: (input: PiRuntimeEngineInput) => PiRuntimeStreamResult | Promise<PiRuntimeStreamResult>;
}

type PiRuntimeEngineSource = "external" | "internal";

interface PiRuntimeEngineResolution {
  engine: PiRuntimeEngine;
  source: PiRuntimeEngineSource;
  moduleSpecifier: string | null;
  exportName: string | null;
  loadError: string | null;
}

export interface PiRuntimeDiagnostics {
  runtimeRoot: string;
  persistToFilesystem: boolean;
  filesystem: ReturnType<typeof getPiFilesystemToolDiagnosticsFromEnv>;
  engine: {
    id: string | null;
    source: PiRuntimeEngineSource | "unresolved";
    configuredModule: string | null;
    configuredExport: string | null;
    loadedModule: string | null;
    loadedExport: string | null;
    loadError: string | null;
  };
}

const DEFAULT_RETENTION_INTERVAL_MS = 60 * 60 * 1000;
let lastRetentionRunAtMs = 0;
let retentionRunInFlight: Promise<void> | null = null;
let resolvedRuntimeEnginePromise: Promise<PiRuntimeEngineResolution> | null = null;
let resolvedRuntimeEngine: PiRuntimeEngineResolution | null = null;

function createPiRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeToolCallArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function extractToolResultValue(part: Record<string, unknown>): unknown {
  if ("output" in part) {
    const output = part.output;
    if (
      output &&
      typeof output === "object" &&
      !Array.isArray(output) &&
      "value" in output
    ) {
      return (output as { value: unknown }).value;
    }
    return output;
  }

  if ("result" in part) {
    const result = part.result;
    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      "value" in result
    ) {
      return (result as { value: unknown }).value;
    }
    return result;
  }

  return null;
}

export function extractToolResultCandidatesFromMessages(messages: ModelMessage[]): Array<{
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}> {
  const candidates: Array<{
    toolCallId: string;
    toolName: string;
    result: unknown;
    isError: boolean;
  }> = [];

  for (const message of messages) {
    const m = message as unknown as Record<string, unknown>;
    const content = m.content;
    if (!Array.isArray(content)) continue;

    for (const rawPart of content) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Record<string, unknown>;
      const type = part.type;
      if (type !== "tool-result" && type !== "tool-error") continue;
      if (typeof part.toolCallId !== "string" || part.toolCallId.length === 0) continue;
      if (typeof part.toolName !== "string" || part.toolName.length === 0) continue;
      candidates.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        result: extractToolResultValue(part),
        isError: type === "tool-error",
      });
    }
  }

  return candidates;
}

export async function appendPiEventToFilesystem(
  runtimeRoot: string,
  sessionId: string,
  event: PiStreamEvent
): Promise<void> {
  const layout = getSessionFilesystemLayout(runtimeRoot, sessionId);
  const date = new Date(event.timestamp).toISOString().slice(0, 10);
  const filePath = path.join(layout.episodesDir, `${date}.jsonl`);
  await fs.mkdir(layout.episodesDir, { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function appendToolLoopEventToFilesystem(
  runtimeRoot: string,
  sessionId: string,
  event: ToolLoopEvent,
  timestampMs: number = Date.now()
): Promise<void> {
  const layout = getSessionFilesystemLayout(runtimeRoot, sessionId);
  const date = new Date(timestampMs).toISOString().slice(0, 10);
  const filePath = path.join(layout.ledgerDir, `${date}.jsonl`);
  await fs.mkdir(layout.ledgerDir, { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readToolLoopEventsFromFilesystem(
  runtimeRoot: string,
  sessionId: string
): Promise<ToolLoopEvent[]> {
  const layout = getSessionFilesystemLayout(runtimeRoot, sessionId);
  let files: string[] = [];
  try {
    files = (await fs.readdir(layout.ledgerDir))
      .filter((name) => name.endsWith(".jsonl"))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }

  const events: ToolLoopEvent[] = [];
  for (const fileName of files) {
    const filePath = path.join(layout.ledgerDir, fileName);
    const content = await fs.readFile(filePath, "utf8");
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const event = toolLoopEventSchema.safeParse(parsed);
      if (event.success) {
        events.push(event.data);
      }
    }
  }
  return events;
}

export async function ingestHistoricalToolResultsFromMessages(input: {
  runtimeRoot: string;
  sessionId: string;
  messages: ModelMessage[];
}): Promise<{ appended: number; duplicates: number; missingCalls: number }> {
  const candidates = extractToolResultCandidatesFromMessages(input.messages);
  if (candidates.length === 0) {
    return { appended: 0, duplicates: 0, missingCalls: 0 };
  }

  const existingEvents = await readToolLoopEventsFromFilesystem(input.runtimeRoot, input.sessionId);
  const callByToolCallId = new Map<
    string,
    { runId: string; toolName: string; idempotencyKey: string }
  >();
  const seenResultsByIdempotencyKey = new Set<string>();

  for (const event of existingEvents) {
    if (event.kind === "call") {
      callByToolCallId.set(event.toolCallId, {
        runId: event.runId,
        toolName: event.toolName,
        idempotencyKey: event.idempotencyKey,
      });
    } else {
      seenResultsByIdempotencyKey.add(event.idempotencyKey);
    }
  }

  let appended = 0;
  let duplicates = 0;
  let missingCalls = 0;

  for (const candidate of candidates) {
    const call = callByToolCallId.get(candidate.toolCallId);
    if (!call) {
      missingCalls += 1;
      continue;
    }
    if (seenResultsByIdempotencyKey.has(call.idempotencyKey)) {
      duplicates += 1;
      continue;
    }

    const resultEvent = toolLoopEventSchema.parse({
      kind: "result",
      runId: call.runId,
      toolCallId: candidate.toolCallId,
      toolName: call.toolName,
      result: candidate.result,
      isError: candidate.isError,
      idempotencyKey: call.idempotencyKey,
    });

    await appendToolLoopEventToFilesystem(input.runtimeRoot, input.sessionId, resultEvent);
    seenResultsByIdempotencyKey.add(call.idempotencyKey);
    appended += 1;
  }

  return { appended, duplicates, missingCalls };
}

function emitPiEvent(context: PiRuntimeEmitContext, payload: PiEmitPayload): void {
  const sequence = context.sequenceRef.value;
  context.sequenceRef.value += 1;
  const event = piStreamEventSchema.parse({
    ...payload,
    runId: context.runId,
    sequence,
    timestamp: Date.now(),
  });

  const bridgeEvent = mapPiEventToAssistantBridgeEvent(event, {
    sessionId: context.session.sessionId,
  });

  void appendTelemetry({
    level: "info",
    source: "pi.stream",
    event: event.type,
    data: {
      runId: event.runId,
      sequence: event.sequence,
      sessionId: context.session.sessionId,
      toolCallId: "toolCallId" in event ? event.toolCallId : undefined,
      toolName: "toolName" in event ? event.toolName : undefined,
    },
  }).catch(() => undefined);

  void appendTelemetry({
    level: "info",
    source: "pi.bridge",
    event: bridgeEvent.type,
    data: {
      runId: bridgeEvent.runId,
      sessionId: context.session.sessionId,
      toolCallId: "toolCallId" in bridgeEvent ? bridgeEvent.toolCallId : undefined,
      toolName: "toolName" in bridgeEvent ? bridgeEvent.toolName : undefined,
    },
  }).catch(() => undefined);

  if (context.persistToFilesystem) {
    void appendPiEventToFilesystem(context.runtimeRoot, context.session.sessionId, event).catch(
      (error) => {
        void appendTelemetry({
          level: "error",
          source: "pi.stream",
          event: "episode_write_error",
          data: {
            error: error instanceof Error ? error.message : String(error),
            sessionId: context.session.sessionId,
          },
        }).catch(() => undefined);
      }
    );
  }
}

export interface StreamWithPiRuntimeOptions {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  session: PiRuntimeSessionScope;
  stopWhen?: Parameters<typeof streamText>[0]["stopWhen"];
  abortSignal?: AbortSignal;
}

export function resetPiRetentionSchedulerForTests(): void {
  lastRetentionRunAtMs = 0;
  retentionRunInFlight = null;
}

export function resetPiRuntimeEngineResolverForTests(): void {
  resolvedRuntimeEnginePromise = null;
  resolvedRuntimeEngine = null;
}

function resolveRuntimeRoot(): string {
  return process.env.PI_RUNTIME_ROOT ?? path.join(process.cwd(), ".runtime", "pi");
}

function isPiFilesystemPersistenceEnabled(): boolean {
  return process.env.PI_EPISODE_LOG_DISABLED !== "1";
}

export async function maybeRunPiRetentionJobs(input: {
  runtimeRoot: string;
  nowMs?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const nowMs = input.nowMs ?? Date.now();
  const intervalFromEnv = Number(process.env.PI_RETENTION_INTERVAL_MS ?? "");
  const intervalMs =
    input.intervalMs ??
    (Number.isFinite(intervalFromEnv) && intervalFromEnv >= 0
      ? intervalFromEnv
      : DEFAULT_RETENTION_INTERVAL_MS);

  if (retentionRunInFlight) return false;
  if (nowMs - lastRetentionRunAtMs < intervalMs) return false;

  lastRetentionRunAtMs = nowMs;
  retentionRunInFlight = runPiRetentionJobs({
    runtimeRoot: input.runtimeRoot,
    nowMs,
  })
    .then((result) => {
      void appendTelemetry({
        level: "info",
        source: "pi.runtime",
        event: "retention_run",
        data: result,
      }).catch(() => undefined);
    })
    .catch((error) => {
      void appendTelemetry({
        level: "error",
        source: "pi.runtime",
        event: "retention_run_error",
        data: { error: error instanceof Error ? error.message : String(error) },
      }).catch(() => undefined);
    })
    .finally(() => {
      retentionRunInFlight = null;
    });

  await retentionRunInFlight;
  return true;
}

function resolveModelName(model: LanguageModel): string | undefined {
  if (
    typeof model === "object" &&
    model !== null &&
    "modelId" in model &&
    typeof model.modelId === "string"
  ) {
    return model.modelId;
  }
  return undefined;
}

function coerceRuntimeEngineCandidate(
  candidate: unknown,
  candidateName: string
): PiRuntimeEngine | null {
  if (candidate && typeof candidate === "object" && "stream" in candidate) {
    const stream =
      (candidate as { stream?: PiRuntimeEngine["stream"] }).stream;
    if (typeof stream === "function") {
      const candidateWithOptionalId = candidate as { id?: unknown };
      const id =
        typeof candidateWithOptionalId.id === "string"
          ? candidateWithOptionalId.id
          : `external:${candidateName}`;
      return { id, stream };
    }
  }

  if (typeof candidate === "function") {
    return {
      id: `external:${candidateName}`,
      stream: candidate as PiRuntimeEngine["stream"],
    };
  }

  return null;
}

function normalizeRuntimeEngineModuleSpecifier(specifier: string): string {
  const trimmed = specifier.trim();
  if (trimmed.startsWith("file://")) return trimmed;
  if (trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return pathToFileURL(trimmed).href;
  }
  if (trimmed.startsWith(".")) {
    return pathToFileURL(path.resolve(trimmed)).href;
  }
  return trimmed;
}

function collectRuntimeEngineCandidates(
  candidates: Array<{ name: string; value: unknown }>,
  name: string,
  value: unknown
): void {
  candidates.push({ name, value });
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  const container = value as Record<string, unknown>;
  for (const nestedExport of [
    "piRuntimeEngine",
    "default",
    "streamWithPiRuntimeEngine",
    "stream",
  ]) {
    if (nestedExport in container) {
      candidates.push({
        name: `${name}.${nestedExport}`,
        value: container[nestedExport],
      });
    }
  }
}

async function importRuntimeEngineModule(specifier: string): Promise<Record<string, unknown>> {
  const normalizedSpecifier = normalizeRuntimeEngineModuleSpecifier(specifier);
  const imported = await import(
    /* webpackIgnore: true */ normalizedSpecifier
  );
  return (imported ?? {}) as Record<string, unknown>;
}

interface ExternalRuntimeEngineMatch {
  engine: PiRuntimeEngine;
  exportName: string;
}

async function loadRuntimeEngineFromExternalModule(input: {
  moduleSpecifier: string;
  configuredExport: string | null;
}): Promise<{ match: ExternalRuntimeEngineMatch | null; loadError: string | null }> {
  const moduleSpecifier = input.moduleSpecifier;
  const configuredExport = input.configuredExport;
  try {
    const mod = await importRuntimeEngineModule(moduleSpecifier);

    const candidates: Array<{ name: string; value: unknown }> = [];
    if (configuredExport && configuredExport in mod) {
      collectRuntimeEngineCandidates(candidates, configuredExport, mod[configuredExport]);
    }
    collectRuntimeEngineCandidates(candidates, "piRuntimeEngine", mod.piRuntimeEngine);
    collectRuntimeEngineCandidates(candidates, "default", mod.default);
    collectRuntimeEngineCandidates(
      candidates,
      "streamWithPiRuntimeEngine",
      mod.streamWithPiRuntimeEngine
    );
    collectRuntimeEngineCandidates(candidates, "stream", mod.stream);

    for (const candidate of candidates) {
      const engine = coerceRuntimeEngineCandidate(candidate.value, candidate.name);
      if (engine) {
        void appendTelemetry({
          level: "info",
          source: "pi.runtime",
          event: "engine_loaded",
          data: {
            engineId: engine.id,
            moduleSpecifier,
            exportName: candidate.name,
          },
        }).catch(() => undefined);
        return {
          match: { engine, exportName: candidate.name },
          loadError: null,
        };
      }
    }

    const loadError = "No compatible runtime engine export found";

    void appendTelemetry({
      level: "error",
      source: "pi.runtime",
      event: "engine_load_error",
      data: {
        moduleSpecifier,
        error: loadError,
      },
    }).catch(() => undefined);
    return { match: null, loadError };
  } catch (error) {
    const loadError = error instanceof Error ? error.message : String(error);
    void appendTelemetry({
      level: "error",
      source: "pi.runtime",
      event: "engine_load_error",
      data: {
        moduleSpecifier,
        error: loadError,
      },
    }).catch(() => undefined);
    return { match: null, loadError };
  }
}

const aiSdkFallbackRuntimeEngine: PiRuntimeEngine = {
  id: "internal.ai-sdk",
  stream(input) {
    const { options, context } = input;
    context.emitPiEvent({
      type: "response.created",
      model: resolveModelName(options.model),
    });

    return streamText({
      model: options.model,
      system: options.system,
      messages: options.messages,
      tools: options.tools,
      stopWhen: options.stopWhen ?? stepCountIs(3),
      abortSignal: options.abortSignal,
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta") {
          context.emitPiEvent({
            type: "response.output_text.delta",
            delta: chunk.text,
          });
          return;
        }

        if (chunk.type === "tool-call") {
          context.emitPiEvent({
            type: "response.tool_call",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: normalizeToolCallArgs(chunk.input),
          });

          if (context.persistToFilesystem) {
            const callEvent = toolLoopEventSchema.parse({
              kind: "call",
              runId: context.runId,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: normalizeToolCallArgs(chunk.input),
              idempotencyKey: buildToolIdempotencyKey(
                context.session.sessionId,
                chunk.toolCallId
              ),
            });
            void context.appendToolLoopEvent(callEvent).catch((error) => {
              void appendTelemetry({
                level: "error",
                source: "pi.runtime",
                event: "ledger_write_error",
                data: {
                  kind: "call",
                  sessionId: context.session.sessionId,
                  toolCallId: chunk.toolCallId,
                  error: error instanceof Error ? error.message : String(error),
                },
              }).catch(() => undefined);
            });
          }
          return;
        }

        if (chunk.type === "tool-result" && context.persistToFilesystem) {
          const resultEvent = toolLoopEventSchema.parse({
            kind: "result",
            runId: context.runId,
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            result: chunk.output,
            isError: false,
            idempotencyKey: buildToolIdempotencyKey(
              context.session.sessionId,
              chunk.toolCallId
            ),
          });
          void context.appendToolLoopEvent(resultEvent).catch((error) => {
            void appendTelemetry({
              level: "error",
              source: "pi.runtime",
              event: "ledger_write_error",
              data: {
                kind: "result",
                sessionId: context.session.sessionId,
                toolCallId: chunk.toolCallId,
                error: error instanceof Error ? error.message : String(error),
              },
            }).catch(() => undefined);
          });
        }
      },
      onAbort: ({ steps }) => {
        context.emitPiEvent({
          type: "response.cancelled",
          reason: `aborted_after_${steps.length}_steps`,
        });
      },
      onError: ({ error }) => {
        context.emitPiEvent({
          type: "response.error",
          error: error instanceof Error ? error.message : String(error),
          retryable: false,
        });
      },
      onFinish: () => {
        context.emitPiEvent({ type: "response.output_text.done" });
        context.emitPiEvent({ type: "response.completed" });
      },
    });
  },
};

async function resolvePiRuntimeEngine(): Promise<PiRuntimeEngineResolution> {
  if (!resolvedRuntimeEnginePromise) {
    resolvedRuntimeEnginePromise = (async () => {
      const configuredModule = process.env.PI_RUNTIME_ENGINE_MODULE?.trim() ?? null;
      const configuredExport = process.env.PI_RUNTIME_ENGINE_EXPORT?.trim() ?? null;

      if (configuredModule) {
        const externalEngine = await loadRuntimeEngineFromExternalModule({
          moduleSpecifier: configuredModule,
          configuredExport,
        });

        if (externalEngine.match) {
          return {
            engine: externalEngine.match.engine,
            source: "external",
            moduleSpecifier: configuredModule,
            exportName: externalEngine.match.exportName,
            loadError: null,
          } satisfies PiRuntimeEngineResolution;
        }

        return {
          engine: aiSdkFallbackRuntimeEngine,
          source: "internal",
          moduleSpecifier: configuredModule,
          exportName: null,
          loadError: externalEngine.loadError,
        } satisfies PiRuntimeEngineResolution;
      }

      return {
        engine: aiSdkFallbackRuntimeEngine,
        source: "internal",
        moduleSpecifier: null,
        exportName: null,
        loadError: null,
      } satisfies PiRuntimeEngineResolution;
    })();
  }

  resolvedRuntimeEngine = await resolvedRuntimeEnginePromise;
  return resolvedRuntimeEngine;
}

export async function getPiRuntimeDiagnostics(input?: {
  resolveEngine?: boolean;
}): Promise<PiRuntimeDiagnostics> {
  if (input?.resolveEngine !== false) {
    await resolvePiRuntimeEngine();
  }

  const configuredModule = process.env.PI_RUNTIME_ENGINE_MODULE?.trim() ?? null;
  const configuredExport = process.env.PI_RUNTIME_ENGINE_EXPORT?.trim() ?? null;
  const resolution = resolvedRuntimeEngine;

  return {
    runtimeRoot: resolveRuntimeRoot(),
    persistToFilesystem: isPiFilesystemPersistenceEnabled(),
    filesystem: getPiFilesystemToolDiagnosticsFromEnv(),
    engine: {
      id: resolution?.engine.id ?? null,
      source: resolution?.source ?? "unresolved",
      configuredModule,
      configuredExport,
      loadedModule: resolution?.moduleSpecifier ?? null,
      loadedExport: resolution?.exportName ?? null,
      loadError: resolution?.loadError ?? null,
    },
  };
}

export async function streamWithPiRuntime(
  options: StreamWithPiRuntimeOptions
): Promise<PiRuntimeStreamResult> {
  const runId = createPiRunId();
  const sequenceRef = { value: 0 };
  const runtimeRoot = resolveRuntimeRoot();
  const persistToFilesystem = isPiFilesystemPersistenceEnabled();

  const emitContext: PiRuntimeEmitContext = {
    session: options.session,
    runId,
    sequenceRef,
    runtimeRoot,
    persistToFilesystem,
  };

  if (persistToFilesystem) {
    void maybeRunPiRetentionJobs({
      runtimeRoot,
    }).catch(() => undefined);

    void ingestHistoricalToolResultsFromMessages({
      runtimeRoot,
      sessionId: options.session.sessionId,
      messages: options.messages,
    })
      .then((stats) => {
        void appendTelemetry({
          level: "info",
          source: "pi.runtime",
          event: "history_tool_results_ingested",
          data: {
            sessionId: options.session.sessionId,
            appended: stats.appended,
            duplicates: stats.duplicates,
            missingCalls: stats.missingCalls,
          },
        }).catch(() => undefined);
      })
      .catch((error) => {
        void appendTelemetry({
          level: "error",
          source: "pi.runtime",
          event: "history_tool_results_ingest_error",
          data: {
            sessionId: options.session.sessionId,
            error: error instanceof Error ? error.message : String(error),
          },
        }).catch(() => undefined);
      });
  }

  const runtimeContext: PiRuntimeEngineContext = {
    session: options.session,
    runId,
    runtimeRoot,
    persistToFilesystem,
    emitPiEvent: (payload) => {
      emitPiEvent(emitContext, payload);
    },
    appendToolLoopEvent: (event) =>
      appendToolLoopEventToFilesystem(runtimeRoot, options.session.sessionId, event),
  };

  const runtimeEngine = await resolvePiRuntimeEngine();
  return runtimeEngine.engine.stream({
    options,
    context: runtimeContext,
  });
}
