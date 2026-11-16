import crypto from "crypto";
import type { Request } from "express";
import { normalizeEmail } from "@fantasy-oscars/shared";

/** Rate-limit key for reset requests: a digest of the normalised address, across all IPs. */
export function passwordResetEmailRateKey(req: Request): string {
  const raw = (req.body ?? {}) as { email?: unknown };
  const email = typeof raw.email === "string" ? normalizeEmail(raw.email) : "";
  const digest = crypto.createHash("sha256").update(email).digest("hex");
  return `reset-email|${digest}`;
}
