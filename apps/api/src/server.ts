import express from "express";
import type { Pool } from "pg";
import { healthRouter } from "./routes/health.js";
import { createAuthRouter } from "./routes/auth.js";
import { createDraftsRouter } from "./routes/drafts.js";
import { createLeaguesRouter } from "./routes/leagues.js";
import { createPool } from "./data/db.js";
import { AppError, errorBody } from "./errors.js";
import { buildRequestLog, deriveDraftContext, log } from "./logger.js";
import { loadConfig } from "./config/env.js";

function sanitizeBody(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBody(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
      const lower = key.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("token") ||
        lower.includes("secret")
      ) {
        return [key, "[REDACTED]"];
      }
      return [key, sanitizeBody(val)];
    });
    return Object.fromEntries(entries);
  }
  return value;
}

export function createServer(deps?: { db?: Pool }) {
  const app = express();
  const config = loadConfig();
  const pool = deps?.db ?? createPool(process.env.DATABASE_URL ?? "");
  app.use(express.json());

  // Minimal CORS for local dev and web preview
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowlist =
      process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173";
    const allowedOrigins = allowlist
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const isAllowed = origin ? allowedOrigins.some((o) => origin.startsWith(o)) : false;

    if (isAllowed && origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With"
      );
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    res.header("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const sanitizedBody = sanitizeBody(req.body);
      log(
        buildRequestLog({
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          duration_ms: Date.now() - start,
          body: sanitizedBody
        })
      );
    });
    next();
  });

  app.use("/health", healthRouter);
  app.use("/auth", createAuthRouter(pool, { authSecret: config.authSecret }));
  app.use("/leagues", createLeaguesRouter(pool, config.authSecret));
  app.use("/drafts", createDraftsRouter(pool, config.authSecret));
  app.get("/", (_req, res) => {
    res.json({ ok: true, service: "api", status: "healthy" });
  });
  app.use((_req, res) => {
    res.status(404).json(errorBody(new AppError("NOT_FOUND", 404, "Not found")));
  });

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
      const sanitizedBody = sanitizeBody(_req.body);
      const context = deriveDraftContext(sanitizedBody);
      log({
        level: "error",
        msg: "request_error",
        method: _req.method,
        path: _req.originalUrl ?? _req.url,
        status,
        code: appErr?.code ?? "INTERNAL_ERROR",
        error: message,
        error_name: err instanceof Error ? err.name : undefined,
        error_stack: err instanceof Error ? err.stack : undefined,
        ...context
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
