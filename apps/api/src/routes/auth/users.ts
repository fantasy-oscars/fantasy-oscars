import { query, type DbClient } from "../../data/db.js";
import { isMissingColumnError, isNotNullViolation } from "./pgErrors.js";

export async function insertUserWithFallback(
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
  // Try to insert into the "new" schema first (username/email/is_admin/avatar_key).
  try {
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
  } catch (err) {
    // DB may be missing the new column during a deploy; retry without it and
    // still return a best-effort avatar for the session.
    if (isMissingColumnError(err, "avatar_key")) {
      const { rows } = await query(
        client,
        `INSERT INTO app_user (username, email)
         VALUES ($1, $2)
         RETURNING id, username, email, created_at, is_admin`,
        [input.username_display, input.email]
      );
      const user = rows[0];
      await query(
        client,
        `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
        [user.id, input.password_hash, input.password_algo]
      );
      return { user: { ...user, avatar_key: input.avatar_key } };
    }

    // Legacy schema sometimes required `display_name` (NOT NULL). If so, mirror the
    // username as display_name to keep dogfooding ergonomic until DB reset.
    if (isNotNullViolation(err, "display_name")) {
      try {
        const { rows } = await query(
          client,
          `INSERT INTO app_user (username, email, display_name)
           VALUES ($1, $2, $3)
           RETURNING id, username, email, created_at, is_admin`,
          [input.username_display, input.email, input.username_display]
        );
        const user = rows[0];
        await query(
          client,
          `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
          [user.id, input.password_hash, input.password_algo]
        );
        return { user: { ...user, avatar_key: input.avatar_key } };
      } catch (displayErr) {
        if (isMissingColumnError(displayErr, "is_admin")) {
          const { rows } = await query(
            client,
            `INSERT INTO app_user (username, email, display_name)
             VALUES ($1, $2, $3)
             RETURNING id, username, email, created_at`,
            [input.username_display, input.email, input.username_display]
          );
          const user = rows[0];
          await query(
            client,
            `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
            [user.id, input.password_hash, input.password_algo]
          );
          return { user: { ...user, is_admin: false, avatar_key: input.avatar_key } };
        }
        throw displayErr;
      }
    }

    // If a pre-squash DB is missing columns, retry using the older schema.
    if (isMissingColumnError(err, "is_admin")) {
      const { rows } = await query(
        client,
        `INSERT INTO app_user (username, email)
         VALUES ($1, $2)
         RETURNING id, username, email, created_at`,
        [input.username_display, input.email]
      );
      const user = rows[0];
      await query(
        client,
        `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
        [user.id, input.password_hash, input.password_algo]
      );
      return { user: { ...user, is_admin: false, avatar_key: input.avatar_key } };
    }

    if (isMissingColumnError(err, "username")) {
      // Legacy schema used `handle` instead of `username`.
      try {
        const { rows } = await query(
          client,
          `INSERT INTO app_user (handle, email)
           VALUES ($1, $2)
           RETURNING id, handle AS username, email, created_at, is_admin`,
          [input.username_display, input.email]
        );
        const user = rows[0];
        await query(
          client,
          `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
          [user.id, input.password_hash, input.password_algo]
        );
        return { user: { ...user, avatar_key: input.avatar_key } };
      } catch (legacyErr) {
        if (isNotNullViolation(legacyErr, "display_name")) {
          try {
            const { rows } = await query(
              client,
              `INSERT INTO app_user (handle, email, display_name)
               VALUES ($1, $2, $3)
               RETURNING id, handle AS username, email, created_at, is_admin`,
              [input.username_display, input.email, input.username_display]
            );
            const user = rows[0];
            await query(
              client,
              `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
              [user.id, input.password_hash, input.password_algo]
            );
            return { user: { ...user, avatar_key: input.avatar_key } };
          } catch (displayErr) {
            if (isMissingColumnError(displayErr, "is_admin")) {
              const { rows } = await query(
                client,
                `INSERT INTO app_user (handle, email, display_name)
                 VALUES ($1, $2, $3)
                 RETURNING id, handle AS username, email, created_at`,
                [input.username_display, input.email, input.username_display]
              );
              const user = rows[0];
              await query(
                client,
                `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
                [user.id, input.password_hash, input.password_algo]
              );
              return {
                user: { ...user, is_admin: false, avatar_key: input.avatar_key }
              };
            }
            throw displayErr;
          }
        }
        throw legacyErr;
      }
    }

    throw err;
  }
}
