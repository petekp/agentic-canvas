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

describe("pi filesystem tools (mutation)", () => {
  it("writes files and supports append mode", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-mutation-write-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root, maxWriteBytes: 1024 });
    const writeFile = getToolExecutor(toolSet, "write_file");

    const created = await writeFile({ path: "work/todo.txt", content: "first line\n" });
    expect(created).toMatchObject({ success: true, path: "work/todo.txt" });

    const appended = await writeFile({
      path: "work/todo.txt",
      content: "second line\n",
      mode: "append",
    });
    expect(appended).toMatchObject({ success: true, path: "work/todo.txt", mode: "append" });

    const content = await fs.readFile(path.join(root, "work", "todo.txt"), "utf8");
    expect(content).toBe("first line\nsecond line\n");
  });

  it("rejects writes that exceed maxWriteBytes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-mutation-write-limit-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root, maxWriteBytes: 8 });
    const writeFile = getToolExecutor(toolSet, "write_file");

    const result = await writeFile({ path: "big.txt", content: "too-long-content" });

    expect(result).toMatchObject({
      success: false,
      code: "size_limit_exceeded",
    });
  });

  it("edits file content with bounded operation count", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-mutation-edit-"));
    await fs.writeFile(path.join(root, "notes.txt"), "one\ntwo\nthree\n", "utf8");

    const toolSet = createPiFilesystemToolSet({
      allowedRoot: root,
      maxReadBytes: 1024,
      maxWriteBytes: 1024,
      maxEditOperations: 2,
    });
    const editFile = getToolExecutor(toolSet, "edit_file");

    const edited = await editFile({
      path: "notes.txt",
      edits: [
        { oldText: "one", newText: "uno" },
        { oldText: "three", newText: "tres" },
      ],
    });
    expect(edited).toMatchObject({
      success: true,
      path: "notes.txt",
      appliedEdits: 2,
    });

    const content = await fs.readFile(path.join(root, "notes.txt"), "utf8");
    expect(content).toBe("uno\ntwo\ntres\n");

    const tooManyEdits = await editFile({
      path: "notes.txt",
      edits: [
        { oldText: "uno", newText: "one" },
        { oldText: "two", newText: "dos" },
        { oldText: "tres", newText: "three" },
      ],
    });
    expect(tooManyEdits).toMatchObject({
      success: false,
      code: "operation_limit_exceeded",
    });
  });

  it("requires explicit confirmation for delete_file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-mutation-delete-"));
    await fs.writeFile(path.join(root, "delete-me.txt"), "bye", "utf8");
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root, allowDelete: true });
    const deleteFile = getToolExecutor(toolSet, "delete_file");

    const rejected = await deleteFile({ path: "delete-me.txt" });
    expect(rejected).toMatchObject({
      success: false,
      code: "destructive_confirmation_required",
    });

    const confirmed = await deleteFile({ path: "delete-me.txt", confirm: true });
    expect(confirmed).toMatchObject({ success: true, path: "delete-me.txt" });

    await expect(fs.access(path.join(root, "delete-me.txt"))).rejects.toThrow();
  });
});
