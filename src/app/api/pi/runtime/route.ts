import { getPiRuntimeDiagnostics } from "@/lib/pi-runtime";
import { appendTelemetry } from "@/lib/telemetry";

function isDiagnosticsEnabled(): boolean {
  const value = process.env.PI_RUNTIME_DIAGNOSTICS_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export async function GET() {
  if (!isDiagnosticsEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const diagnostics = await getPiRuntimeDiagnostics({ resolveEngine: true });
    await appendTelemetry({
      level: "info",
      source: "api.pi.runtime",
      event: "diagnostics",
      data: {
        engineId: diagnostics.engine.id,
        source: diagnostics.engine.source,
        configuredModule: diagnostics.engine.configuredModule,
        loadedModule: diagnostics.engine.loadedModule,
        loadedExport: diagnostics.engine.loadedExport,
        fsToolsEnabled: diagnostics.filesystem.toolsEnabled,
        fsAllowedRoot: diagnostics.filesystem.allowedRoot,
        fsExposedTools: diagnostics.filesystem.exposedToolNames,
      },
    });
    return Response.json({ ok: true, diagnostics });
  } catch (error) {
    await appendTelemetry({
      level: "error",
      source: "api.pi.runtime",
      event: "diagnostics_error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Runtime diagnostics failed" },
      { status: 500 }
    );
  }
}
