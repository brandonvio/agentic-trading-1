export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class ConsoleLogger implements Logger {
  constructor(
    private readonly scope = "app",
    private readonly minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info",
  ) {}

  private emit(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (ORDER[level] < ORDER[this.minLevel]) return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${this.scope}: ${msg}`;
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (meta) fn(line, meta);
    else fn(line);
  }

  debug(msg: string, meta?: Record<string, unknown>) {
    this.emit("debug", msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>) {
    this.emit("info", msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    this.emit("warn", msg, meta);
  }
  error(msg: string, meta?: Record<string, unknown>) {
    this.emit("error", msg, meta);
  }
  child(scope: string): Logger {
    return new ConsoleLogger(`${this.scope}:${scope}`, this.minLevel);
  }
}

export class NoopLogger implements Logger {
  debug() {}
  info() {}
  warn() {}
  error() {}
  child(): Logger {
    return this;
  }
}
