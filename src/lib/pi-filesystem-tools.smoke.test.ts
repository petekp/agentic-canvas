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

describe("pi filesystem tools smoke", () => {
  it("supports list/read/write/edit with traversal protection", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-smoke-"));
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "hello.txt"), "hello\n", "utf8");

    const toolSet = createPiFilesystemToolSet({
      allowedRoot: root,
      maxReadBytes: 4096,
      maxWriteBytes: 4096,
      maxListEntries: 100,
      maxEditOperations: 10,
    });

    const listDir = getToolExecutor(toolSet, "list_dir");
    const readFile = getToolExecutor(toolSet, "read_file");
    const writeFile = getToolExecutor(toolSet, "write_file");
    const editFile = getToolExecutor(toolSet, "edit_file");

    const listed = await listDir({ path: "src" });
    expect(listed).toMatchObject({
      success: true,
      path: "src",
    });

    const read = await readFile({ path: "src/hello.txt" });
    expect(read).toMatchObject({
      success: true,
      content: "hello\n",
    });

    const write = await writeFile({
      path: "src/hello.txt",
      content: "world\n",
      mode: "append",
    });
    expect(write).toMatchObject({
      success: true,
      path: "src/hello.txt",
      mode: "append",
    });

    const edited = await editFile({
      path: "src/hello.txt",
      edits: [{ oldText: "world", newText: "planet", replaceAll: false }],
    });
    expect(edited).toMatchObject({
      success: true,
      path: "src/hello.txt",
      appliedEdits: 1,
    });

    const traversal = await readFile({ path: "../etc/passwd" });
    expect(traversal).toMatchObject({
      success: false,
      code: "path_outside_root",
    });
  });
});
