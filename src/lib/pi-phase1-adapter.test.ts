import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendPiEventToFilesystem,
  resolveChatSessionScope,
  toFrontendToolSet,
} from "./pi-phase1-adapter";

describe("pi phase-1 adapter", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves session scope from request ids", () => {
    const scope = resolveChatSessionScope({
      workspaceId: "ws_123",
      threadId: "thread_123",
      activeSpaceId: "space_123",
    });

    expect(scope.workspaceId).toBe("ws_123");
    expect(scope.threadId).toBe("thread_123");
    expect(scope.spaceId).toBe("space_123");
    expect(scope.sessionId).toBe("ws_123:space_123:thread_123");
  });

  it("falls back when scope ids are missing", () => {
    const scope = resolveChatSessionScope({});
    expect(scope.workspaceId).toBe("workspace_default");
    expect(scope.threadId).toBe("thread_default");
    expect(scope.spaceId).toBeNull();
    expect(scope.sessionId).toBe("workspace_default:none:thread_default");
  });

  it("writes pi events into session episode jsonl files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-phase1-"));
    const sessionId = "ws_1:space_1:thread_1";
    const event = {
      type: "response.created" as const,
      runId: "run_1",
      sequence: 0,
      timestamp: Date.UTC(2026, 1, 11, 12, 0, 0),
      model: "gpt-4o",
    };

    await appendPiEventToFilesystem(root, sessionId, event);

    const encodedSessionId = encodeURIComponent(sessionId);
    const filePath = path.join(root, "sessions", encodedSessionId, "episodes", "2026-02-11.jsonl");
    const content = await fs.readFile(filePath, "utf8");

    expect(content).toContain("\"type\":\"response.created\"");
    expect(content).toContain("\"runId\":\"run_1\"");
  });

  it("exposes filesystem tools by default for local prototype runtime", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-phase1-tools-default-"));
    vi.stubEnv("PI_FS_ALLOWED_ROOT", root);

    const toolSet = toFrontendToolSet(undefined);
    expect(toolSet).toBeDefined();
    expect(toolSet).toHaveProperty("list_dir");
    expect(toolSet).toHaveProperty("read_file");
    expect(toolSet).toHaveProperty("write_file");
    expect(toolSet).toHaveProperty("edit_file");
    expect(toolSet).not.toHaveProperty("delete_file");
  });

  it("supports disabling filesystem tool exposure via env", () => {
    vi.stubEnv("PI_FILESYSTEM_TOOLS_ENABLED", "0");

    const toolSet = toFrontendToolSet(undefined);
    expect(toolSet).toBeUndefined();
  });
});
