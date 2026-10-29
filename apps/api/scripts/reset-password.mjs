import "dotenv/config";

import crypto from "crypto";
import { Pool } from "pg";
import { validatePassword } from "@fantasy-oscars/shared";

// Admin-assisted password reset.
//
//   RESET_PASSWORD='new-password' pnpm run admin:reset-password -- --username alice
//   printf '%s' 'new-password' | pnpm run admin:reset-password -- --username alice
//
// The new password is read from the RESET_PASSWORD env var, or from stdin when
// that is unset. It is never accepted as a command-line argument so it does not
// land in shell history or process listings. All of the user's sessions are
// revoked so every signed-in device has to log in again.

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const keylen = 64;
  const derived = crypto.scryptSync(password, salt, keylen, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), derived.toString("base64")].join(
    "$"
  );
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg.startsWith("--password"))) {
    throw new Error(
      "Do not pass the password as an argument; use RESET_PASSWORD or stdin instead. " +
        "The value you typed may now be in your shell history; clear it and choose a different password."
    );
  }
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    username: get("--username") ?? get("--handle"),
    dbUrl: get("--url") ?? process.env.DATABASE_URL
  };
}

async function readStdin() {
  if (process.stdin.isTTY) {
    throw new Error("Set RESET_PASSWORD or pipe the new password on stdin");
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  // Strip a single trailing newline added by echo/heredocs.
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

async function main() {
  const { username, dbUrl } = parseArgs();
  if (!dbUrl) throw new Error("DATABASE_URL is required (env or --url)");
  if (!username) throw new Error("--username is required");

  const password = process.env.RESET_PASSWORD ?? (await readStdin());
  const issues = validatePassword(password);
  if (issues.length) {
    throw new Error(`Invalid password: ${issues.map((i) => i.code).join("; ")}`);
  }

  const normalizedUsername = username.trim().toLowerCase();
  const pwHash = hashPassword(password);

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userRes = await client.query(
      `SELECT id, username
       FROM app_user
       WHERE lower(username) = $1
         AND deleted_at IS NULL`,
      [normalizedUsername]
    );
    const user = userRes.rows[0];
    if (!user) throw new Error(`User not found: ${normalizedUsername}`);

    await client.query(
      `INSERT INTO auth_password (user_id, password_hash, password_algo, password_set_at)
       VALUES ($1, $2, 'scrypt', now())
       ON CONFLICT (user_id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             password_algo = EXCLUDED.password_algo,
             password_set_at = now()`,
      [user.id, pwHash]
    );
    const revoked = await client.query(
      `UPDATE auth_session
       SET revoked_at = now()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [user.id]
    );
    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          ok: true,
          user: { id: user.id, username: user.username },
          sessions_revoked: revoked.rowCount ?? 0
        },
        null,
        2
      )
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
