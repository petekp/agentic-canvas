import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPiFilesystemToolSet } from "./pi-filesystem-tools";

type ToolExecute = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

function getToolExecutor(toolSet: Record<string, unknown>, toolName: string): ToolExecute {
  const tool = toolSet[toolName] as { execute?: ToolExecute } | undefined;
  if (!tool || typeof tool.execute !== "function") {
    throw new Error(`Tool ${toolName} is not executable`);
  }
  return tool.execute;
}

describe("pi filesystem tools (read-only)", () => {
  it("lists directories and files under the allowed root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-readonly-list-"));
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "README.md"), "# hello", "utf8");

    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });
    const listDir = getToolExecutor(toolSet, "list_dir");
    const result = await listDir({ path: "." });

    expect(result).toMatchObject({
      success: true,
      path: ".",
      truncated: false,
    });
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "README.md", type: "file" }),
        expect.objectContaining({ name: "src", type: "directory" }),
      ])
    );
  });

  it("reads file content within size limits", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-readonly-read-"));
    await fs.writeFile(path.join(root, "notes.txt"), "line one\nline two", "utf8");

    const toolSet = createPiFilesystemToolSet({ allowedRoot: root, maxReadBytes: 4096 });
    const readFile = getToolExecutor(toolSet, "read_file");
    const result = await readFile({ path: "notes.txt" });

    expect(result).toMatchObject({
      success: true,
      path: "notes.txt",
      content: "line one\nline two",
    });
    expect((result.bytesRead as number) > 0).toBe(true);
  });

  it("rejects reads that exceed maxReadBytes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-readonly-limit-"));
    await fs.writeFile(path.join(root, "large.txt"), "a".repeat(64), "utf8");

    const toolSet = createPiFilesystemToolSet({ allowedRoot: root, maxReadBytes: 32 });
    const readFile = getToolExecutor(toolSet, "read_file");
    const result = await readFile({ path: "large.txt" });

    expect(result).toMatchObject({
      success: false,
      code: "size_limit_exceeded",
    });
  });
});
