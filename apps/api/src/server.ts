import express from "express";
import type { Pool } from "pg";
import { healthRouter } from "./routes/health.js";
import { createAuthRouter } from "./routes/auth.js";
import { createPool } from "./data/db.js";
import { AppError, errorBody } from "./errors.js";

export function createServer(deps?: { db?: Pool }) {
  const app = express();
  const pool = deps?.db ?? createPool(process.env.DATABASE_URL ?? "");
  app.use(express.json());
  app.use("/health", healthRouter);
  app.use("/auth", createAuthRouter(pool));

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
      res.status(status).json(errorBody(appErr ?? (err as Error)));
    }
  );
  return app;
}
