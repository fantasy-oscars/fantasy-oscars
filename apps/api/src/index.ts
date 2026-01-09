import { createServer } from "./server.js";
import { loadConfig } from "./config/env.js";
import { createServer as createHttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { registerDraftNamespace } from "./realtime/draftNamespace.js";

const config = loadConfig();
const app = createServer();
const httpServer = createHttpServer(app);

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean) ?? ["http://localhost:5173", "http://127.0.0.1:5173"];
const io = new SocketIOServer(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
  serveClient: false
});
registerDraftNamespace(io);

httpServer.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${config.port}`);
});
