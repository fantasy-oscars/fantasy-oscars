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
import { log } from "./logger.js";

const config = loadConfig();
const app = createServer();
const httpServer = createHttpServer(app);

if (config.realtimeEnabled) {
  const io = new SocketIOServer(httpServer, {
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
} else {
  clearDraftEventEmitter();
  clearCeremonyEventEmitter();
}

httpServer.listen(config.port, () => {
  log({ level: "info", msg: "startup", port: config.port });
});

// Server-side timer enforcement: ensures timed drafts progress even if no clients are open.
startDraftSweeper(app.locals.db);
