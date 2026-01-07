import express from "express";
import type { Pool } from "pg";
import { healthRouter } from "./routes/health.js";
import { createAuthRouter } from "./routes/auth.js";
import { createDraftsRouter } from "./routes/drafts.js";
import { createLeaguesRouter } from "./routes/leagues.js";
import { createPool } from "./data/db.js";
import { AppError, errorBody } from "./errors.js";
import { buildRequestLog, log } from "./logger.js";
import { loadConfig } from "./config/env.js";

export function createServer(deps?: { db?: Pool }) {
  const app = express();
  const config = loadConfig();
  const pool = deps?.db ?? createPool(process.env.DATABASE_URL ?? "");
  app.use(express.json());

  // Minimal CORS for local dev and web preview
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? "*";
    const allowed =
      origin === "*" ||
      origin.startsWith("http://localhost:5173") ||
      origin.startsWith("http://127.0.0.1:5173");
    if (allowed) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With"
      );
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      log(
        buildRequestLog({
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          duration_ms: Date.now() - start,
          body: req.body
        })
      );
    });
    next();
  });

  app.use("/health", healthRouter);
  app.use("/auth", createAuthRouter(pool, { authSecret: config.authSecret }));
  app.use("/leagues", createLeaguesRouter(pool, config.authSecret));
  app.use("/drafts", createDraftsRouter(pool, config.authSecret));

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      void _next;
      const appErr = err instanceof AppError ? err : undefined;
      const status = appErr?.status ?? 500;
      const message = appErr?.message ?? (err as Error)?.message ?? "Unexpected error";
      log({
        level: "error",
        msg: "request_error",
        status,
        code: appErr?.code ?? "INTERNAL_ERROR",
        error: message
      });
      if (!appErr && err instanceof Error) {
        // Emit stack to stderr during dev for quicker debugging.
        // eslint-disable-next-line no-console
        console.error(err);
      }
      res.status(status).json(errorBody(appErr ?? (err as Error)));
    }
  );
  return app;
}
