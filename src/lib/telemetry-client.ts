export type ClientTelemetryLevel = "info" | "warn" | "error";

export interface ClientTelemetryEvent {
  source: string;
  event: string;
  level?: ClientTelemetryLevel;
  data?: unknown;
}

export async function trackClientTelemetry(event: ClientTelemetryEvent) {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: event.level ?? "info",
        source: event.source,
        event: event.event,
        data: event.data,
      }),
    });
  } catch {
    // Swallow telemetry errors; never block UI.
  }
}
