import path from "node:path";
import { appendTelemetry } from "@/lib/telemetry";
import { resolveChatSessionScope } from "@/lib/pi-phase1-adapter";
import { appendClientToolResultToLedger } from "@/lib/pi-runtime";

const DEFAULT_RUNTIME_ROOT = path.join(process.cwd(), ".runtime", "pi");

type ToolResultRequestBody = {
  workspaceId?: unknown;
  threadId?: unknown;
  activeSpaceId?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  result?: unknown;
  isError?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(req: Request) {
  let body: ToolResultRequestBody;
  try {
    body = (await req.json()) as ToolResultRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const toolCallId = asNonEmptyString(body.toolCallId);
  const toolName = asNonEmptyString(body.toolName);
  if (!toolCallId || !toolName) {
    return Response.json(
      { error: "toolCallId and toolName are required" },
      { status: 400 }
    );
  }

  const session = resolveChatSessionScope({
    workspaceId: body.workspaceId,
    threadId: body.threadId,
    activeSpaceId: body.activeSpaceId,
  });

  const runtimeRoot = process.env.PI_RUNTIME_ROOT ?? DEFAULT_RUNTIME_ROOT;

  try {
    const appendResult = await appendClientToolResultToLedger({
      runtimeRoot,
      sessionId: session.sessionId,
      toolCallId,
      toolName,
      result: body.result ?? null,
      isError: body.isError === true,
    });

    await appendTelemetry({
      level: "info",
      source: "api.pi.runtime.tool_result",
      event: "append",
      data: {
        sessionId: session.sessionId,
        toolCallId,
        toolName,
        status: appendResult.status,
      },
    });

    return Response.json({ ok: true, ...appendResult });
  } catch (error) {
    await appendTelemetry({
      level: "error",
      source: "api.pi.runtime.tool_result",
      event: "append_error",
      data: {
        toolCallId,
        toolName,
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to append tool result" },
      { status: 500 }
    );
  }
}

