import type { Server as HttpServer } from "http";
import type { LogEntry } from "./logger.js";
import { log as defaultLog } from "./logger.js";

export type ShutdownDeps = {
  httpServer: Pick<HttpServer, "close" | "closeAllConnections">;
  /** Socket.IO server; absent when realtime is disabled. */
  io?: { close: (cb?: (err?: Error) => void) => unknown } | null;
  sweeper: { stop: () => void | Promise<void> };
  pool: { end: () => Promise<void> };
  timeoutMs: number;
  /** Runs after the pool has ended (e.g. flush error reporting). */
  onDone?: () => void | Promise<void>;
  log?: (entry: LogEntry) => void;
};

export function parseShutdownTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : 10_000;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<"done" | "timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve("done");
      },
      () => {
        clearTimeout(timer);
        resolve("done");
      }
    );
  });
}

/**
 * Build an idempotent shutdown routine: stop accepting connections, stop the sweeper,
 * close Socket.IO, wait (bounded) for in-flight HTTP requests, then end the pg pool.
 */
export function createShutdown(deps: ShutdownDeps) {
  const log = deps.log ?? defaultLog;
  let inFlight: Promise<void> | null = null;

  async function run(signal: string): Promise<void> {
    const start = Date.now();
    log({ level: "info", msg: "shutdown_started", signal, timeout_ms: deps.timeoutMs });

    // 1. Stop accepting new connections; the callback fires once in-flight requests drain.
    const serverClosed = new Promise<void>((resolve) => {
      deps.httpServer.close(() => resolve());
    });
    log({ level: "info", msg: "shutdown_http_closing" });

    // 2. Stop the timer sweeper.
    await deps.sweeper.stop();
    log({ level: "info", msg: "shutdown_sweeper_stopped" });

    // 3. Close Socket.IO; clients reconnect to another instance.
    if (deps.io) {
      await new Promise<void>((resolve) => {
        const result = deps.io?.close(() => resolve());
        void Promise.resolve(result).catch(() => resolve());
      });
      log({ level: "info", msg: "shutdown_socketio_closed" });
    }

    // 4. Wait for in-flight HTTP requests, up to the timeout.
    const remaining = Math.max(0, deps.timeoutMs - (Date.now() - start));
    const outcome = await withTimeout(serverClosed, remaining);
    if (outcome === "timeout") {
      log({ level: "error", msg: "shutdown_http_timeout", timeout_ms: deps.timeoutMs });
      deps.httpServer.closeAllConnections();
    } else {
      log({ level: "info", msg: "shutdown_http_drained" });
    }

    // 5. End the database pool.
    const poolOutcome = await withTimeout(deps.pool.end(), 5000);
    log({
      level: poolOutcome === "done" ? "info" : "error",
      msg: poolOutcome === "done" ? "shutdown_pool_closed" : "shutdown_pool_timeout"
    });

    await deps.onDone?.();
    log({ level: "info", msg: "shutdown_complete", duration_ms: Date.now() - start });
  }

  return function shutdown(signal = "SIGTERM"): Promise<void> {
    inFlight ??= run(signal);
    return inFlight;
  };
}
