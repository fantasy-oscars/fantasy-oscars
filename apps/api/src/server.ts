import express from "express";
import type { Pool } from "pg";
import { healthRouter } from "./routes/health.js";
import { createAuthRouter } from "./routes/auth.js";
import { createPool } from "./data/db.js";

export function createServer(deps?: { db?: Pool }) {
  const app = express();
  const pool = deps?.db ?? createPool(process.env.DATABASE_URL ?? "");
  app.use(express.json());
  app.use("/health", healthRouter);
  app.use("/auth", createAuthRouter(pool));
  return app;
}
