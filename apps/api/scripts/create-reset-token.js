#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Generate a one-time password reset token for a user handle.
 *
 * Usage:
 *   DATABASE_URL=<connection> node apps/api/scripts/create-reset-token.js --handle alice --ttl-hours 1
 *
 * The script inserts a reset token into auth_password_reset (same shape as the API)
 * and prints the token so it can be delivered out-of-band. It never sets/reads the password.
 */

import crypto from "crypto";
import process from "process";
import { Pool } from "pg";

function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function requireEnv(key) {
  const val = process.env[key];
  if (!val || val.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function main() {
  const handle = getArg("--handle");
  const ttlHours = Number(getArg("--ttl-hours", "1"));

  if (!handle) {
    console.error(
      "Usage: node apps/api/scripts/create-reset-token.js --handle <handle> [--ttl-hours 1]"
    );
    process.exit(1);
  }
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    console.error("--ttl-hours must be a positive number");
    process.exit(1);
  }

  const connectionString = requireEnv("DATABASE_URL");
  const pool = new Pool({ connectionString });

  try {
    const { rows: users } = await pool.query(
      "SELECT id, handle, email FROM app_user WHERE LOWER(handle) = LOWER($1)",
      [handle]
    );
    const user = users[0];
    if (!user) {
      console.error(
        "No user found for that handle. Provide a generic response to the requester to avoid enumeration."
      );
      process.exit(1);
    }

    const rawToken = crypto.randomBytes(24).toString("base64url");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO auth_password_reset (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    console.log(
      JSON.stringify(
        {
          handle: user.handle,
          email: user.email,
          user_id: user.id,
          token: rawToken,
          expires_at: expiresAt.toISOString(),
          instructions:
            "Send the token out-of-band and have the user complete /reset/confirm in the web app."
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
