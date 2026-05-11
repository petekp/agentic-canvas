import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendTelemetry } from "@/lib/telemetry";
import { appendClientToolResultToLedger } from "@/lib/pi-runtime";

vi.mock("@/lib/telemetry", () => ({
  appendTelemetry: vi.fn(),
}));

vi.mock("@/lib/pi-runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pi-runtime")>("@/lib/pi-runtime");
  return {
    ...actual,
    appendClientToolResultToLedger: vi.fn(),
  };
});

describe("PI runtime tool-result route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(appendTelemetry).mockResolvedValue(undefined);
    vi.mocked(appendClientToolResultToLedger).mockResolvedValue({
      status: "appended",
      runId: "run_1",
      toolName: "add_component",
      idempotencyKey: "workspace_default:space_1:thread_default:tc_1",
    });
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("@/app/api/pi/runtime/tool-result/route");

    const req = new Request("http://localhost/api/pi/runtime/tool-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName: "add_component" }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload).toEqual({ error: "toolCallId and toolName are required" });
    expect(appendClientToolResultToLedger).not.toHaveBeenCalled();
  });

  it("appends tool results using resolved chat session scope", async () => {
    const { POST } = await import("@/app/api/pi/runtime/tool-result/route");
    vi.stubEnv("PI_RUNTIME_ROOT", "/tmp/pi-root");

    const req = new Request("http://localhost/api/pi/runtime/tool-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "ws_test",
        threadId: "thread_test",
        activeSpaceId: "space_test",
        toolCallId: "tc_1",
        toolName: "add_component",
        result: { success: true },
        isError: false,
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      status: "appended",
      runId: "run_1",
      toolName: "add_component",
      idempotencyKey: "workspace_default:space_1:thread_default:tc_1",
    });
    expect(appendClientToolResultToLedger).toHaveBeenCalledWith({
      runtimeRoot: "/tmp/pi-root",
      sessionId: "ws_test:space_test:thread_test",
      toolCallId: "tc_1",
      toolName: "add_component",
      result: { success: true },
      isError: false,
    });
  });

  it("returns missing_call status when no call event exists yet", async () => {
    const { POST } = await import("@/app/api/pi/runtime/tool-result/route");
    vi.mocked(appendClientToolResultToLedger).mockResolvedValueOnce({
      status: "missing_call",
    });

    const req = new Request("http://localhost/api/pi/runtime/tool-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolCallId: "tc_missing",
        toolName: "add_component",
        result: { success: true },
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      status: "missing_call",
    });
    expect(appendClientToolResultToLedger).toHaveBeenCalledWith({
      runtimeRoot: expect.stringContaining("/.runtime/pi"),
      sessionId: "workspace_default:none:thread_default",
      toolCallId: "tc_missing",
      toolName: "add_component",
      result: { success: true },
      isError: false,
    });
  });
});

