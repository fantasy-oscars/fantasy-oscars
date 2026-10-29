import type { DbClient } from "../db.js";
import { query, runInTransaction } from "../db.js";
import type { Pool, PoolClient } from "pg";

export type CmsStaticKey =
  | "about"
  | "faq"
  | "how_it_works"
  | "landing_blurb"
  | "code_of_conduct"
  | "legal_terms"
  | "legal_privacy"
  | "legal_disclaimer";

export type CmsDynamicKey = "banner" | "home_main";

export type CmsStaticContentRow = {
  key: string;
  title: string;
  body_markdown: string;
  updated_at: string;
  updated_by_user_id: number | null;
};

export type CmsDynamicContentRow = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  status: "DRAFT" | "PUBLISHED";
  variant: "info" | "warning" | "success" | "error";
  dismissible: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  published_by_user_id: number | null;
};

export async function getStaticContentByKey(client: DbClient, key: string) {
  const { rows } = await query<CmsStaticContentRow>(
    client,
    `SELECT key, title, body_markdown, updated_at, updated_by_user_id
     FROM cms_static_content
     WHERE key = $1`,
    [key]
  );
  return rows[0] ?? null;
}

export async function upsertStaticContent(
  client: DbClient,
  input: {
    key: string;
    title: string;
    body_markdown: string;
    actor_user_id?: number | null;
  }
) {
  const { key, title, body_markdown, actor_user_id = null } = input;
  const { rows } = await query<CmsStaticContentRow>(
    client,
    `INSERT INTO cms_static_content (key, title, body_markdown, updated_by_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key)
     DO UPDATE SET
       title = EXCLUDED.title,
       body_markdown = EXCLUDED.body_markdown,
       updated_at = now(),
       updated_by_user_id = EXCLUDED.updated_by_user_id
     RETURNING key, title, body_markdown, updated_at, updated_by_user_id`,
    [key, title, body_markdown, actor_user_id]
  );
  return rows[0] ?? null;
}

export async function listDynamicContentByKey(client: DbClient, key: string) {
  const { rows } = await query<CmsDynamicContentRow>(
    client,
    `SELECT
       id::int,
       key,
       title,
       body_markdown,
       status,
       variant,
       dismissible,
       starts_at,
       ends_at,
       created_at,
       updated_at,
       published_at,
       created_by_user_id,
       updated_by_user_id,
       published_by_user_id
     FROM cms_dynamic_content
     WHERE key = $1
     ORDER BY created_at DESC`,
    [key]
  );
  return rows;
}

export async function getPublishedDynamicContent(client: DbClient, key: string) {
  const { rows } = await query<CmsDynamicContentRow>(
    client,
    `SELECT
       id::int,
       key,
       title,
       body_markdown,
       status,
       variant,
       dismissible,
       starts_at,
       ends_at,
       created_at,
       updated_at,
       published_at,
       created_by_user_id,
       updated_by_user_id,
       published_by_user_id
     FROM cms_dynamic_content
     WHERE key = $1 AND status = 'PUBLISHED'
     LIMIT 1`,
    [key]
  );
  return rows[0] ?? null;
}

export async function listPublishedDynamicContentByKey(client: DbClient, key: string) {
  const { rows } = await query<CmsDynamicContentRow>(
    client,
    `SELECT
       id::int,
       key,
       title,
       body_markdown,
       status,
       variant,
       dismissible,
       starts_at,
       ends_at,
       created_at,
       updated_at,
       published_at,
       created_by_user_id,
       updated_by_user_id,
       published_by_user_id
     FROM cms_dynamic_content
     WHERE key = $1 AND status = 'PUBLISHED'
     ORDER BY published_at DESC NULLS LAST, id DESC`,
    [key]
  );
  return rows;
}

export async function createDynamicDraft(
  client: DbClient,
  input: {
    key: string;
    title: string;
    body_markdown: string;
    variant?: "info" | "warning" | "success" | "error";
    dismissible?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
    actor_user_id?: number | null;
  }
) {
  const {
    key,
    title,
    body_markdown,
    variant = "info",
    dismissible = true,
    starts_at = null,
    ends_at = null,
    actor_user_id = null
  } = input;
  const { rows } = await query<CmsDynamicContentRow>(
    client,
    `INSERT INTO cms_dynamic_content
       (key, title, body_markdown, status, variant, dismissible, starts_at, ends_at, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8, $8)
     RETURNING
       id::int, key, title, body_markdown, status, variant, dismissible, starts_at, ends_at, created_at, updated_at, published_at,
       created_by_user_id, updated_by_user_id, published_by_user_id`,
    [key, title, body_markdown, variant, dismissible, starts_at, ends_at, actor_user_id]
  );
  return rows[0] ?? null;
}

export async function updateDynamicDraft(
  client: DbClient,
  input: {
    id: number;
    title: string;
    body_markdown: string;
    variant?: "info" | "warning" | "success" | "error";
    dismissible?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
    actor_user_id?: number | null;
  }
) {
  const {
    id,
    title,
    body_markdown,
    variant,
    dismissible,
    starts_at,
    ends_at,
    actor_user_id = null
  } = input;
  const { rows } = await query<CmsDynamicContentRow>(
    client,
    `UPDATE cms_dynamic_content
     SET title = $1,
         body_markdown = $2,
         variant = COALESCE($3, variant),
         dismissible = COALESCE($4, dismissible),
         starts_at = COALESCE($5, starts_at),
         ends_at = COALESCE($6, ends_at),
         updated_at = now(),
         updated_by_user_id = $7
     WHERE id = $8
     RETURNING
       id::int, key, title, body_markdown, status, variant, dismissible, starts_at, ends_at, created_at, updated_at, published_at,
       created_by_user_id, updated_by_user_id, published_by_user_id`,
    [
      title,
      body_markdown,
      variant ?? null,
      typeof dismissible === "boolean" ? dismissible : null,
      typeof starts_at === "undefined" ? null : starts_at,
      typeof ends_at === "undefined" ? null : ends_at,
      actor_user_id,
      id
    ]
  );
  return rows[0] ?? null;
}

export async function publishDynamicContent(
  client: DbClient,
  input: { id: number; actor_user_id?: number | null }
): Promise<CmsDynamicContentRow | null> {
  const { id, actor_user_id = null } = input;
  const runTx = async (tx: PoolClient) => {
    const { rows: keyRows } = await query<{ key: string }>(
      tx,
      `SELECT key FROM cms_dynamic_content WHERE id = $1`,
      [id]
    );
    const key = keyRows[0]?.key;
    if (!key) return null;

    // For most keys we enforce single-published; banners can have multiple published entries.
    if (key !== "banner") {
      await query(
        tx,
        `UPDATE cms_dynamic_content
         SET status = 'DRAFT',
             published_at = NULL,
             published_by_user_id = NULL,
             updated_at = now(),
             updated_by_user_id = $1
         WHERE key = $2 AND status = 'PUBLISHED'`,
        [actor_user_id, key]
      );
    }

    const { rows } = await query<CmsDynamicContentRow>(
      tx,
      `UPDATE cms_dynamic_content
       SET status = 'PUBLISHED',
           published_at = now(),
           published_by_user_id = $1,
           updated_at = now(),
           updated_by_user_id = $1
       WHERE id = $2
       RETURNING
         id::int, key, title, body_markdown, status, variant, dismissible, starts_at, ends_at, created_at, updated_at, published_at,
         created_by_user_id, updated_by_user_id, published_by_user_id`,
      [actor_user_id, id]
    );
    return rows[0] ?? null;
  };

  const isPool = (c: DbClient): c is Pool => typeof (c as Pool).connect === "function";

  if (isPool(client)) {
    return await runInTransaction<CmsDynamicContentRow | null>(client, runTx);
  }

  // Already inside a transaction-capable client.
  await query(client, "BEGIN");
  try {
    const out = await runTx(client);
    await query(client, "COMMIT");
    return out;
  } catch (err) {
    await query(client, "ROLLBACK");
    throw err;
  }
}

export async function unpublishDynamicContent(
  client: DbClient,
  input: { key: string; actor_user_id?: number | null }
) {
  const { key, actor_user_id = null } = input;
  const { rows } = await query<CmsDynamicContentRow>(
    client,
    `UPDATE cms_dynamic_content
     SET status = 'DRAFT',
         published_at = NULL,
         published_by_user_id = NULL,
         updated_at = now(),
         updated_by_user_id = $1
     WHERE key = $2 AND status = 'PUBLISHED'
     RETURNING
       id::int, key, title, body_markdown, status, variant, dismissible, starts_at, ends_at, created_at, updated_at, published_at,
       created_by_user_id, updated_by_user_id, published_by_user_id`,
    [actor_user_id, key]
  );
  return rows[0] ?? null;
}
