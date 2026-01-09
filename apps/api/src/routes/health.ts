import { Router } from "express";

export const healthRouter = Router();

export function healthHandler(_req: unknown, res: { json: (body: unknown) => void }) {
  res.json({ ok: true, service: "api", status: "healthy" });
}

healthRouter.get("/", healthHandler);
