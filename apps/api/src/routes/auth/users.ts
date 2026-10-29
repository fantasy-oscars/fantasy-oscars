import { query, type DbClient } from "../../data/db.js";

export async function insertUser(
  client: DbClient,
  input: {
    // Store the username with the user's preferred casing (trimmed), while
    // deduping/searching case-insensitively via lower(username) indexes/queries.
    username_display: string;
    email: string;
    avatar_key: string;
    password_hash: string;
    password_algo: string;
  }
) {
  const { rows } = await query(
    client,
    `INSERT INTO app_user (username, email, avatar_key)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, created_at, is_admin, avatar_key`,
    [input.username_display, input.email, input.avatar_key]
  );
  const user = rows[0];
  await query(
    client,
    `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
    [user.id, input.password_hash, input.password_algo]
  );
  return { user };
}
