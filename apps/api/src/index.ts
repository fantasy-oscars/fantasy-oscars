import { createServer } from "./server.js";
import { loadConfig } from "./config/env.js";
import { createServer as createHttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { registerDraftNamespace } from "./realtime/draftNamespace.js";
import {
  clearDraftEventEmitter,
  registerDraftEventEmitter
} from "./realtime/draftEvents.js";

const config = loadConfig();
const app = createServer();
const httpServer = createHttpServer(app);

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean) ?? ["http://localhost:5173", "http://127.0.0.1:5173"];
if (config.realtimeEnabled) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    serveClient: false
  });
  const draftNamespace = registerDraftNamespace(io, {
    db: app.locals.db,
    authSecret: config.authSecret
  });
  registerDraftEventEmitter(draftNamespace);
} else {
  clearDraftEventEmitter();
}

httpServer.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${config.port}`);
});
