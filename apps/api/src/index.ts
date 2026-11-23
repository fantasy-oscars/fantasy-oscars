// Local dev ergonomics: load `.env` when present. In production, Render injects env vars
// and no `.env` file is expected, so this is a no-op.
import "dotenv/config";

import { createServer } from "./server.js";
import { loadConfig } from "./config/env.js";
import { createServer as createHttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createAllowRequest } from "./realtime/originGuard.js";
import { registerDraftNamespace } from "./realtime/draftNamespace.js";
import {
  clearDraftEventEmitter,
  registerDraftEventEmitter
} from "./realtime/draftEvents.js";
import {
  clearCeremonyEventEmitter,
  registerCeremonyEventEmitter
} from "./realtime/ceremonyEvents.js";
import { startDraftSweeper } from "./services/draftSweeper.js";
import { circuitDraftSweeperPass } from "./services/circuit/circuitDraft.js";
import { registerCircuitDraftWake } from "./services/circuit/circuitDraftWake.js";
import { startCircuitWaiverScheduler } from "./services/circuit/circuitWaiverScheduler.js";
import {
  connectCircuitDraftEvents,
  connectCircuitScheduleEvents,
  connectCircuitScoreEvents,
  connectCircuitWaiverEvents,
  disconnectCircuitDraftEvents,
  disconnectCircuitScheduleEvents,
  disconnectCircuitScoreEvents,
  disconnectCircuitWaiverEvents,
  registerCircuitNamespace
} from "./services/circuit/circuitNamespace.js";
import { log } from "./logger.js";
import { initSentry, flushSentry } from "./observability/sentry.js";
import { assertMigrationsCurrent, MigrationsBehindError } from "./data/migrations.js";
import { createShutdown, parseShutdownTimeoutMs } from "./shutdown.js";

initSentry();

const config = loadConfig();
const app = createServer();
const httpServer = createHttpServer(app);

// Refuse to serve against a database that is behind this build's migrations.
try {
  const status = await assertMigrationsCurrent(app.locals.db);
  log({ level: "info", msg: "migrations_current", latest: status.applied });
} catch (err) {
  log({
    level: "error",
    msg: "migrations_check_failed",
    error: err instanceof Error ? err.message : String(err),
    ...(err instanceof MigrationsBehindError ? { pending: err.status.pending } : {})
  });
  await flushSentry();
  process.exit(1);
}

let io: SocketIOServer | null = null;
if (config.realtimeEnabled) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: config.corsAllowedOrigins, credentials: true },
    serveClient: false,
    allowRequest: createAllowRequest(config.corsAllowedOrigins)
  });
  const draftNamespace = registerDraftNamespace(io, {
    db: app.locals.db,
    authSecret: config.authSecret
  });
  registerDraftEventEmitter(draftNamespace);
  registerCeremonyEventEmitter(draftNamespace);
  // Circuit leagues have their own namespace; see services/circuit/circuitNamespace.ts.
  const circuitNamespace = registerCircuitNamespace(io, {
    db: app.locals.db,
    authSecret: config.authSecret
  });
  connectCircuitDraftEvents(circuitNamespace);
  connectCircuitWaiverEvents(circuitNamespace);
  connectCircuitScoreEvents(circuitNamespace);
  connectCircuitScheduleEvents(circuitNamespace);
} else {
  clearDraftEventEmitter();
  clearCeremonyEventEmitter();
  disconnectCircuitDraftEvents();
  disconnectCircuitWaiverEvents();
  disconnectCircuitScoreEvents();
  disconnectCircuitScheduleEvents();
}

httpServer.listen(config.port, () => {
  log({ level: "info", msg: "startup", port: config.port });
});

// Server-side timer enforcement: ensures timed drafts progress even if no clients are open.
// Circuit drafts ride the same sweeper, wired here because the two families never import
// each other.
const sweeper = startDraftSweeper(app.locals.db, [circuitDraftSweeperPass]);
registerCircuitDraftWake(sweeper.wake);
// Circuit waiver windows run on their own loop, under their own advisory lock.
const waiverScheduler = startCircuitWaiverScheduler(app.locals.db);

const shutdown = createShutdown({
  httpServer,
  io,
  sweeper: {
    stop: async () => {
      await Promise.all([sweeper.stop(), waiverScheduler.stop()]);
    }
  },
  pool: app.locals.db,
  timeoutMs: parseShutdownTimeoutMs(process.env.SHUTDOWN_TIMEOUT_MS),
  onDone: () => flushSentry()
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(
      () => process.exit(0),
      (err) => {
        log({
          level: "error",
          msg: "shutdown_failed",
          error: err instanceof Error ? err.message : String(err)
        });
        process.exit(1);
      }
    );
  });
}
