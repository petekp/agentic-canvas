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

describe("pi filesystem tools (contracts + path safety)", () => {
  it("exposes the minimal prototype tool surface by default", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-contract-default-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });

    expect(Object.keys(toolSet).sort()).toEqual([
      "edit_file",
      "list_dir",
      "read_file",
      "write_file",
    ]);
  });

  it("optionally exposes delete_file when enabled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-contract-delete-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root, allowDelete: true });

    expect(Object.keys(toolSet).sort()).toEqual([
      "delete_file",
      "edit_file",
      "list_dir",
      "read_file",
      "write_file",
    ]);
  });

  it("blocks traversal attempts outside the allowed root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-contract-traversal-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });
    const listDir = getToolExecutor(toolSet, "list_dir");

    const result = await listDir({ path: "../" });

    expect(result).toMatchObject({
      success: false,
      code: "path_outside_root",
    });
  });

  it("blocks symlink escapes when reading", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-contract-symlink-read-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-contract-symlink-outside-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "secret", "utf8");
    await fs.symlink(outside, path.join(root, "escape"), "dir");

    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });
    const readFile = getToolExecutor(toolSet, "read_file");

    const result = await readFile({ path: "escape/secret.txt" });

    expect(result).toMatchObject({
      success: false,
      code: "symlink_escape",
    });
  });

  it("blocks symlink escapes when writing through a symlinked parent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-contract-symlink-write-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-contract-symlink-write-outside-"));
    await fs.symlink(outside, path.join(root, "escape"), "dir");

    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });
    const writeFile = getToolExecutor(toolSet, "write_file");

    const result = await writeFile({ path: "escape/new.txt", content: "hello" });

    expect(result).toMatchObject({
      success: false,
      code: "symlink_escape",
    });
  });
});
