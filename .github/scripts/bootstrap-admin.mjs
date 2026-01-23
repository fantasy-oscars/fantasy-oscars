import crypto from "crypto";
import { Pool } from "pg";

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
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    handle: get("--handle"),
    email: get("--email"),
    displayName: get("--display-name"),
    password: get("--password"),
    secret: get("--secret"),
    dbUrl: get("--url") ?? process.env.DATABASE_URL
  };
}

async function main() {
  const { handle, email, displayName, password, secret, dbUrl } = parseArgs();
  if (!dbUrl) throw new Error("DATABASE_URL is required (env or --url)");
  if (!handle || !email || !displayName || !password) {
    throw new Error("handle, email, display-name, and password are required");
  }
  const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!bootstrapSecret) throw new Error("ADMIN_BOOTSTRAP_SECRET env is not set");
  if (secret !== bootstrapSecret) throw new Error("Invalid bootstrap secret");

  const normalizedHandle = handle.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const name = displayName.trim();
  const pwHash = hashPassword(password);

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userRes = await client.query(
      `INSERT INTO app_user (handle, email, display_name, is_admin)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (handle) DO UPDATE
         SET email = EXCLUDED.email,
             display_name = EXCLUDED.display_name,
             is_admin = TRUE
       RETURNING id, handle, email, is_admin`,
      [normalizedHandle, normalizedEmail, name]
    );
    const user = userRes.rows[0];
    await client.query(
      `INSERT INTO auth_password (user_id, password_hash, password_algo, password_set_at)
       VALUES ($1, $2, 'scrypt', now())
       ON CONFLICT (user_id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             password_algo = EXCLUDED.password_algo,
             password_set_at = now()`,
      [user.id, pwHash]
    );
    await client.query(
      `INSERT INTO admin_audit_log (actor_user_id, action, target_type, target_id, meta)
       VALUES ($1, 'bootstrap_admin', 'app_user', $2, $3)
       ON CONFLICT DO NOTHING`,
      [user.id, user.id, { handle: normalizedHandle, email: normalizedEmail }]
    ).catch(() => {});

    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        { ok: true, user: { id: user.id, handle: user.handle, email: user.email } },
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
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
