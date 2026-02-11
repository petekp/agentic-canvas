import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { buildAgentSessionId } from "@/lib/pi-adapter-contract";
import { mergePiToolSets, resolvePiFilesystemToolSetFromEnv } from "@/lib/pi-filesystem-tools";
import { appendPiEventToFilesystem, streamWithPiRuntime } from "@/lib/pi-runtime";

const DEFAULT_WORKSPACE_ID = "workspace_default";
const DEFAULT_THREAD_ID = "thread_default";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface ChatSessionScope {
  workspaceId: string;
  threadId: string;
  spaceId: string | null;
  sessionId: string;
}

export function resolveChatSessionScope(input: {
  workspaceId?: unknown;
  threadId?: unknown;
  activeSpaceId?: unknown;
}): ChatSessionScope {
  const workspaceId = asNonEmptyString(input.workspaceId) ?? DEFAULT_WORKSPACE_ID;
  const threadId = asNonEmptyString(input.threadId) ?? DEFAULT_THREAD_ID;
  const spaceId = asNonEmptyString(input.activeSpaceId);
  const sessionId = buildAgentSessionId({ workspaceId, threadId, spaceId });
  return { workspaceId, threadId, spaceId, sessionId };
}

export function toFrontendToolSet(tools: unknown): ToolSet | undefined {
  const frontendToolSet =
    tools && typeof tools === "object" && !Array.isArray(tools)
      ? (frontendTools(
          tools as Record<string, { description?: string; parameters: object }>
        ) as unknown as ToolSet)
      : undefined;

  const filesystemToolSet = resolvePiFilesystemToolSetFromEnv();
  return mergePiToolSets(frontendToolSet, filesystemToolSet);
}

export interface StreamWithPiPhase1AdapterOptions {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  session: ChatSessionScope;
  stopWhen?: Parameters<typeof streamWithPiRuntime>[0]["stopWhen"];
  abortSignal?: AbortSignal;
}

export async function streamWithPiPhase1Adapter(options: StreamWithPiPhase1AdapterOptions) {
  return streamWithPiRuntime(options);
}

export { appendPiEventToFilesystem };
