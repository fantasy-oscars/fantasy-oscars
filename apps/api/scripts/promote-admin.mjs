import "dotenv/config";

import { Pool } from "pg";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    username: get("--username") ?? get("--handle"),
    dbUrl: get("--url") ?? process.env.DATABASE_URL
  };
}

async function main() {
  const { username, dbUrl } = parseArgs();
  if (!dbUrl) throw new Error("DATABASE_URL is required (env or --url)");
  if (!username) throw new Error("--username is required");

  const normalizedUsername = username.trim().toLowerCase();

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    const res = await client.query(
      `UPDATE app_user
       SET is_admin = TRUE
       WHERE lower(username) = $1
       RETURNING id, username, email, is_admin`,
      [normalizedUsername]
    );
    if (!res.rows[0]) {
      throw new Error(`User not found: ${normalizedUsername}`);
    }
    console.log(JSON.stringify({ ok: true, user: res.rows[0] }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
