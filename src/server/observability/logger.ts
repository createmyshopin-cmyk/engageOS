import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Structured JSON logger with correlation-id propagation.
 *
 * One line per event, machine-parseable, no secrets. Every log carries the
 * request's `correlationId` so a single API call can be traced end to end
 * across controller → service → repository. In production this goes to stdout
 * (picked up by the platform log drain); in dev it's still JSON so the shape
 * never differs between environments.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVEL_RANK[raw] ?? LEVEL_RANK.info;
}

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Derive a child logger that always includes the given fields. */
  child(fields: LogFields): Logger;
}

/** Redact obviously-sensitive keys so tokens/secrets never reach the log sink. */
const REDACT = /(password|secret|token|authorization|api[_-]?key|hmac|signature)/i;
function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT.test(k) ? "[redacted]" : v;
  }
  return out;
}

function emit(level: LogLevel, base: LogFields, msg: string, fields?: LogFields): void {
  if (LEVEL_RANK[level] < threshold()) return;
  const line = {
    level,
    time: new Date().toISOString(),
    msg,
    ...sanitize(base),
    ...(fields ? sanitize(fields) : {}),
  };
  const serialized = JSON.stringify(line, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v
  );
  // Route error/warn to stderr, everything else to stdout.
  if (level === "error" || level === "warn") console.error(serialized);
  else console.log(serialized);
}

function make(base: LogFields): Logger {
  return {
    debug: (msg, f) => emit("debug", base, msg, f),
    info: (msg, f) => emit("info", base, msg, f),
    warn: (msg, f) => emit("warn", base, msg, f),
    error: (msg, f) => emit("error", base, msg, f),
    child: (f) => make({ ...base, ...f }),
  };
}

/** Create a request-scoped logger seeded with a correlation id. */
export function createLogger(correlationId: string, base: LogFields = {}): Logger {
  return make({ correlationId, ...base });
}

/** Generate a fresh correlation id (v4 uuid). */
export function newCorrelationId(): string {
  return randomUUID();
}
