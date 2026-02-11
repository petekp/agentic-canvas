import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSessionFilesystemLayout } from "./pi-adapter-contract";
import { runPiRetentionJobs } from "./pi-retention";

const NOW_MS = Date.UTC(2026, 1, 11, 12, 0, 0);

async function writeJsonl(filePath: string, lines: unknown[]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
}

describe("pi retention", () => {
  it("compacts old episodes into snapshots and preserves idempotency keys", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-retention-"));
    const sessionId = "ws_1:space_1:thread_1";
    const layout = getSessionFilesystemLayout(root, sessionId);

    await writeJsonl(path.join(layout.episodesDir, "2026-02-01.jsonl"), [
      {
        type: "response.created",
        runId: "run_1",
        sequence: 0,
        timestamp: Date.UTC(2026, 1, 1, 9, 0, 0),
      },
      {
        type: "response.tool_call",
        runId: "run_1",
        sequence: 1,
        timestamp: Date.UTC(2026, 1, 1, 9, 0, 1),
        toolCallId: "tc_1",
        toolName: "add_component",
        args: { type_id: "github.pr-list" },
      },
      {
        type: "response.completed",
        runId: "run_1",
        sequence: 2,
        timestamp: Date.UTC(2026, 1, 1, 9, 0, 2),
      },
    ]);

    await writeJsonl(path.join(layout.episodesDir, "2026-02-10.jsonl"), [
      {
        type: "response.created",
        runId: "run_2",
        sequence: 0,
        timestamp: Date.UTC(2026, 1, 10, 9, 0, 0),
      },
      {
        type: "response.completed",
        runId: "run_2",
        sequence: 1,
        timestamp: Date.UTC(2026, 1, 10, 9, 0, 1),
      },
    ]);

    const result = await runPiRetentionJobs({ runtimeRoot: root, nowMs: NOW_MS });

    expect(result.sessionsScanned).toBe(1);
    expect(result.snapshotsWritten).toBe(1);
    expect(result.episodesCompacted).toBe(1);
    expect(result.episodesDeleted).toBe(0);

    const snapshotFiles = await fs.readdir(layout.snapshotsDir);
    expect(snapshotFiles).toHaveLength(1);
    const summaryRaw = await fs.readFile(path.join(layout.snapshotsDir, snapshotFiles[0]), "utf8");
    const summary = JSON.parse(summaryRaw) as {
      sourceFiles: string[];
      idempotencyKeys: string[];
    };

    expect(summary.sourceFiles).toEqual(["2026-02-01.jsonl"]);
    expect(summary.idempotencyKeys).toEqual(["ws_1:space_1:thread_1:tc_1"]);
    await expect(fs.stat(path.join(layout.episodesDir, "2026-02-01.jsonl"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(layout.episodesDir, "2026-02-10.jsonl"))).resolves.toBeTruthy();
  });

  it("prunes files past TTL across episodes, ledger, snapshots, and memory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-retention-"));
    const sessionId = "ws_2:none:thread_2";
    const layout = getSessionFilesystemLayout(root, sessionId);

    await writeJsonl(path.join(layout.episodesDir, "2026-01-01.jsonl"), [
      {
        type: "response.created",
        runId: "run_old",
        sequence: 0,
        timestamp: Date.UTC(2026, 0, 1, 9, 0, 0),
      },
      {
        type: "response.completed",
        runId: "run_old",
        sequence: 1,
        timestamp: Date.UTC(2026, 0, 1, 9, 0, 1),
      },
    ]);
    await writeJsonl(path.join(layout.ledgerDir, "2026-01-01.jsonl"), [{ key: "old" }]);

    await fs.mkdir(layout.snapshotsDir, { recursive: true });
    await fs.writeFile(
      path.join(layout.snapshotsDir, "2026-01-01.compact-2025-12-20-to-2025-12-25.json"),
      "{}",
      "utf8"
    );

    await fs.mkdir(layout.memoryDir, { recursive: true });
    await fs.writeFile(path.join(layout.memoryDir, "2026-01-01.profile.json"), "{}", "utf8");

    const result = await runPiRetentionJobs({ runtimeRoot: root, nowMs: NOW_MS });

    expect(result.episodesDeleted).toBe(1);
    expect(result.ledgerDeleted).toBe(1);
    expect(result.snapshotsDeleted).toBe(1);
    expect(result.memoryDeleted).toBe(1);

    await expect(fs.stat(path.join(layout.episodesDir, "2026-01-01.jsonl"))).rejects.toThrow();
    await expect(fs.stat(path.join(layout.ledgerDir, "2026-01-01.jsonl"))).rejects.toThrow();
    await expect(
      fs.stat(path.join(layout.snapshotsDir, "2026-01-01.compact-2025-12-20-to-2025-12-25.json"))
    ).rejects.toThrow();
    await expect(fs.stat(path.join(layout.memoryDir, "2026-01-01.profile.json"))).rejects.toThrow();
  });

  it("returns zeroed metrics when runtime has no sessions yet", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-retention-empty-"));
    const result = await runPiRetentionJobs({ runtimeRoot: root, nowMs: NOW_MS });

    expect(result).toEqual({
      sessionsScanned: 0,
      snapshotsWritten: 0,
      episodesCompacted: 0,
      episodesDeleted: 0,
      ledgerDeleted: 0,
      snapshotsDeleted: 0,
      memoryDeleted: 0,
    });
  });
});
