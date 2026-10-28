import crypto from "crypto";
import type { Request } from "express";
import { normalizeUsername } from "@fantasy-oscars/shared";

/** Rate-limit key for login: client IP plus a fixed-length digest of the normalised username. */
export function loginUserRateKey(req: Request): string {
  const body = (req.body ?? {}) as { username?: unknown; handle?: unknown };
  const raw = body.username ?? body.handle;
  const name = typeof raw === "string" ? normalizeUsername(raw) : "";
  const digest = crypto.createHash("sha256").update(name).digest("hex");
  return `${req.ip ?? "unknown"}|${digest}`;
}
