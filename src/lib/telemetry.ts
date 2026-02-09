import fs from "fs/promises";
import path from "path";

export type TelemetryLevel = "info" | "warn" | "error";

export interface TelemetryEvent {
  ts: string;
  level: TelemetryLevel;
  source: string;
  event: string;
  data?: unknown;
}

const MAX_BUFFER = 500;
const DEFAULT_LOG_PATH = path.join(
  process.cwd(),
  ".claude",
  "telemetry",
  "agentic-canvas.log"
);

function getBuffer(): TelemetryEvent[] {
  const globalWithBuffer = globalThis as typeof globalThis & {
    __telemetryBuffer?: TelemetryEvent[];
  };
  if (!globalWithBuffer.__telemetryBuffer) {
    globalWithBuffer.__telemetryBuffer = [];
  }
  return globalWithBuffer.__telemetryBuffer;
}

function getWriteChain(): Promise<void> {
  const globalWithChain = globalThis as typeof globalThis & {
    __telemetryWriteChain?: Promise<void>;
  };
  if (!globalWithChain.__telemetryWriteChain) {
    globalWithChain.__telemetryWriteChain = Promise.resolve();
  }
  return globalWithChain.__telemetryWriteChain;
}

function setWriteChain(promise: Promise<void>) {
  const globalWithChain = globalThis as typeof globalThis & {
    __telemetryWriteChain?: Promise<void>;
  };
  globalWithChain.__telemetryWriteChain = promise;
}

export function sanitizeTelemetryData(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }

  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeTelemetryData(item, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (/token|authorization|api[_-]?key|secret|password/i.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }
    sanitized[key] = sanitizeTelemetryData(val, depth + 1);
  }
  return sanitized;
}

export function listTelemetry(limit = 100): TelemetryEvent[] {
  const buffer = getBuffer();
  if (limit <= 0) return [];
  return buffer.slice(-limit);
}

export async function appendTelemetry(
  input: Omit<TelemetryEvent, "ts"> & { ts?: string }
) {
  const entry: TelemetryEvent = {
    ts: input.ts ?? new Date().toISOString(),
    level: input.level,
    source: input.source,
    event: input.event,
    data: sanitizeTelemetryData(input.data),
  };

  const buffer = getBuffer();
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }

  const logPath = process.env.TELEMETRY_LOG_PATH ?? DEFAULT_LOG_PATH;
  const line = `${JSON.stringify(entry)}\n`;
  const writeChain = getWriteChain()
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      await fs.appendFile(logPath, line, "utf8");
    })
    .catch((error) => {
      console.error("[telemetry] Failed to write log file:", error);
    });
  setWriteChain(writeChain);
  await writeChain;
}
