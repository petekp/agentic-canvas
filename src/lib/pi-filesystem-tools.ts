import fs from "node:fs/promises";
import path from "node:path";
import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";

const DEFAULT_MAX_READ_BYTES = 256 * 1024;
const DEFAULT_MAX_WRITE_BYTES = 256 * 1024;
const DEFAULT_MAX_LIST_ENTRIES = 200;
const DEFAULT_MAX_EDIT_OPERATIONS = 20;

const listDirInputSchema = z.object({
  path: z.string().default("."),
});

const readFileInputSchema = z.object({
  path: z.string().min(1),
});

const writeFileInputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  mode: z.enum(["overwrite", "append"]).default("overwrite"),
  createParents: z.boolean().default(true),
});

const editFileInputSchema = z.object({
  path: z.string().min(1),
  edits: z
    .array(
      z.object({
        oldText: z.string().min(1),
        newText: z.string(),
        replaceAll: z.boolean().default(false),
      })
    )
    .min(1),
});

const deleteFileInputSchema = z.object({
  path: z.string().min(1),
  confirm: z.boolean().default(false),
});

export interface PiFilesystemToolConfig {
  allowedRoot: string;
  maxReadBytes: number;
  maxWriteBytes: number;
  maxListEntries: number;
  maxEditOperations: number;
  allowDelete: boolean;
}

type PiFilesystemToolErrorCode =
  | "invalid_input"
  | "path_outside_root"
  | "symlink_escape"
  | "not_found"
  | "not_a_directory"
  | "not_a_file"
  | "size_limit_exceeded"
  | "operation_limit_exceeded"
  | "delete_disabled"
  | "destructive_confirmation_required"
  | "edit_target_missing";

class PiFilesystemToolError extends Error {
  readonly code: PiFilesystemToolErrorCode;

  constructor(code: PiFilesystemToolErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PiFilesystemToolError";
  }
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseIntegerEnv(value: string | undefined, defaultValue: number): number {
  if (value == null) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.floor(parsed);
}

function normalizeConfig(input: Partial<PiFilesystemToolConfig>): PiFilesystemToolConfig {
  const allowedRoot = path.resolve(input.allowedRoot ?? process.cwd());
  return {
    allowedRoot,
    maxReadBytes: input.maxReadBytes ?? DEFAULT_MAX_READ_BYTES,
    maxWriteBytes: input.maxWriteBytes ?? DEFAULT_MAX_WRITE_BYTES,
    maxListEntries: input.maxListEntries ?? DEFAULT_MAX_LIST_ENTRIES,
    maxEditOperations: input.maxEditOperations ?? DEFAULT_MAX_EDIT_OPERATIONS,
    allowDelete: input.allowDelete ?? false,
  };
}

function toFailure(error: unknown): { success: false; code: string; error: string } {
  if (error instanceof PiFilesystemToolError) {
    return {
      success: false,
      code: error.code,
      error: error.message,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      success: false,
      code: "invalid_input",
      error: error.issues.map((issue) => issue.message).join("; "),
    };
  }

  return {
    success: false,
    code: "unknown_error",
    error: error instanceof Error ? error.message : String(error),
  };
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const rel = path.relative(rootPath, candidatePath);
  if (rel === "") return true;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function toRelativePath(rootPath: string, candidatePath: string): string {
  const rel = path.relative(rootPath, candidatePath);
  return rel === "" ? "." : rel.split(path.sep).join("/");
}

async function safeLstat(targetPath: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | null> {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

function assertLexicalPathInsideRoot(rootPath: string, candidatePath: string): void {
  if (!isWithinRoot(rootPath, candidatePath)) {
    throw new PiFilesystemToolError(
      "path_outside_root",
      "Path is outside the configured allowed root."
    );
  }
}

async function resolveRealPathOrThrow(targetPath: string): Promise<string> {
  try {
    return await fs.realpath(targetPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      throw new PiFilesystemToolError("not_found", "Target path was not found.");
    }
    throw error;
  }
}

async function ensureRootRealPath(rootPath: string): Promise<string> {
  await fs.mkdir(rootPath, { recursive: true });
  return fs.realpath(rootPath);
}

function createPathResolver(config: PiFilesystemToolConfig): {
  resolveExistingPath: (inputPath: string) => Promise<{ absolutePath: string; relativePath: string }>;
  resolveWritablePath: (
    inputPath: string,
    options?: { createParents?: boolean }
  ) => Promise<{ absolutePath: string; relativePath: string }>;
} {
  let rootRealPathPromise: Promise<string> | null = null;

  const getRootRealPath = () => {
    if (!rootRealPathPromise) {
      rootRealPathPromise = ensureRootRealPath(config.allowedRoot);
    }
    return rootRealPathPromise;
  };

  const resolveCandidatePath = (inputPath: string): string => {
    const trimmed = inputPath.trim();
    if (trimmed.length === 0) {
      throw new PiFilesystemToolError("invalid_input", "Path must be a non-empty string.");
    }
    const candidate = path.isAbsolute(trimmed)
      ? path.resolve(trimmed)
      : path.resolve(config.allowedRoot, trimmed);
    assertLexicalPathInsideRoot(config.allowedRoot, candidate);
    return candidate;
  };

  const resolveExistingPath = async (inputPath: string) => {
    const rootRealPath = await getRootRealPath();
    const absolutePath = resolveCandidatePath(inputPath);
    const realPath = await resolveRealPathOrThrow(absolutePath);
    if (!isWithinRoot(rootRealPath, realPath)) {
      throw new PiFilesystemToolError(
        "symlink_escape",
        "Resolved path escapes the configured allowed root."
      );
    }
    return {
      absolutePath,
      relativePath: toRelativePath(config.allowedRoot, absolutePath),
    };
  };

  const resolveWritablePath = async (
    inputPath: string,
    options?: { createParents?: boolean }
  ) => {
    const rootRealPath = await getRootRealPath();
    const absolutePath = resolveCandidatePath(inputPath);
    const parentPath = path.dirname(absolutePath);

    if (options?.createParents !== false) {
      await fs.mkdir(parentPath, { recursive: true });
    }

    const parentRealPath = await resolveRealPathOrThrow(parentPath);
    if (!isWithinRoot(rootRealPath, parentRealPath)) {
      throw new PiFilesystemToolError(
        "symlink_escape",
        "Resolved parent directory escapes the configured allowed root."
      );
    }

    const existing = await safeLstat(absolutePath);
    if (existing?.isSymbolicLink()) {
      const realTarget = await resolveRealPathOrThrow(absolutePath);
      if (!isWithinRoot(rootRealPath, realTarget)) {
        throw new PiFilesystemToolError(
          "symlink_escape",
          "Resolved file target escapes the configured allowed root."
        );
      }
    }

    return {
      absolutePath,
      relativePath: toRelativePath(config.allowedRoot, absolutePath),
    };
  };

  return { resolveExistingPath, resolveWritablePath };
}

function assertMaxBytes(byteLength: number, limit: number, reason: string): void {
  if (byteLength > limit) {
    throw new PiFilesystemToolError(
      "size_limit_exceeded",
      `${reason} exceeds configured size limit (${limit} bytes).`
    );
  }
}

function assertMaxOperations(count: number, limit: number): void {
  if (count > limit) {
    throw new PiFilesystemToolError(
      "operation_limit_exceeded",
      `Operation count exceeds configured limit (${limit}).`
    );
  }
}

function countOccurrences(input: string, needle: string): number {
  if (needle.length === 0) return 0;
  return input.split(needle).length - 1;
}

function applyTextEdits(
  content: string,
  edits: Array<{ oldText: string; newText: string; replaceAll: boolean }>
): { updatedContent: string; appliedEdits: number } {
  let updated = content;
  let appliedEdits = 0;

  for (const edit of edits) {
    if (edit.replaceAll) {
      const matches = countOccurrences(updated, edit.oldText);
      if (matches === 0) {
        throw new PiFilesystemToolError(
          "edit_target_missing",
          `Could not find text to replace: ${edit.oldText.slice(0, 80)}`
        );
      }
      updated = updated.split(edit.oldText).join(edit.newText);
      appliedEdits += 1;
      continue;
    }

    const index = updated.indexOf(edit.oldText);
    if (index < 0) {
      throw new PiFilesystemToolError(
        "edit_target_missing",
        `Could not find text to replace: ${edit.oldText.slice(0, 80)}`
      );
    }

    updated =
      updated.slice(0, index) + edit.newText + updated.slice(index + edit.oldText.length);
    appliedEdits += 1;
  }

  return { updatedContent: updated, appliedEdits };
}

export function createPiFilesystemToolSet(
  options: Partial<PiFilesystemToolConfig> = {}
): ToolSet {
  const config = normalizeConfig(options);
  const resolver = createPathResolver(config);

  const tools: ToolSet = {
    list_dir: tool({
      description:
        "List files and directories under the allowed workspace root. Never use absolute paths outside the workspace.",
      inputSchema: zodSchema(listDirInputSchema),
      execute: async (rawInput) => {
        try {
          const input = listDirInputSchema.parse(rawInput);
          const resolved = await resolver.resolveExistingPath(input.path);
          const dirStat = await fs.lstat(resolved.absolutePath);
          if (!dirStat.isDirectory()) {
            throw new PiFilesystemToolError("not_a_directory", "Target path is not a directory.");
          }

          const entries = await fs.readdir(resolved.absolutePath, { withFileTypes: true });
          const sorted = entries
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, config.maxListEntries)
            .map((entry) => ({
              name: entry.name,
              path: toRelativePath(config.allowedRoot, path.join(resolved.absolutePath, entry.name)),
              type: entry.isDirectory()
                ? "directory"
                : entry.isSymbolicLink()
                  ? "symlink"
                  : "file",
            }));

          return {
            success: true,
            path: resolved.relativePath,
            entries: sorted,
            truncated: entries.length > config.maxListEntries,
            maxEntries: config.maxListEntries,
          };
        } catch (error) {
          return toFailure(error);
        }
      },
    }),

    read_file: tool({
      description:
        "Read a UTF-8 text file under the allowed workspace root. Fails for files larger than configured limits.",
      inputSchema: zodSchema(readFileInputSchema),
      execute: async (rawInput) => {
        try {
          const input = readFileInputSchema.parse(rawInput);
          const resolved = await resolver.resolveExistingPath(input.path);
          const fileStat = await fs.lstat(resolved.absolutePath);
          if (!fileStat.isFile()) {
            throw new PiFilesystemToolError("not_a_file", "Target path is not a file.");
          }
          assertMaxBytes(
            fileStat.size,
            config.maxReadBytes,
            "File size for read_file operation"
          );
          const content = await fs.readFile(resolved.absolutePath, "utf8");
          return {
            success: true,
            path: resolved.relativePath,
            content,
            bytesRead: Buffer.byteLength(content, "utf8"),
            maxReadBytes: config.maxReadBytes,
          };
        } catch (error) {
          return toFailure(error);
        }
      },
    }),

    write_file: tool({
      description:
        "Write UTF-8 text files under the allowed workspace root. Supports overwrite and append modes with size checks.",
      inputSchema: zodSchema(writeFileInputSchema),
      execute: async (rawInput) => {
        try {
          const input = writeFileInputSchema.parse(rawInput);
          const bytesToWrite = Buffer.byteLength(input.content, "utf8");
          assertMaxBytes(bytesToWrite, config.maxWriteBytes, "Write payload size");

          const resolved = await resolver.resolveWritablePath(input.path, {
            createParents: input.createParents,
          });

          const existing = await safeLstat(resolved.absolutePath);
          if (existing && existing.isDirectory()) {
            throw new PiFilesystemToolError(
              "not_a_file",
              "Target path points to a directory, not a file."
            );
          }

          if (input.mode === "append") {
            await fs.appendFile(resolved.absolutePath, input.content, "utf8");
          } else {
            await fs.writeFile(resolved.absolutePath, input.content, "utf8");
          }

          const finalStats = await fs.stat(resolved.absolutePath);
          return {
            success: true,
            path: resolved.relativePath,
            mode: input.mode,
            bytesWritten: bytesToWrite,
            fileSizeBytes: finalStats.size,
          };
        } catch (error) {
          return toFailure(error);
        }
      },
    }),

    edit_file: tool({
      description:
        "Apply bounded text replacement edits to a file under the allowed workspace root. Edits are sequential.",
      inputSchema: zodSchema(editFileInputSchema),
      execute: async (rawInput) => {
        try {
          const input = editFileInputSchema.parse(rawInput);
          assertMaxOperations(input.edits.length, config.maxEditOperations);

          const resolved = await resolver.resolveExistingPath(input.path);
          const fileStat = await fs.lstat(resolved.absolutePath);
          if (!fileStat.isFile()) {
            throw new PiFilesystemToolError("not_a_file", "Target path is not a file.");
          }

          assertMaxBytes(
            fileStat.size,
            config.maxReadBytes,
            "File size for edit_file read operation"
          );
          const existingContent = await fs.readFile(resolved.absolutePath, "utf8");

          const { updatedContent, appliedEdits } = applyTextEdits(existingContent, input.edits);
          const updatedBytes = Buffer.byteLength(updatedContent, "utf8");
          assertMaxBytes(updatedBytes, config.maxWriteBytes, "Edited content size");

          await fs.writeFile(resolved.absolutePath, updatedContent, "utf8");

          return {
            success: true,
            path: resolved.relativePath,
            appliedEdits,
            fileSizeBytes: updatedBytes,
          };
        } catch (error) {
          return toFailure(error);
        }
      },
    }),
  };

  if (config.allowDelete) {
    tools.delete_file = tool({
      description:
        "Delete a file under the allowed workspace root. Requires confirm=true for destructive safety.",
      inputSchema: zodSchema(deleteFileInputSchema),
      execute: async (rawInput) => {
        try {
          const input = deleteFileInputSchema.parse(rawInput);
          if (!input.confirm) {
            throw new PiFilesystemToolError(
              "destructive_confirmation_required",
              "Set confirm=true to delete files."
            );
          }
          const resolved = await resolver.resolveExistingPath(input.path);
          const targetStat = await fs.lstat(resolved.absolutePath);
          if (!targetStat.isFile() && !targetStat.isSymbolicLink()) {
            throw new PiFilesystemToolError(
              "not_a_file",
              "delete_file only supports files or symlinks."
            );
          }
          await fs.unlink(resolved.absolutePath);
          return {
            success: true,
            path: resolved.relativePath,
            deleted: true,
          };
        } catch (error) {
          return toFailure(error);
        }
      },
    });
  }

  return tools;
}

export function resolvePiFilesystemToolSetFromEnv(): ToolSet | undefined {
  const enabled = parseBooleanEnv(process.env.PI_FILESYSTEM_TOOLS_ENABLED, true);
  if (!enabled) {
    return undefined;
  }

  return createPiFilesystemToolSet({
    allowedRoot: process.env.PI_FS_ALLOWED_ROOT ?? process.cwd(),
    maxReadBytes: parseIntegerEnv(process.env.PI_FS_MAX_READ_BYTES, DEFAULT_MAX_READ_BYTES),
    maxWriteBytes: parseIntegerEnv(process.env.PI_FS_MAX_WRITE_BYTES, DEFAULT_MAX_WRITE_BYTES),
    maxListEntries: parseIntegerEnv(
      process.env.PI_FS_MAX_LIST_ENTRIES,
      DEFAULT_MAX_LIST_ENTRIES
    ),
    maxEditOperations: parseIntegerEnv(
      process.env.PI_FS_MAX_EDIT_OPERATIONS,
      DEFAULT_MAX_EDIT_OPERATIONS
    ),
    allowDelete: parseBooleanEnv(process.env.PI_FS_DELETE_ENABLED, false),
  });
}

export function mergePiToolSets(primary?: ToolSet, secondary?: ToolSet): ToolSet | undefined {
  if (!primary && !secondary) return undefined;
  if (!primary) return secondary;
  if (!secondary) return primary;
  return {
    ...secondary,
    ...primary,
  };
}
