import * as Sentry from "@sentry/nextjs";
import { axiom, AXIOM_DATASET } from "./axiom";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  correlationId: string;
  [key: string]: unknown;
}

function createCorrelationId(): string {
  return crypto.randomUUID();
}

function log(
  level: LogLevel,
  message: string,
  data: Record<string, unknown> = {},
) {
  const correlationId =
    (data.correlationId as string) || createCorrelationId();

  const entry: LogEntry = {
    level,
    message,
    correlationId,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Console output (always, for local dev)
  const consoleFn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  consoleFn(`[${level.toUpperCase()}] ${message}`, { correlationId, ...data });

  // Axiom (if token configured)
  if (process.env.AXIOM_TOKEN) {
    axiom.ingest(AXIOM_DATASET, [entry]);
  }

  // Sentry (tag correlation ID on errors)
  if (level === "error") {
    Sentry.setTag("correlation_id", correlationId);
    if (data.error instanceof Error) {
      Sentry.captureException(data.error, { extra: data });
    }
  }
}

export const logger = {
  info: (message: string, data?: Record<string, unknown>) =>
    log("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) =>
    log("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) =>
    log("error", message, data),
  createCorrelationId,
  flush: async () => {
    if (process.env.AXIOM_TOKEN) {
      await axiom.flush();
    }
  },
};
