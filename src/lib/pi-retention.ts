import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import {
  DEFAULT_SESSION_RETENTION_POLICY,
  buildToolIdempotencyKey,
  piStreamEventSchema,
  type SessionRetentionPolicy,
} from "./pi-adapter-contract";

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;
const EPISODE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

export interface PiRetentionPolicy extends SessionRetentionPolicy {
  snapshotsTtlDays: number;
  memoryTtlDays: number;
}

export const DEFAULT_PI_RETENTION_POLICY: PiRetentionPolicy = {
  ...DEFAULT_SESSION_RETENTION_POLICY,
  snapshotsTtlDays: DEFAULT_SESSION_RETENTION_POLICY.ledgerTtlDays,
  memoryTtlDays: DEFAULT_SESSION_RETENTION_POLICY.episodesTtlDays,
};

export interface PiRetentionResult {
  sessionsScanned: number;
  snapshotsWritten: number;
  episodesCompacted: number;
  episodesDeleted: number;
  ledgerDeleted: number;
  snapshotsDeleted: number;
  memoryDeleted: number;
}

interface CompactionSummary {
  schema: "pi.compaction.v1";
  sessionId: string;
  createdAt: number;
  sourceFiles: string[];
  idempotencyKeys: string[];
  stats: {
    eventCount: number;
    parseErrors: number;
    runCount: number;
    firstTimestamp: number | null;
    lastTimestamp: number | null;
    deltaChars: number;
    terminalEvents: {
      completed: number;
      error: number;
      cancelled: number;
    };
    toolCalls: Record<string, number>;
  };
}

function datePrefixToEpochMs(value: string): number | null {
  const match = value.match(ISO_DATE_PREFIX_RE);
  if (!match) return null;
  const ts = Date.parse(`${match[1]}T00:00:00.000Z`);
  return Number.isNaN(ts) ? null : ts;
}

function episodeDateToEpochMs(fileName: string): number | null {
  const match = fileName.match(EPISODE_FILE_RE);
  if (!match) return null;
  const ts = Date.parse(`${match[1]}T00:00:00.000Z`);
  return Number.isNaN(ts) ? null : ts;
}

function ageInDays(fileEpochMs: number, nowMs: number): number {
  return Math.floor((nowMs - fileEpochMs) / DAY_MS);
}

function toSessionLayout(runtimeRoot: string, encodedSessionDirName: string) {
  const sessionDir = path.join(runtimeRoot, "sessions", encodedSessionDirName);
  return {
    sessionDir,
    memoryDir: path.join(sessionDir, "memory"),
    episodesDir: path.join(sessionDir, "episodes"),
    ledgerDir: path.join(sessionDir, "ledger"),
    snapshotsDir: path.join(sessionDir, "snapshots"),
  };
}

function decodeSessionId(encodedSessionDirName: string): string {
  try {
    return decodeURIComponent(encodedSessionDirName);
  } catch {
    return encodedSessionDirName;
  }
}

async function listDirEntriesSafe(dir: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
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
}

async function deleteByDatePrefix(input: {
  dir: string;
  nowMs: number;
  ttlDays: number;
}): Promise<number> {
  const entries = await listDirEntriesSafe(input.dir);
  let deleted = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileEpochMs = datePrefixToEpochMs(entry.name);
    if (fileEpochMs === null) continue;
    if (ageInDays(fileEpochMs, input.nowMs) < input.ttlDays) continue;
    await fs.rm(path.join(input.dir, entry.name), { force: true });
    deleted += 1;
  }

  return deleted;
}

async function compactEpisodes(input: {
  sessionId: string;
  episodesDir: string;
  snapshotsDir: string;
  nowMs: number;
  compactAfterDays: number;
}): Promise<{ snapshotsWritten: number; episodesCompacted: number }> {
  const entries = await listDirEntriesSafe(input.episodesDir);
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fileEpochMs = episodeDateToEpochMs(entry.name);
      if (fileEpochMs === null) return null;
      return {
        name: entry.name,
        epochMs: fileEpochMs,
        ageDays: ageInDays(fileEpochMs, input.nowMs),
      };
    })
    .filter((entry): entry is { name: string; epochMs: number; ageDays: number } => Boolean(entry))
    .filter((entry) => entry.ageDays >= input.compactAfterDays)
    .sort((a, b) => a.epochMs - b.epochMs);

  if (candidates.length === 0) {
    return { snapshotsWritten: 0, episodesCompacted: 0 };
  }

  const idempotencyKeys = new Set<string>();
  const runIds = new Set<string>();
  const toolCalls: Record<string, number> = {};
  let eventCount = 0;
  let parseErrors = 0;
  let deltaChars = 0;
  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;
  let completed = 0;
  let errored = 0;
  let cancelled = 0;

  for (const candidate of candidates) {
    const content = await fs.readFile(path.join(input.episodesDir, candidate.name), "utf8");
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        parseErrors += 1;
        continue;
      }

      const eventResult = piStreamEventSchema.safeParse(parsed);
      if (!eventResult.success) {
        parseErrors += 1;
        continue;
      }

      const event = eventResult.data;
      eventCount += 1;
      runIds.add(event.runId);

      if (firstTimestamp === null || event.timestamp < firstTimestamp) {
        firstTimestamp = event.timestamp;
      }
      if (lastTimestamp === null || event.timestamp > lastTimestamp) {
        lastTimestamp = event.timestamp;
      }

      if (event.type === "response.output_text.delta") {
        deltaChars += event.delta.length;
      }
      if (event.type === "response.tool_call") {
        toolCalls[event.toolName] = (toolCalls[event.toolName] ?? 0) + 1;
        idempotencyKeys.add(buildToolIdempotencyKey(input.sessionId, event.toolCallId));
      }
      if (event.type === "response.completed") {
        completed += 1;
      }
      if (event.type === "response.error") {
        errored += 1;
      }
      if (event.type === "response.cancelled") {
        cancelled += 1;
      }
    }
  }

  const oldestEpisodeDate = new Date(candidates[0].epochMs).toISOString().slice(0, 10);
  const newestEpisodeDate = new Date(candidates[candidates.length - 1].epochMs).toISOString().slice(0, 10);
  const createdDate = new Date(input.nowMs).toISOString().slice(0, 10);

  const summary: CompactionSummary = {
    schema: "pi.compaction.v1",
    sessionId: input.sessionId,
    createdAt: input.nowMs,
    sourceFiles: candidates.map((candidate) => candidate.name),
    idempotencyKeys: Array.from(idempotencyKeys).sort(),
    stats: {
      eventCount,
      parseErrors,
      runCount: runIds.size,
      firstTimestamp,
      lastTimestamp,
      deltaChars,
      terminalEvents: {
        completed,
        error: errored,
        cancelled,
      },
      toolCalls,
    },
  };

  await fs.mkdir(input.snapshotsDir, { recursive: true });
  const snapshotName = `${createdDate}.compact-${oldestEpisodeDate}-to-${newestEpisodeDate}.json`;
  await fs.writeFile(path.join(input.snapshotsDir, snapshotName), JSON.stringify(summary, null, 2), "utf8");

  return {
    snapshotsWritten: 1,
    episodesCompacted: candidates.length,
  };
}

async function deleteExpiredEpisodes(input: {
  episodesDir: string;
  nowMs: number;
  episodesTtlDays: number;
}): Promise<number> {
  const entries = await listDirEntriesSafe(input.episodesDir);
  let deleted = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileEpochMs = episodeDateToEpochMs(entry.name);
    if (fileEpochMs === null) continue;
    if (ageInDays(fileEpochMs, input.nowMs) < input.episodesTtlDays) continue;
    await fs.rm(path.join(input.episodesDir, entry.name), { force: true });
    deleted += 1;
  }

  return deleted;
}

export async function runPiRetentionJobs(input: {
  runtimeRoot?: string;
  nowMs?: number;
  policy?: Partial<PiRetentionPolicy>;
} = {}): Promise<PiRetentionResult> {
  const runtimeRoot = input.runtimeRoot ?? process.env.PI_RUNTIME_ROOT ?? path.join(process.cwd(), ".runtime", "pi");
  const nowMs = input.nowMs ?? Date.now();
  const policy: PiRetentionPolicy = {
    ...DEFAULT_PI_RETENTION_POLICY,
    ...(input.policy ?? {}),
  };

  const sessionsRoot = path.join(runtimeRoot, "sessions");
  const sessionEntries = await listDirEntriesSafe(sessionsRoot);
  const sessionDirs = sessionEntries.filter((entry) => entry.isDirectory());

  const result: PiRetentionResult = {
    sessionsScanned: sessionDirs.length,
    snapshotsWritten: 0,
    episodesCompacted: 0,
    episodesDeleted: 0,
    ledgerDeleted: 0,
    snapshotsDeleted: 0,
    memoryDeleted: 0,
  };

  for (const sessionDir of sessionDirs) {
    const layout = toSessionLayout(runtimeRoot, sessionDir.name);
    const sessionId = decodeSessionId(sessionDir.name);

    const compaction = await compactEpisodes({
      sessionId,
      episodesDir: layout.episodesDir,
      snapshotsDir: layout.snapshotsDir,
      nowMs,
      compactAfterDays: policy.compactAfterDays,
    });

    result.snapshotsWritten += compaction.snapshotsWritten;
    result.episodesCompacted += compaction.episodesCompacted;
    result.episodesDeleted += await deleteExpiredEpisodes({
      episodesDir: layout.episodesDir,
      nowMs,
      episodesTtlDays: policy.episodesTtlDays,
    });
    result.ledgerDeleted += await deleteByDatePrefix({
      dir: layout.ledgerDir,
      nowMs,
      ttlDays: policy.ledgerTtlDays,
    });
    result.snapshotsDeleted += await deleteByDatePrefix({
      dir: layout.snapshotsDir,
      nowMs,
      ttlDays: policy.snapshotsTtlDays,
    });
    result.memoryDeleted += await deleteByDatePrefix({
      dir: layout.memoryDir,
      nowMs,
      ttlDays: policy.memoryTtlDays,
    });
  }

  return result;
}
