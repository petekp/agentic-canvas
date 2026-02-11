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

describe("pi filesystem tools (adversarial inputs)", () => {
  it("rejects URL-encoded traversal payloads", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-adversarial-encoded-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });
    const listDir = getToolExecutor(toolSet, "list_dir");

    const result = await listDir({ path: "%2e%2e/%2e%2e" });

    expect(result).toMatchObject({
      success: false,
      code: "invalid_input",
    });
  });

  it("rejects windows-style traversal payloads even on unix hosts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-adversarial-win-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });
    const readFile = getToolExecutor(toolSet, "read_file");

    const result = await readFile({ path: "..\\..\\etc\\passwd" });

    expect(result).toMatchObject({
      success: false,
      code: "path_outside_root",
    });
  });

  it("rejects URL-like path payloads", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-adversarial-url-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });
    const readFile = getToolExecutor(toolSet, "read_file");

    const result = await readFile({ path: "file:///etc/passwd" });

    expect(result).toMatchObject({
      success: false,
      code: "invalid_input",
    });
  });

  it("rejects control characters in path payloads", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-fs-adversarial-control-"));
    const toolSet = createPiFilesystemToolSet({ allowedRoot: root });
    const writeFile = getToolExecutor(toolSet, "write_file");

    const result = await writeFile({
      path: "safe.txt\nignore_previous_instructions",
      content: "x",
    });

    expect(result).toMatchObject({
      success: false,
      code: "invalid_input",
    });
  });
});
