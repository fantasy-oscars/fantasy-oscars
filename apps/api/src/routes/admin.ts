import express from "express";
import { AppError } from "../errors.js";
import { type DbClient, query, runInTransaction } from "../data/db.js";
import { AuthedRequest } from "../auth/middleware.js";
import { setActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import {
  lockCeremonyDraft,
  getCeremonyDraftLockedAt
} from "../data/repositories/ceremonyRepository.js";
import {
  listWinnersByCeremony,
  setWinnersForCategoryEdition
} from "../data/repositories/winnerRepository.js";
import {
  updateNominationStatus,
  insertNominationChangeAudit,
  listNominationsForCeremony
} from "../data/repositories/nominationRepository.js";
import {
  cancelDraftsForCeremony,
  hasDraftsStartedForCeremony
} from "../data/repositories/draftRepository.js";
import { loadNominees } from "../scripts/load-nominees.js";
import {
  buildTmdbImageUrlFromConfig,
  buildTmdbImageUrl,
  fetchTmdbMovieDetailsWithCredits,
  fetchTmdbPersonDetails,
  getTmdbImageConfig,
  parseReleaseYear
} from "../lib/tmdb.js";
import { getDraftBoardForCeremony } from "../domain/draftBoard.js";
import {
  emitCeremonyFinalized,
  emitCeremonyWinnersUpdated
} from "../realtime/ceremonyEvents.js";
import type { Pool } from "pg";
import { insertAdminAudit } from "../data/repositories/adminAuditRepository.js";
import type { Router } from "express";
import {
  createDynamicDraft,
  getStaticContentByKey,
  listDynamicContentByKey,
  publishDynamicContent,
  unpublishDynamicContent,
  updateDynamicDraft,
  upsertStaticContent
} from "../data/repositories/cmsRepository.js";

export function createAdminRouter(client: DbClient): Router {
  const router = express.Router();

  // Search helpers: case-insensitive + accent-insensitive matching (best-effort).
  // This must not change rendering, only which results match user queries.
  const SEARCH_TRANSLATE_FROM = "áàâäãåæçéèêëíìîïñóòôöõøœßúùûüýÿ";
  const SEARCH_TRANSLATE_TO = "aaaaaaaceeeeiiiinooooooosuuuuyy";
  function escapeLike(input: string) {
    return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
  }
  function normalizeForSearch(input: string) {
    return String(input ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
  function sqlNorm(exprSql: string) {
    return `translate(lower(${exprSql}), '${SEARCH_TRANSLATE_FROM}', '${SEARCH_TRANSLATE_TO}')`;
  }

  router.get(
    "/users",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q) return res.status(200).json({ users: [] });

        const likeRaw = `%${escapeLike(q)}%`;
        const likeNorm = `%${escapeLike(normalizeForSearch(q))}%`;
        const { rows } = await query(
          client,
          `SELECT id::int, username, email, is_admin, created_at
           FROM app_user
           WHERE username ILIKE $1 ESCAPE '\\'
              OR email ILIKE $1 ESCAPE '\\'
              OR ${sqlNorm("username")} LIKE $2 ESCAPE '\\'
              OR ${sqlNorm("coalesce(email, '')")} LIKE $2 ESCAPE '\\'
           ORDER BY created_at DESC
           LIMIT 25`,
          [likeRaw, likeNorm]
        );
        return res.status(200).json({ users: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/users/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid user id");
        }
        const { rows } = await query(
          client,
          `SELECT id::int, username, email, is_admin, created_at
           FROM app_user
           WHERE id = $1`,
          [id]
        );
        const user = rows[0];
        if (!user) throw new AppError("NOT_FOUND", 404, "User not found");
        return res.status(200).json({ user });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/users/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid user id");
        }
        if (typeof req.body?.is_admin !== "boolean") {
          throw new AppError("VALIDATION_FAILED", 400, "is_admin must be boolean");
        }
        const isAdmin = Boolean(req.body.is_admin);

        const { rows } = await query(
          client,
          `UPDATE app_user
           SET is_admin = $1
           WHERE id = $2
           RETURNING id::int, username, email, is_admin, created_at`,
          [isAdmin, id]
        );
        const user = rows[0];
        if (!user) throw new AppError("NOT_FOUND", 404, "User not found");

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: isAdmin ? "promote_admin" : "demote_admin",
            target_type: "user",
            target_id: user.id,
            meta: { username: user.username }
          });
        }
        return res.status(200).json({ user });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/content/static/:key",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        const content = await getStaticContentByKey(client, key);
        return res.status(200).json({ content });
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/content/static/:key",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        const title = typeof req.body?.title === "string" ? req.body.title : "";
        const body_markdown =
          typeof req.body?.body_markdown === "string" ? req.body.body_markdown : "";
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");

        const actorId = Number(req.auth?.sub);
        const content = await upsertStaticContent(client, {
          key,
          title,
          body_markdown,
          actor_user_id: actorId ? actorId : null
        });

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_static_upsert",
            target_type: "cms_static",
            target_id: null,
            meta: { key, title, body_length: body_markdown.length }
          });
        }

        return res.status(200).json({ content });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/content/dynamic/:key",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        const entries = await listDynamicContentByKey(client, key);
        return res.status(200).json({ entries });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/content/dynamic/:key/drafts",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        const title = typeof req.body?.title === "string" ? req.body.title : "";
        const body_markdown =
          typeof req.body?.body_markdown === "string" ? req.body.body_markdown : "";
        const variant =
          typeof req.body?.variant === "string"
            ? String(req.body.variant).toLowerCase()
            : undefined;
        const dismissible =
          typeof req.body?.dismissible === "boolean" ? req.body.dismissible : undefined;
        const starts_at =
          typeof req.body?.starts_at === "string" ? req.body.starts_at : undefined;
        const ends_at =
          typeof req.body?.ends_at === "string" ? req.body.ends_at : undefined;
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        const actorId = Number(req.auth?.sub);

        const draft = await createDynamicDraft(client, {
          key,
          title,
          body_markdown,
          variant:
            (variant as "info" | "warning" | "success" | "error" | undefined) ??
            undefined,
          dismissible,
          starts_at: starts_at ?? null,
          ends_at: ends_at ?? null,
          actor_user_id: actorId ? actorId : null
        });
        if (!draft) throw new AppError("INTERNAL_ERROR", 500, "Failed to create draft");

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_create_draft",
            target_type: "cms_dynamic",
            target_id: draft.id,
            meta: { key, title, body_length: body_markdown.length }
          });
        }

        return res.status(201).json({ draft });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/content/dynamic/:key/drafts/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        const id = Number(req.params.id);
        const title = typeof req.body?.title === "string" ? req.body.title : "";
        const body_markdown =
          typeof req.body?.body_markdown === "string" ? req.body.body_markdown : "";
        const variant =
          typeof req.body?.variant === "string"
            ? String(req.body.variant).toLowerCase()
            : undefined;
        const dismissible =
          typeof req.body?.dismissible === "boolean" ? req.body.dismissible : undefined;
        const starts_at =
          typeof req.body?.starts_at === "string" ? req.body.starts_at : undefined;
        const ends_at =
          typeof req.body?.ends_at === "string" ? req.body.ends_at : undefined;
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid draft id");
        }
        const actorId = Number(req.auth?.sub);

        const updated = await updateDynamicDraft(client, {
          id,
          title,
          body_markdown,
          variant:
            (variant as "info" | "warning" | "success" | "error" | undefined) ??
            undefined,
          dismissible,
          starts_at: starts_at ?? null,
          ends_at: ends_at ?? null,
          actor_user_id: actorId ? actorId : null
        });
        if (!updated) throw new AppError("NOT_FOUND", 404, "Draft not found");
        if (updated.key !== key) {
          throw new AppError("VALIDATION_FAILED", 400, "Draft key mismatch");
        }

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action:
              updated.status === "PUBLISHED"
                ? "cms_dynamic_update_published"
                : "cms_dynamic_update_draft",
            target_type: "cms_dynamic",
            target_id: updated.id,
            meta: { key, title, body_length: body_markdown.length }
          });
        }

        return res.status(200).json({ draft: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/content/dynamic/:key/entries/:id/unpublish",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        const id = Number(req.params.id);
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid entry id");
        }
        const actorId = Number(req.auth?.sub);

        const { rows } = await query(
          client,
          `UPDATE cms_dynamic_content
           SET status = 'DRAFT',
               published_at = NULL,
               published_by_user_id = NULL,
               updated_at = now(),
               updated_by_user_id = $1
           WHERE id = $2
           RETURNING id::int, key, title, status, published_at`,
          [actorId ? actorId : null, id]
        );
        const row = rows[0];
        if (!row) throw new AppError("NOT_FOUND", 404, "Entry not found");
        if (row.key !== key)
          throw new AppError("VALIDATION_FAILED", 400, "Entry key mismatch");

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_unpublish_entry",
            target_type: "cms_dynamic",
            target_id: row.id,
            meta: { key }
          });
        }

        return res.status(200).json({ entry: row });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/content/dynamic/:key/drafts/:id/publish",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        const id = Number(req.params.id);
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid draft id");
        }
        const actorId = Number(req.auth?.sub);
        const published = await publishDynamicContent(client, {
          id,
          actor_user_id: actorId ? actorId : null
        });
        if (!published) throw new AppError("NOT_FOUND", 404, "Draft not found");
        if (published.key !== key) {
          throw new AppError("VALIDATION_FAILED", 400, "Draft key mismatch");
        }

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_publish",
            target_type: "cms_dynamic",
            target_id: published.id,
            meta: { key, title: published.title }
          });
        }

        return res.status(200).json({ published });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/content/dynamic/:key/unpublish",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        const actorId = Number(req.auth?.sub);
        const updated = await unpublishDynamicContent(client, {
          key,
          actor_user_id: actorId ? actorId : null
        });
        if (!updated) return res.status(200).json({ unpublished: null });

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_unpublish",
            target_type: "cms_dynamic",
            target_id: updated.id,
            meta: { key, title: updated.title }
          });
        }

        return res.status(200).json({ unpublished: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/content/dynamic/:key/entries/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const key = String(req.params.key ?? "").trim();
        const id = Number(req.params.id);
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid entry id");
        }
        const actorId = Number(req.auth?.sub);

        const { rows: deletedRows } = await query<{ id: number }>(
          client,
          `DELETE FROM cms_dynamic_content
           WHERE id = $1 AND key = $2 AND status = 'DRAFT'
           RETURNING id::int`,
          [id, key]
        );
        const deleted = deletedRows[0];
        if (!deleted) {
          const { rows } = await query<{ status: string }>(
            client,
            `SELECT status FROM cms_dynamic_content WHERE id = $1 AND key = $2`,
            [id, key]
          );
          const status = rows[0]?.status;
          if (status === "PUBLISHED") {
            throw new AppError(
              "CANNOT_DELETE_PUBLISHED",
              409,
              "Cannot delete a published entry. Unpublish it first."
            );
          }
          throw new AppError("NOT_FOUND", 404, "Entry not found");
        }

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_delete_entry",
            target_type: "cms_dynamic",
            target_id: deleted.id,
            meta: { key }
          });
        }

        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies",
    async (_req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { rows } = await query(
          client,
          `SELECT id::int, code, name, year, starts_at, status
           FROM ceremony
           ORDER BY starts_at DESC NULLS LAST, id DESC`
        );
        return res.status(200).json({ ceremonies: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/drafts",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { rows } = await query(
          client,
          `INSERT INTO ceremony (code, name, year, starts_at, status, published_at, archived_at)
           VALUES (NULL, NULL, NULL, NULL, 'DRAFT', NULL, NULL)
           RETURNING id::int, code, name, year, starts_at, status`,
          []
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_ceremony_draft",
            target_type: "ceremony",
            target_id: ceremony.id,
            meta: {}
          });
        }

        return res.status(201).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/ceremonies/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CANNOT_DELETE",
              409,
              "Only draft ceremonies can be deleted. Archive instead."
            );
          }

          // Pre-launch behavior: deleting an unpublished ceremony should cascade
          // to all dependent rows (seasons/drafts, categories, nominations, etc.).
          // We'll revisit a safer, explicit flow for published ceremonies later.

          // Detach any pointers to this ceremony.
          await query(
            tx,
            `UPDATE app_config SET active_ceremony_id = NULL WHERE active_ceremony_id = $1`,
            [id]
          );
          await query(tx, `UPDATE league SET ceremony_id = NULL WHERE ceremony_id = $1`, [
            id
          ]);

          // Delete any seasons (will cascade to drafts, invites, members).
          await query(tx, `DELETE FROM season WHERE ceremony_id = $1`, [id]);

          // Winners (normally none for DRAFT, but safe).
          await query(tx, `DELETE FROM ceremony_winner WHERE ceremony_id = $1`, [id]);

          // Delete nominations + related tables, then categories.
          await query(
            tx,
            `DELETE FROM nomination_change_audit
             WHERE nomination_id IN (
               SELECT n.id
               FROM nomination n
               JOIN category_edition ce ON ce.id = n.category_edition_id
               WHERE ce.ceremony_id = $1
             )`,
            [id]
          );
          await query(
            tx,
            `DELETE FROM nomination_contributor
             WHERE nomination_id IN (
               SELECT n.id
               FROM nomination n
               JOIN category_edition ce ON ce.id = n.category_edition_id
               WHERE ce.ceremony_id = $1
             )`,
            [id]
          );
          await query(
            tx,
            `DELETE FROM nomination
             WHERE category_edition_id IN (SELECT id FROM category_edition WHERE ceremony_id = $1)`,
            [id]
          );
          await query(tx, `DELETE FROM category_edition WHERE ceremony_id = $1`, [id]);

          // Finally delete the ceremony itself.
          await query(tx, `DELETE FROM ceremony WHERE id = $1`, [id]);
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "delete_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows } = await query(
          client,
          `SELECT
             id::int,
             code,
             name,
             year,
             starts_at,
             status,
             draft_warning_hours::int,
             draft_locked_at,
             published_at,
             archived_at
           FROM ceremony
           WHERE id = $1`,
          [id]
        );
        const ceremony = rows[0];
        if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

        const { rows: statsRows } = await query<{
          categories_total: number;
          categories_with_nominees: number;
          nominees_total: number;
          winners_total: number;
        }>(
          client,
          `WITH cats AS (
             SELECT ce.id
             FROM category_edition ce
             WHERE ce.ceremony_id = $1
           ),
           nom AS (
             SELECT n.category_edition_id
             FROM nomination n
             JOIN cats ON cats.id = n.category_edition_id
             WHERE n.status = 'ACTIVE'
           )
           SELECT
             (SELECT COUNT(*)::int FROM cats) AS categories_total,
             (SELECT COUNT(DISTINCT category_edition_id)::int FROM nom) AS categories_with_nominees,
             (SELECT COUNT(*)::int FROM nom) AS nominees_total,
             (SELECT COUNT(*)::int FROM ceremony_winner WHERE ceremony_id = $1) AS winners_total`,
          [id]
        );
        const stats = statsRows[0] ?? {
          categories_total: 0,
          categories_with_nominees: 0,
          nominees_total: 0,
          winners_total: 0
        };

        return res.status(200).json({ ceremony, stats });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies/:id/draft-board",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        // Ensure ceremony exists (and avoid leaking row-level information).
        const { rows } = await query<{ id: number }>(
          client,
          `SELECT id::int FROM ceremony WHERE id = $1`,
          [id]
        );
        if (!rows[0]) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

        const board = await getDraftBoardForCeremony(client, id);
        return res.status(200).json(board);
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/ceremonies/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const name =
          typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
        const code =
          typeof req.body?.code === "string" ? req.body.code.trim() : undefined;
        const startsAtRaw = req.body?.starts_at;
        const startsAt =
          typeof startsAtRaw === "string" && startsAtRaw.trim()
            ? new Date(startsAtRaw)
            : startsAtRaw === null
              ? null
              : undefined;
        const warningHoursRaw = req.body?.draft_warning_hours;
        const warningHours =
          warningHoursRaw === undefined ? undefined : Number(warningHoursRaw);

        if (code !== undefined) {
          if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
          if (!/^[a-z0-9-]+$/.test(code)) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Code must be lowercase letters/numbers/dashes only"
            );
          }
        }
        if (name !== undefined && !name) {
          throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        }
        if (startsAt && startsAt instanceof Date && Number.isNaN(startsAt.getTime())) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid starts_at timestamp");
        }
        if (
          warningHours !== undefined &&
          (!Number.isInteger(warningHours) || warningHours < 0 || warningHours > 24 * 14)
        ) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid draft_warning_hours");
        }

        const { rows: beforeRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [id]
        );
        const status = beforeRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status === "ARCHIVED") {
          throw new AppError(
            "CEREMONY_ARCHIVED",
            409,
            "Archived ceremonies are read-only"
          );
        }

        const updates: string[] = [];
        const params: unknown[] = [id];
        function push(fieldSql: string, value: unknown) {
          updates.push(fieldSql.replace("$X", `$${params.length + 1}`));
          params.push(value);
        }

        if (code !== undefined) push(`code = $X`, code);
        if (name !== undefined) push(`name = $X`, name);
        if (startsAt !== undefined) {
          push(
            `starts_at = $X`,
            startsAt instanceof Date ? startsAt.toISOString() : startsAt
          );
        }
        if (warningHours !== undefined) push(`draft_warning_hours = $X`, warningHours);

        if (updates.length === 0) {
          throw new AppError("VALIDATION_FAILED", 400, "No fields to update");
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET ${updates.join(", ")}
           WHERE id = $1
           RETURNING id::int, code, name, year, starts_at, status, draft_warning_hours::int, draft_locked_at, published_at, archived_at`,
          params
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "update_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: { fields: Object.keys(req.body ?? {}) }
          });
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        // Unique constraint violation on ceremony.code
        if ((err as { code?: string })?.code === "23505") {
          next(new AppError("VALIDATION_FAILED", 400, "Ceremony code already exists"));
          return;
        }
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/publish",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows: ceremonyRows } = await query<{
          status: string;
          code: string | null;
          name: string | null;
        }>(client, `SELECT status, code, name FROM ceremony WHERE id = $1`, [id]);
        const row = ceremonyRows[0];
        const status = row?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Only draft ceremonies can be published"
          );
        }
        if (!row?.code || !row.code.trim() || !row?.name || !row.name.trim()) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "Code and name are required to publish"
          );
        }

        const { rows: statsRows } = await query<{
          categories_total: number;
          categories_with_nominees: number;
        }>(
          client,
          `WITH cats AS (
             SELECT ce.id
             FROM category_edition ce
             WHERE ce.ceremony_id = $1
           ),
           nom AS (
             SELECT DISTINCT n.category_edition_id
             FROM nomination n
             JOIN cats ON cats.id = n.category_edition_id
             WHERE n.status = 'ACTIVE'
           )
           SELECT
             (SELECT COUNT(*)::int FROM cats) AS categories_total,
             (SELECT COUNT(*)::int FROM nom) AS categories_with_nominees`,
          [id]
        );
        const stats = statsRows[0] ?? {
          categories_total: 0,
          categories_with_nominees: 0
        };
        if (stats.categories_total === 0) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "No categories exist for this ceremony"
          );
        }
        if (stats.categories_with_nominees !== stats.categories_total) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "All categories must have nominees before publishing"
          );
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET status = 'PUBLISHED',
               published_at = COALESCE(published_at, now())
           WHERE id = $1
           RETURNING id::int, code, name, year, starts_at, status, published_at`,
          [id]
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "publish_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/lock",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status === "ARCHIVED") {
            throw new AppError(
              "CEREMONY_ARCHIVED",
              409,
              "Archived ceremonies cannot be locked"
            );
          }
          if (status !== "PUBLISHED" && status !== "LOCKED") {
            throw new AppError(
              "CEREMONY_NOT_PUBLISHED",
              409,
              "Only published ceremonies can be locked"
            );
          }

          const lockedAtBefore = await getCeremonyDraftLockedAt(tx, id);
          const lockedAt =
            lockedAtBefore ?? (await lockCeremonyDraft(tx, id)) ?? lockedAtBefore;

          const { rows: updatedRows } = await query(
            tx,
            `UPDATE ceremony
             SET status = 'LOCKED'
             WHERE id = $1
             RETURNING id::int, status`,
            [id]
          );
          void updatedRows;

          const cancelled = await cancelDraftsForCeremony(tx, id);

          return { draft_locked_at: lockedAt, cancelled_count: cancelled.length };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "lock_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: { cancelled_drafts: result.cancelled_count }
          });
        }

        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/archive",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [id]
        );
        const status = ceremonyRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "LOCKED") {
          throw new AppError(
            "CEREMONY_NOT_LOCKED",
            409,
            "Ceremony must be locked before archiving"
          );
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET status = 'ARCHIVED',
               archived_at = COALESCE(archived_at, now())
           WHERE id = $1
           RETURNING id::int, status, archived_at`,
          [id]
        );

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "archive_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(200).json({ ceremony: rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies/:id/nominations",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        const nominations = await listNominationsForCeremony(client, ceremonyId);
        return res.status(200).json({ nominations });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/nominations",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const categoryEditionId = Number(req.body?.category_edition_id);
        if (!Number.isInteger(categoryEditionId) || categoryEditionId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "category_edition_id is required");
        }

        const filmIdRaw = req.body?.film_id;
        const filmId =
          typeof filmIdRaw === "number"
            ? filmIdRaw
            : typeof filmIdRaw === "string" && filmIdRaw.trim()
              ? Number(filmIdRaw)
              : null;
        const filmTitle =
          typeof req.body?.film_title === "string" ? req.body.film_title.trim() : "";
        const songTitle =
          typeof req.body?.song_title === "string" ? req.body.song_title.trim() : "";

        const contributorsRaw = req.body?.contributors;
        const contributors = Array.isArray(contributorsRaw)
          ? (contributorsRaw as unknown[])
              .filter((c) => c && typeof c === "object")
              .map((c) => c as Record<string, unknown>)
          : [];

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be edited while the ceremony is in draft"
            );
          }
          const draftsStarted = await hasDraftsStartedForCeremony(tx, ceremonyId);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          const { rows: catRows } = await query<{ unit_kind: string }>(
            tx,
            `SELECT ce.unit_kind
             FROM category_edition ce
             WHERE ce.id = $1 AND ce.ceremony_id = $2`,
            [categoryEditionId, ceremonyId]
          );
          const unitKind = catRows[0]?.unit_kind;
          if (!unitKind)
            throw new AppError("NOT_FOUND", 404, "Category not found for ceremony");

          // Resolve the film.
          let resolvedFilmId: number | null = null;
          if (filmId && Number.isFinite(filmId)) {
            const { rows } = await query<{ id: number }>(
              tx,
              `SELECT id::int FROM film WHERE id = $1`,
              [Number(filmId)]
            );
            if (!rows[0]?.id) throw new AppError("NOT_FOUND", 404, "Film not found");
            resolvedFilmId = rows[0].id;
          } else if (filmTitle) {
            const { rows } = await query<{ id: number }>(
              tx,
              `INSERT INTO film (title, country) VALUES ($1, NULL) RETURNING id::int`,
              [filmTitle]
            );
            resolvedFilmId = rows[0]?.id ?? null;
          } else {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "film_id or film_title is required",
              { fields: ["film_id", "film_title"] }
            );
          }

          if (!resolvedFilmId)
            throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve film");

          let nominationId: number | null = null;
          const { rows: sortRows } = await query<{ max: number | null }>(
            tx,
            `SELECT COALESCE(MAX(sort_order), -1)::int AS max
             FROM nomination
             WHERE category_edition_id = $1`,
            [categoryEditionId]
          );
          const nextSortOrder = (sortRows[0]?.max ?? -1) + 1;

          if (unitKind === "SONG") {
            if (!songTitle) {
              throw new AppError("VALIDATION_FAILED", 400, "song_title is required", {
                fields: ["song_title"]
              });
            }
            const { rows: songRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO song (title, film_id) VALUES ($1, $2) RETURNING id::int`,
              [songTitle, resolvedFilmId]
            );
            const songId = songRows[0]?.id ?? null;
            if (!songId)
              throw new AppError("INTERNAL_ERROR", 500, "Failed to create song");

            const { rows: nomRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO nomination (category_edition_id, song_id, sort_order)
               VALUES ($1, $2, $3)
               RETURNING id::int`,
              [categoryEditionId, songId, nextSortOrder]
            );
            nominationId = nomRows[0]?.id ?? null;
          } else if (unitKind === "PERFORMANCE") {
            // Performance-style categories are film-scoped, but the nominees are people pulled from
            // the film's credits. A single nomination can include multiple people (ties / duos / groups).
            if (contributors.length < 1) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "Performance categories require at least one contributor",
                { fields: ["contributors"] }
              );
            }
            const { rows: nomRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO nomination (category_edition_id, film_id, sort_order)
               VALUES ($1, $2, $3)
               RETURNING id::int`,
              [categoryEditionId, resolvedFilmId, nextSortOrder]
            );
            nominationId = nomRows[0]?.id ?? null;
          } else {
            // FILM default.
            const { rows: nomRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO nomination (category_edition_id, film_id, sort_order)
               VALUES ($1, $2, $3)
               RETURNING id::int`,
              [categoryEditionId, resolvedFilmId, nextSortOrder]
            );
            nominationId = nomRows[0]?.id ?? null;
          }

          if (!nominationId)
            throw new AppError("INTERNAL_ERROR", 500, "Failed to create nomination");

          // Contributors (people) can be attached to any nomination (e.g. directors, producers, songwriters).
          // For PERFORMANCE categories, at least one is required.
          if (contributors.length > 0) {
            let sort = 0;
            for (const c of contributors) {
              const personName = typeof c.name === "string" ? c.name.trim() : "";
              if (!personName) continue;
              const tmdbIdRaw = c.tmdb_id;
              const tmdbId =
                typeof tmdbIdRaw === "number"
                  ? tmdbIdRaw
                  : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                    ? Number(tmdbIdRaw)
                    : null;
              const roleLabel =
                typeof c.role_label === "string" ? c.role_label.trim() : null;

              const { rows: personRows } = await query<{ id: number }>(
                tx,
                tmdbId && Number.isFinite(tmdbId)
                  ? `INSERT INTO person (full_name, tmdb_id, external_ids, updated_at)
                     VALUES ($1, $2::int, jsonb_build_object('tmdb_id', $2::int), now())
                     ON CONFLICT (tmdb_id)
                     DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()
                     RETURNING id::int`
                  : `INSERT INTO person (full_name) VALUES ($1) RETURNING id::int`,
                tmdbId && Number.isFinite(tmdbId)
                  ? [personName, Number(tmdbId)]
                  : [personName]
              );
              const personId = personRows[0]?.id ?? null;
              if (!personId) continue;

              // Best-effort: if this is a performance nomination and no role label was supplied,
              // try to infer the character name from the film's stored TMDB credits.
              let inferredRole: string | null = roleLabel;
              if (
                !inferredRole &&
                unitKind === "PERFORMANCE" &&
                tmdbId &&
                Number.isFinite(tmdbId)
              ) {
                try {
                  const { rows: filmRows } = await query<{ tmdb_credits: unknown }>(
                    tx,
                    `SELECT tmdb_credits FROM film WHERE id = $1`,
                    [resolvedFilmId]
                  );
                  const credits = filmRows[0]?.tmdb_credits as
                    | {
                        cast?: Array<{
                          id?: number;
                          tmdb_id?: number;
                          character?: string | null;
                          profile_path?: string | null;
                        }>;
                      }
                    | null
                    | undefined;
                  const cast = Array.isArray(credits?.cast) ? credits!.cast! : [];
                  const match = cast.find(
                    (p) => Number(p?.tmdb_id ?? p?.id) === Number(tmdbId)
                  );
                  const character =
                    typeof match?.character === "string" ? match.character.trim() : "";
                  inferredRole = character ? character : null;

                  // If the person doesn't have a profile image yet, use the film credits profile_path.
                  const profilePath =
                    typeof match?.profile_path === "string" ? match.profile_path : null;
                  if (profilePath) {
                    const { rows: existingRows } = await query<{
                      profile_url: string | null;
                      profile_path: string | null;
                    }>(tx, `SELECT profile_url, profile_path FROM person WHERE id = $1`, [
                      personId
                    ]);
                    const existing = existingRows[0];
                    if (!existing?.profile_url && !existing?.profile_path) {
                      const profileUrl = await buildTmdbImageUrl(
                        "profile",
                        profilePath,
                        "w185"
                      );
                      await query(
                        tx,
                        `UPDATE person
                         SET profile_path = $2,
                             profile_url = $3,
                             updated_at = now()
                         WHERE id = $1`,
                        [personId, profilePath, profileUrl]
                      );
                    }
                  }
                } catch {
                  // Ignore; role label is optional and should not block nominee creation.
                }
              }

              // Best-effort: hydrate person profile image from TMDB when we have a tmdb_id.
              if (tmdbId && Number.isFinite(tmdbId)) {
                try {
                  const { rows: existingRows } = await query<{
                    profile_url: string | null;
                    profile_path: string | null;
                  }>(tx, `SELECT profile_url, profile_path FROM person WHERE id = $1`, [
                    personId
                  ]);
                  const existing = existingRows[0];
                  if (!existing?.profile_url && !existing?.profile_path) {
                    const details = await fetchTmdbPersonDetails(Number(tmdbId));
                    const profilePath = details?.profile_path ?? null;
                    const profileUrl = await buildTmdbImageUrl(
                      "profile",
                      profilePath,
                      "w185"
                    );
                    await query(
                      tx,
                      `UPDATE person
                       SET profile_path = $2,
                           profile_url = $3,
                           updated_at = now()
                       WHERE id = $1`,
                      [personId, profilePath, profileUrl]
                    );
                  }
                } catch {
                  // Ignore; person image is a convenience, not a requirement.
                }
              }

              await query(
                tx,
                `INSERT INTO nomination_contributor (nomination_id, person_id, role_label, sort_order)
                 VALUES ($1, $2, $3, $4)`,
                [nominationId, personId, inferredRole, sort]
              );
              sort += 1;
            }
          } else if (unitKind === "PERFORMANCE") {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Performance categories require at least one contributor",
              { fields: ["contributors"] }
            );
          }

          return { nomination_id: nominationId };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_nomination_manual",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: {
              category_edition_id: categoryEditionId,
              nomination_id: result.nomination_id
            }
          });
        }

        return res.status(201).json({ ok: true, ...result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/ceremonies/:id/nominations/reorder",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const categoryEditionId = Number(req.body?.category_edition_id);
        if (!Number.isInteger(categoryEditionId) || categoryEditionId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "category_edition_id is required");
        }

        const idsRaw = req.body?.nomination_ids;
        const nominationIds = Array.isArray(idsRaw)
          ? idsRaw
              .map((v) =>
                typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
              )
              .filter((n) => Number.isInteger(n) && n > 0)
          : [];

        if (nominationIds.length < 1) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "nomination_ids must include at least one nomination id"
          );
        }

        await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be edited while the ceremony is in draft"
            );
          }

          const draftsStarted = await hasDraftsStartedForCeremony(tx, ceremonyId);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          const { rows: catRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int
             FROM category_edition
             WHERE id = $1 AND ceremony_id = $2`,
            [categoryEditionId, ceremonyId]
          );
          if (!catRows[0]?.id) {
            throw new AppError("NOT_FOUND", 404, "Category not found for ceremony");
          }

          const { rows: existingRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int
             FROM nomination
             WHERE category_edition_id = $1
               AND id = ANY($2::bigint[])`,
            [categoryEditionId, nominationIds]
          );
          if (existingRows.length !== nominationIds.length) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "All nomination_ids must belong to the selected category",
              { fields: ["nomination_ids"] }
            );
          }

          for (let i = 0; i < nominationIds.length; i += 1) {
            await query(
              tx,
              `UPDATE nomination
               SET sort_order = $2
               WHERE id = $1 AND category_edition_id = $3`,
              [nominationIds[i], i, categoryEditionId]
            );
          }
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "reorder_nominations",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: {
              category_edition_id: categoryEditionId,
              nomination_ids: nominationIds
            }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies/:id/winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        const winners = await listWinnersByCeremony(client, ceremonyId);
        return res.status(200).json({ winners });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies/:id/lock",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        const { rows } = await query<{ status: string; draft_locked_at: Date | null }>(
          client,
          `SELECT status, draft_locked_at FROM ceremony WHERE id = $1`,
          [ceremonyId]
        );
        const row = rows[0];
        if (!row) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        return res.status(200).json({
          status: row.status,
          draft_locked: Boolean(row.draft_locked_at) || row.status === "LOCKED",
          draft_locked_at: row.draft_locked_at ?? null
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/icons",
    async (_req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { rows } = await query(
          client,
          `SELECT id::int, code, name, asset_path
           FROM icon
           ORDER BY code ASC`
        );
        return res.status(200).json({ icons: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/icons",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
        if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
        if (!/^[a-z0-9-]+$/.test(code)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Icon code must be lowercase letters/numbers/dashes only"
          );
        }

        // Find-or-create.
        const { rows: existingRows } = await query<{ id: number; code: string }>(
          client,
          `SELECT id::int, code FROM icon WHERE code = $1`,
          [code]
        );
        if (existingRows[0]) return res.status(200).json({ icon: existingRows[0] });

        const { rows } = await query<{ id: number; code: string }>(
          client,
          `INSERT INTO icon (code, name, asset_path)
           VALUES ($1, NULL, NULL)
           RETURNING id::int, code`,
          [code]
        );
        const icon = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_icon",
            target_type: "icon",
            target_id: icon.id,
            meta: { code }
          });
        }

        return res.status(201).json({ icon });
      } catch (err) {
        // Unique constraint violation on icon.code
        if ((err as { code?: string })?.code === "23505") {
          const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
          const { rows } = await query<{ id: number; code: string }>(
            client,
            `SELECT id::int, code FROM icon WHERE code = $1`,
            [code]
          );
          if (rows[0]) return res.status(200).json({ icon: rows[0] });
        }
        next(err);
      }
    }
  );

  router.get(
    "/category-families",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const q = normalizeForSearch(qRaw);
        const like = q ? `%${escapeLike(q)}%` : null;
        const { rows } = await query(
          client,
          `SELECT
             cf.id::int,
             cf.code,
             cf.name,
             cf.default_unit_kind,
             cf.icon_id::int,
             cf.icon_variant,
             i.code AS icon_code
           FROM category_family cf
           JOIN icon i ON i.id = cf.icon_id
           WHERE ${like ? `(${sqlNorm("cf.code")} LIKE $1 ESCAPE '\\\\' OR ${sqlNorm("cf.name")} LIKE $1 ESCAPE '\\\\')` : "TRUE"}
           ORDER BY cf.code ASC
           LIMIT 200`,
          like ? [like] : []
        );
        return res.status(200).json({ families: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/category-families",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        const unitKindRaw = req.body?.default_unit_kind;
        const default_unit_kind =
          typeof unitKindRaw === "string" ? String(unitKindRaw).toUpperCase() : "";
        const iconCode = typeof req.body?.icon === "string" ? req.body.icon.trim() : "";
        const iconVariantRaw = req.body?.icon_variant;
        const icon_variant =
          typeof iconVariantRaw === "string" ? iconVariantRaw.trim() : "default";
        const iconIdRaw = req.body?.icon_id;
        const icon_id =
          iconIdRaw === undefined || iconIdRaw === null ? null : Number(iconIdRaw);

        if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
        if (!/^[a-z0-9-]+$/.test(code)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Code must be lowercase letters/numbers/dashes only"
          );
        }
        if (!name) throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        if (!["FILM", "SONG", "PERFORMANCE"].includes(default_unit_kind)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid default_unit_kind");
        }
        if (!["default", "inverted"].includes(icon_variant)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_variant");
        }

        let resolvedIconId: number | null = null;
        if (iconCode) {
          if (!/^[a-z0-9-_]+$/.test(iconCode)) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Icon must be lowercase letters/numbers/dashes/underscores only"
            );
          }
          const { rows: iconRows } = await query<{ id: number }>(
            client,
            `INSERT INTO icon (code, name, asset_path)
             VALUES ($1, NULL, NULL)
             ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
             RETURNING id::int`,
            [iconCode]
          );
          resolvedIconId = iconRows[0]?.id ?? null;
        } else if (icon_id !== null) {
          if (!Number.isInteger(icon_id) || icon_id <= 0) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_id");
          }
          resolvedIconId = icon_id;
        } else {
          throw new AppError("VALIDATION_FAILED", 400, "Icon is required");
        }

        const { rows } = await query(
          client,
          `INSERT INTO category_family (code, name, icon_id, icon_variant, default_unit_kind)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id::int, code, name, icon_id::int, icon_variant, default_unit_kind`,
          [code, name, resolvedIconId, icon_variant, default_unit_kind]
        );
        const family = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_category_family",
            target_type: "category_family",
            target_id: family.id,
            meta: {
              code,
              name,
              icon: iconCode || resolvedIconId,
              icon_variant,
              default_unit_kind
            }
          });
        }

        return res.status(201).json({ family });
      } catch (err) {
        // Unique constraint violation on category_family.code
        if ((err as { code?: string })?.code === "23505") {
          next(new AppError("VALIDATION_FAILED", 400, "Category code already exists"));
          return;
        }
        next(err);
      }
    }
  );

  router.patch(
    "/category-families/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category id");
        }

        const code =
          typeof req.body?.code === "string" ? req.body.code.trim() : undefined;
        const name =
          typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
        const unitKindRaw = req.body?.default_unit_kind;
        const default_unit_kind =
          unitKindRaw === undefined
            ? undefined
            : typeof unitKindRaw === "string"
              ? String(unitKindRaw).toUpperCase()
              : "";
        const iconCode =
          typeof req.body?.icon === "string" ? req.body.icon.trim() : undefined;
        const iconVariantRaw = req.body?.icon_variant;
        const icon_variant =
          iconVariantRaw === undefined
            ? undefined
            : typeof iconVariantRaw === "string"
              ? iconVariantRaw.trim()
              : "";

        if (code !== undefined) {
          if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
          if (!/^[a-z0-9-]+$/.test(code)) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Code must be lowercase letters/numbers/dashes only"
            );
          }
        }
        if (name !== undefined && !name) {
          throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        }
        if (default_unit_kind !== undefined) {
          if (!["FILM", "SONG", "PERFORMANCE"].includes(default_unit_kind)) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid default_unit_kind");
          }
        }
        if (icon_variant !== undefined) {
          if (!["default", "inverted"].includes(icon_variant)) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_variant");
          }
        }

        let resolvedIconId: number | null = null;
        if (iconCode !== undefined) {
          if (!iconCode) throw new AppError("VALIDATION_FAILED", 400, "Icon is required");
          if (!/^[a-z0-9-_]+$/.test(iconCode)) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Icon must be lowercase letters/numbers/dashes/underscores only"
            );
          }
          const { rows: iconRows } = await query<{ id: number }>(
            client,
            `INSERT INTO icon (code, name, asset_path)
             VALUES ($1, NULL, NULL)
             ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
             RETURNING id::int`,
            [iconCode]
          );
          resolvedIconId = iconRows[0]?.id ?? null;
          if (!resolvedIconId) {
            throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve icon");
          }
        }

        const updates: string[] = [];
        const params: unknown[] = [id];
        function push(fieldSql: string, value: unknown) {
          updates.push(fieldSql.replace("$X", `$${params.length + 1}`));
          params.push(value);
        }

        if (code !== undefined) push(`code = $X`, code);
        if (name !== undefined) push(`name = $X`, name);
        if (default_unit_kind !== undefined)
          push(`default_unit_kind = $X`, default_unit_kind);
        if (resolvedIconId !== null) push(`icon_id = $X`, resolvedIconId);
        if (icon_variant !== undefined) push(`icon_variant = $X`, icon_variant);

        if (updates.length === 0) {
          throw new AppError("VALIDATION_FAILED", 400, "No fields to update");
        }

        const { rows } = await query(
          client,
          `UPDATE category_family
           SET ${updates.join(", ")}
           WHERE id = $1
           RETURNING id::int, code, name, icon_id::int, icon_variant, default_unit_kind`,
          params
        );
        const family = rows[0];
        if (!family) throw new AppError("NOT_FOUND", 404, "Category template not found");

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "update_category_family",
            target_type: "category_family",
            target_id: family.id,
            meta: { fields: Object.keys(req.body ?? {}) }
          });
        }

        return res.status(200).json({ family });
      } catch (err) {
        if ((err as { code?: string })?.code === "23505") {
          next(new AppError("VALIDATION_FAILED", 400, "Category code already exists"));
          return;
        }
        next(err);
      }
    }
  );

  router.delete(
    "/category-families/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category template id");
        }

        const { rows } = await query<{ id: number; code: string; name: string }>(
          client,
          `DELETE FROM category_family
           WHERE id = $1
           RETURNING id::int, code, name`,
          [id]
        );
        const deleted = rows[0];
        if (!deleted) {
          throw new AppError("NOT_FOUND", 404, "Category template not found");
        }

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "delete_category_family",
            target_type: "category_family",
            target_id: deleted.id,
            meta: { code: deleted.code, name: deleted.name }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/categories/clone",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        const fromCeremonyId = Number(req.body?.from_ceremony_id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        if (!Number.isInteger(fromCeremonyId) || fromCeremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid from_ceremony_id");
        }
        if (ceremonyId === fromCeremonyId) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Cannot clone from the same ceremony"
          );
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Categories can only be edited while the ceremony is in draft"
            );
          }

          const { rows: nomCountRows } = await query<{ count: string }>(
            tx,
            `SELECT COUNT(*)::int AS count
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             WHERE ce.ceremony_id = $1 AND n.status = 'ACTIVE'`,
            [ceremonyId]
          );
          const nomineeCount = Number(nomCountRows[0]?.count ?? 0);
          if (nomineeCount > 0) {
            throw new AppError(
              "CEREMONY_HAS_NOMINEES",
              409,
              "Cannot clone categories after nominees exist. Remove nominees first."
            );
          }

          // Replace the entire category set.
          await query(tx, `DELETE FROM category_edition WHERE ceremony_id = $1`, [
            ceremonyId
          ]);

          const { rowCount } = await query(
            tx,
            `INSERT INTO category_edition
               (ceremony_id, family_id, code, name, unit_kind, icon_id, icon_variant, sort_index)
             SELECT
               $1,
               ce.family_id,
               ce.code,
               ce.name,
               ce.unit_kind,
               ce.icon_id,
               ce.icon_variant,
               ce.sort_index
             FROM category_edition ce
             WHERE ce.ceremony_id = $2
             ORDER BY ce.sort_index ASC, ce.id ASC`,
            [ceremonyId, fromCeremonyId]
          );

          return { inserted: rowCount ?? 0 };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "clone_ceremony_categories",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { from_ceremony_id: fromCeremonyId, inserted: result.inserted }
          });
        }

        return res.status(200).json({ ok: true, inserted: result.inserted });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies/:id/categories",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows: ceremonyRows } = await query<{
          id: number;
          status: string;
          code: string | null;
          name: string | null;
        }>(client, `SELECT id::int, status, code, name FROM ceremony WHERE id = $1`, [
          ceremonyId
        ]);
        const ceremony = ceremonyRows[0];
        if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

        const { rows } = await query(
          client,
          `SELECT
             ce.id::int,
             ce.family_id::int,
             ce.code AS family_code,
             ce.name AS family_name,
             ce.unit_kind,
             ce.icon_id::int,
             ce.icon_variant,
             ce.sort_index::int,
             i.code AS icon_code,
             ce.unit_kind AS family_default_unit_kind,
             ce.icon_id::int AS family_icon_id,
             ce.icon_variant AS family_icon_variant,
             i.code AS family_icon_code
           FROM category_edition ce
           LEFT JOIN icon i ON i.id = ce.icon_id
           WHERE ce.ceremony_id = $1
           ORDER BY ce.sort_index ASC, ce.id ASC`,
          [ceremonyId]
        );

        return res.status(200).json({ ceremony, categories: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/categories",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const familyIdRaw = req.body?.family_id;
        const familyId =
          familyIdRaw === undefined || familyIdRaw === null ? null : Number(familyIdRaw);
        if (!familyId || !Number.isInteger(familyId) || familyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "family_id is required");
        }

        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [ceremonyId]
        );
        const status = ceremonyRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Categories can only be edited while the ceremony is in draft"
          );
        }

        const unitKind =
          typeof req.body?.unit_kind === "string"
            ? String(req.body.unit_kind).toUpperCase()
            : null;
        const iconCode = typeof req.body?.icon === "string" ? req.body.icon.trim() : "";
        const iconIdRaw = req.body?.icon_id;
        const iconId =
          iconIdRaw === undefined || iconIdRaw === null ? null : Number(iconIdRaw);
        const sortIndexRaw = req.body?.sort_index;
        const sortIndex =
          sortIndexRaw === undefined || sortIndexRaw === null
            ? null
            : Number(sortIndexRaw);

        const { rows: familyRows } = await query<{
          code: string;
          name: string;
          icon_variant: string;
          default_unit_kind: string;
          icon_id: number;
        }>(
          client,
          `SELECT code, name, icon_variant, default_unit_kind, icon_id::int AS icon_id
           FROM category_family
           WHERE id = $1`,
          [familyId]
        );
        const fam = familyRows[0];
        if (!fam) throw new AppError("NOT_FOUND", 404, "Category template not found");

        const finalUnitKind = unitKind ?? String(fam.default_unit_kind).toUpperCase();
        if (!["FILM", "SONG", "PERFORMANCE"].includes(finalUnitKind)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid unit_kind");
        }
        let resolvedIconId = fam.icon_id;
        if (iconCode) {
          if (!/^[a-z0-9-]+$/.test(iconCode)) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Icon must be lowercase letters/numbers/dashes only"
            );
          }
          const { rows: iconRows } = await query<{ id: number }>(
            client,
            `INSERT INTO icon (code, name, asset_path)
             VALUES ($1, NULL, NULL)
             ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
             RETURNING id::int`,
            [iconCode]
          );
          resolvedIconId = iconRows[0]?.id ?? fam.icon_id;
        } else if (iconId !== null) {
          if (!Number.isInteger(iconId) || iconId <= 0) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_id");
          }
          resolvedIconId = iconId;
        }
        let resolvedSortIndex = 0;
        if (sortIndex !== null) {
          if (!Number.isInteger(sortIndex) || sortIndex < 0) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid sort_index");
          }
          resolvedSortIndex = sortIndex;
        } else {
          const { rows: sortRows } = await query<{ next_sort: number }>(
            client,
            `SELECT COALESCE(MAX(sort_index), 0)::int + 1 AS next_sort
             FROM category_edition
             WHERE ceremony_id = $1`,
            [ceremonyId]
          );
          resolvedSortIndex = Number(sortRows[0]?.next_sort ?? 0);
        }

        const { rows } = await query(
          client,
          `INSERT INTO category_edition
             (ceremony_id, family_id, code, name, unit_kind, icon_id, icon_variant, sort_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING
             id::int,
             ceremony_id::int,
             family_id::int,
             code,
             name,
             unit_kind,
             icon_id::int,
             icon_variant,
             sort_index::int`,
          [
            ceremonyId,
            familyId,
            fam.code,
            fam.name,
            finalUnitKind,
            resolvedIconId,
            fam.icon_variant ?? "default",
            resolvedSortIndex
          ]
        );

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "add_ceremony_category",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { family_id: familyId }
          });
        }

        return res.status(201).json({ category: rows[0] });
      } catch (err) {
        // Unique constraint violation on (ceremony_id, family_id)
        if ((err as { code?: string })?.code === "23505") {
          next(
            new AppError("VALIDATION_FAILED", 400, "Category already exists in ceremony")
          );
          return;
        }
        next(err);
      }
    }
  );

  router.put(
    "/ceremonies/:id/categories/reorder",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const idsRaw = req.body?.category_ids;
        const categoryIds = Array.isArray(idsRaw)
          ? idsRaw
              .map((v) =>
                typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
              )
              .filter((n) => Number.isInteger(n) && n > 0)
          : [];

        if (categoryIds.length < 1) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "category_ids must include at least one category id"
          );
        }

        // Deduplicate while preserving order.
        const seen = new Set<number>();
        const uniqueIds: number[] = [];
        for (const id of categoryIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          uniqueIds.push(id);
        }

        await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Categories can only be edited while the ceremony is in draft"
            );
          }

          const draftsStarted = await hasDraftsStartedForCeremony(tx, ceremonyId);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Category structural changes are locked after drafts start"
            );
          }

          const { rows: existingRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int
             FROM category_edition
             WHERE ceremony_id = $1 AND id = ANY($2::bigint[])`,
            [ceremonyId, uniqueIds]
          );
          if (existingRows.length !== uniqueIds.length) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "All category_ids must belong to the ceremony",
              { fields: ["category_ids"] }
            );
          }

          for (let i = 0; i < uniqueIds.length; i += 1) {
            await query(
              tx,
              `UPDATE category_edition
               SET sort_index = $2
               WHERE id = $1 AND ceremony_id = $3`,
              [uniqueIds[i], i + 1, ceremonyId]
            );
          }
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "reorder_categories",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { category_ids: uniqueIds }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/category-editions/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category edition id");
        }

        const { rows: ceRows } = await query<{ ceremony_id: number; status: string }>(
          client,
          `SELECT ce.ceremony_id::int AS ceremony_id, c.status
           FROM category_edition ce
           JOIN ceremony c ON c.id = ce.ceremony_id
           WHERE ce.id = $1`,
          [id]
        );
        const ce = ceRows[0];
        if (!ce) throw new AppError("NOT_FOUND", 404, "Category edition not found");
        if (ce.status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Categories can only be edited while the ceremony is in draft"
          );
        }

        const updates: string[] = [];
        const params: unknown[] = [id];
        function push(fieldSql: string, value: unknown) {
          updates.push(fieldSql.replace("$X", `$${params.length + 1}`));
          params.push(value);
        }

        if (typeof req.body?.unit_kind === "string") {
          const unitKind = String(req.body.unit_kind).toUpperCase();
          if (!["FILM", "SONG", "PERFORMANCE"].includes(unitKind)) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid unit_kind");
          }
          push(`unit_kind = $X`, unitKind);
        }
        if (typeof req.body?.icon === "string") {
          const iconCode = req.body.icon.trim();
          if (!iconCode) {
            throw new AppError("VALIDATION_FAILED", 400, "Icon is required");
          }
          if (!/^[a-z0-9-]+$/.test(iconCode)) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Icon must be lowercase letters/numbers/dashes only"
            );
          }
          const { rows: iconRows } = await query<{ id: number }>(
            client,
            `INSERT INTO icon (code, name, asset_path)
             VALUES ($1, NULL, NULL)
             ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
             RETURNING id::int`,
            [iconCode]
          );
          const iconId = iconRows[0]?.id;
          if (!iconId) {
            throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve icon");
          }
          push(`icon_id = $X`, iconId);
        } else if (req.body?.icon_id !== undefined) {
          const iconIdRaw = req.body.icon_id;
          const iconId = iconIdRaw === null ? null : Number(iconIdRaw);
          if (iconId !== null && (!Number.isInteger(iconId) || iconId <= 0)) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_id");
          }
          push(`icon_id = $X`, iconId);
        }
        if (req.body?.sort_index !== undefined) {
          const sortIndex = Number(req.body.sort_index);
          if (!Number.isInteger(sortIndex) || sortIndex < 0) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid sort_index");
          }
          push(`sort_index = $X`, sortIndex);
        }

        if (updates.length === 0) {
          throw new AppError("VALIDATION_FAILED", 400, "No fields to update");
        }

        const { rows } = await query(
          client,
          `UPDATE category_edition
           SET ${updates.join(", ")}
           WHERE id = $1
           RETURNING id::int, ceremony_id::int, family_id::int, unit_kind, icon_id::int, sort_index::int`,
          params
        );

        return res.status(200).json({ category: rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/category-editions/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category edition id");
        }

        const { rows: ceRows } = await query<{ ceremony_id: number; status: string }>(
          client,
          `SELECT ce.ceremony_id::int AS ceremony_id, c.status
           FROM category_edition ce
           JOIN ceremony c ON c.id = ce.ceremony_id
           WHERE ce.id = $1`,
          [id]
        );
        const ce = ceRows[0];
        if (!ce) throw new AppError("NOT_FOUND", 404, "Category edition not found");
        if (ce.status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Categories can only be edited while the ceremony is in draft"
          );
        }

        const { rows: nomCountRows } = await query<{ count: string }>(
          client,
          `SELECT COUNT(*)::int AS count FROM nomination WHERE category_edition_id = $1 AND status = 'ACTIVE'`,
          [id]
        );
        const nomineeCount = Number(nomCountRows[0]?.count ?? 0);
        if (nomineeCount > 0) {
          throw new AppError(
            "CATEGORY_HAS_NOMINEES",
            409,
            "Cannot remove a category that already has nominees"
          );
        }

        await query(client, `DELETE FROM category_edition WHERE id = $1`, [id]);
        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        const yearRaw = req.body?.year;
        const year = yearRaw === undefined || yearRaw === null ? null : Number(yearRaw);
        const startsAtRaw = req.body?.starts_at;
        const startsAt =
          typeof startsAtRaw === "string" && startsAtRaw.trim()
            ? new Date(startsAtRaw)
            : null;

        if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
        if (!/^[a-z0-9-]+$/.test(code)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Code must be lowercase letters/numbers/dashes only"
          );
        }
        if (!name) throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 3000)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid year");
        }
        if (startsAt && Number.isNaN(startsAt.getTime())) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid starts_at timestamp");
        }

        const { rows } = await query(
          client,
          `INSERT INTO ceremony (code, name, year, starts_at, status, published_at, archived_at)
           VALUES ($1, $2, $3, $4, 'DRAFT', NULL, NULL)
           RETURNING id::int, code, name, year, starts_at, status`,
          [code, name, year, startsAt ? startsAt.toISOString() : null]
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_ceremony",
            target_type: "ceremony",
            target_id: ceremony.id,
            meta: { code, name, starts_at: ceremony.starts_at ?? null }
          });
        }

        return res.status(201).json({ ceremony });
      } catch (err) {
        // Unique constraint violation on ceremony.code
        if ((err as { code?: string })?.code === "23505") {
          next(new AppError("VALIDATION_FAILED", 400, "Ceremony code already exists"));
          return;
        }
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/name",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        if (!name) {
          throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony SET name = $1
           WHERE id = $2
           RETURNING id, code, name, year`,
          [name, id]
        );
        const ceremony = rows[0];
        if (!ceremony) {
          throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        }

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "ceremony_name_update",
            target_type: "ceremony",
            target_id: ceremony.id,
            meta: { name }
          });
        }
        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremony/active",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyIdRaw = req.body?.ceremony_id;
        const ceremonyId = Number(ceremonyIdRaw);
        if (!ceremonyIdRaw || Number.isNaN(ceremonyId)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows } = await query(
          client,
          `SELECT id::int, code, name, year FROM ceremony WHERE id = $1`,
          [ceremonyId]
        );
        const ceremony = rows[0];
        if (!ceremony) {
          throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        }

        await setActiveCeremonyId(client, ceremonyId);
        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "set_active_ceremony",
            target_type: "ceremony",
            target_id: ceremony.id
          });
        }
        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/nominations/:id/change",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const nominationId = Number(req.params.id);
        if (!Number.isFinite(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination id");
        }
        const {
          action,
          origin,
          impact,
          reason,
          replacement_nomination_id
        }: {
          action?: "REVOKE" | "REPLACE" | "RESTORE";
          origin?: "INTERNAL" | "EXTERNAL";
          impact?: "CONSEQUENTIAL" | "BENIGN";
          reason?: string;
          replacement_nomination_id?: number | null;
        } = req.body ?? {};

        if (!action || !["REVOKE", "REPLACE", "RESTORE"].includes(action)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid action");
        }
        if (!origin || !["INTERNAL", "EXTERNAL"].includes(origin)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid origin");
        }
        if (!impact || !["CONSEQUENTIAL", "BENIGN"].includes(impact)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid impact");
        }
        if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
          throw new AppError("VALIDATION_FAILED", 400, "Reason required (min 5 chars)");
        }

        await runInTransaction(client as Pool, async (tx) => {
          const { rows: nomRows } = await query<{ id: number }>(
            tx,
            `SELECT id FROM nomination WHERE id = $1`,
            [nominationId]
          );
          if (nomRows.length === 0) {
            throw new AppError("NOT_FOUND", 404, "Nomination not found");
          }

          if (action === "REPLACE") {
            if (!replacement_nomination_id || Number.isNaN(replacement_nomination_id)) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "replacement_nomination_id required"
              );
            }
            const { rows: replRows } = await query<{ id: number }>(
              tx,
              `SELECT id FROM nomination WHERE id = $1`,
              [replacement_nomination_id]
            );
            if (replRows.length === 0) {
              throw new AppError("NOT_FOUND", 404, "Replacement nomination not found");
            }
          }

          const status: "ACTIVE" | "REVOKED" | "REPLACED" =
            action === "RESTORE"
              ? "ACTIVE"
              : action === "REVOKE"
                ? "REVOKED"
                : "REPLACED";
          await updateNominationStatus(tx, {
            nomination_id: nominationId,
            status,
            replaced_by_nomination_id:
              action === "REPLACE" ? (replacement_nomination_id ?? null) : null
          });

          await insertNominationChangeAudit(tx, {
            nomination_id: nominationId,
            replacement_nomination_id:
              action === "REPLACE" ? (replacement_nomination_id ?? null) : null,
            origin,
            impact,
            action,
            reason,
            created_by_user_id: Number(req.auth?.sub)
          });
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "nomination_change",
            target_type: "nomination",
            target_id: nominationId,
            meta: { action, origin, impact, reason, replacement_nomination_id }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/nominations/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const nominationId = Number(req.params.id);
        if (!Number.isInteger(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: rows0 } = await query<{
            id: number;
            category_edition_id: number;
            song_id: number | null;
            performance_id: number | null;
            ceremony_id: number;
          }>(
            tx,
            `SELECT
               n.id::int,
               n.category_edition_id::int,
               n.song_id::int,
               n.performance_id::int,
               ce.ceremony_id::int
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             WHERE n.id = $1`,
            [nominationId]
          );
          const row = rows0[0];
          if (!row) throw new AppError("NOT_FOUND", 404, "Nomination not found");

          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [row.ceremony_id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be deleted while the ceremony is in draft"
            );
          }

          const draftsStarted = await hasDraftsStartedForCeremony(tx, row.ceremony_id);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          // Remove dependent rows first (no ON DELETE CASCADE on these FKs).
          await query(tx, `DELETE FROM nomination_contributor WHERE nomination_id = $1`, [
            nominationId
          ]);
          await query(
            tx,
            `DELETE FROM nomination_change_audit WHERE nomination_id = $1`,
            [nominationId]
          );
          await query(
            tx,
            `DELETE FROM nomination_change_audit WHERE replacement_nomination_id = $1`,
            [nominationId]
          );

          // Now remove the nomination.
          await query(tx, `DELETE FROM nomination WHERE id = $1`, [nominationId]);

          // Best-effort cleanup of now-unreferenced song/performance rows.
          if (row.song_id) {
            await query(
              tx,
              `DELETE FROM song
               WHERE id = $1
                 AND NOT EXISTS (SELECT 1 FROM nomination WHERE song_id = $1)`,
              [row.song_id]
            );
          }
          if (row.performance_id) {
            await query(
              tx,
              `DELETE FROM performance
               WHERE id = $1
                 AND NOT EXISTS (SELECT 1 FROM nomination WHERE performance_id = $1)`,
              [row.performance_id]
            );
          }

          return {
            ceremony_id: row.ceremony_id,
            category_edition_id: row.category_edition_id
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "delete_nomination",
            target_type: "nomination",
            target_id: nominationId,
            meta: result
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const categoryEditionId = Number(req.body?.category_edition_id);
        const nominationIdsRaw = req.body?.nomination_ids;
        const nominationId = Number(req.body?.nomination_id);
        if (!Number.isFinite(categoryEditionId) || categoryEditionId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category_edition_id");
        }
        const nominationIds = Array.isArray(nominationIdsRaw)
          ? (nominationIdsRaw as unknown[])
              .map((v) =>
                typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
              )
              .filter((n) => Number.isFinite(n) && n > 0)
          : Number.isFinite(nominationId) && nominationId > 0
            ? [nominationId]
            : [];
        if (nominationIds.length === 0) {
          throw new AppError("VALIDATION_FAILED", 400, "nomination_ids is required");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: catRows } = await query<{
            ceremony_id: number;
          }>(tx, `SELECT ceremony_id::int FROM category_edition WHERE id = $1`, [
            categoryEditionId
          ]);
          const category = catRows[0];
          if (!category) {
            throw new AppError("NOT_FOUND", 404, "Category edition not found");
          }

          for (const nid of nominationIds) {
            const { rows: nomRows } = await query<{ id: number }>(
              tx,
              `SELECT id::int FROM nomination WHERE id = $1 AND category_edition_id = $2`,
              [nid, categoryEditionId]
            );
            if (!nomRows[0]) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "Nomination does not belong to category edition"
              );
            }
          }

          const { rows: ceremonyRows } = await query<{
            status: string;
            draft_locked_at: Date | null;
          }>(tx, `SELECT status, draft_locked_at FROM ceremony WHERE id = $1`, [
            category.ceremony_id
          ]);
          const ceremony = ceremonyRows[0];
          if (!ceremony) {
            throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          }
          if (ceremony.status === "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_PUBLISHED",
              409,
              "Ceremony must be published before entering winners"
            );
          }
          if (ceremony.status === "ARCHIVED") {
            throw new AppError(
              "CEREMONY_ARCHIVED",
              409,
              "Archived ceremonies are read-only"
            );
          }
          if (ceremony.status === "COMPLETE") {
            throw new AppError(
              "CEREMONY_COMPLETE",
              409,
              "This ceremony has finalized winners and is read-only for results entry"
            );
          }

          const winners = await setWinnersForCategoryEdition(tx, {
            ceremony_id: category.ceremony_id,
            category_edition_id: categoryEditionId,
            nomination_ids: nominationIds
          });

          // First winner locks drafting for this ceremony, aborting any in-progress drafts.
          const shouldLock = ceremony.status !== "LOCKED";
          const lockedAtBefore =
            ceremony.draft_locked_at ??
            (await getCeremonyDraftLockedAt(tx, category.ceremony_id));
          const lockedAt =
            lockedAtBefore ??
            (await lockCeremonyDraft(tx, category.ceremony_id)) ??
            lockedAtBefore;
          let cancelledCount = 0;
          if (shouldLock) {
            await query(tx, `UPDATE ceremony SET status = 'LOCKED' WHERE id = $1`, [
              category.ceremony_id
            ]);
            const cancelled = await cancelDraftsForCeremony(tx, category.ceremony_id);
            cancelledCount = cancelled.length;
          }

          return {
            ceremony_id: category.ceremony_id,
            winners,
            draft_locked_at: lockedAt,
            cancelled_drafts: cancelledCount
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "winner_upsert",
            target_type: "category_edition",
            target_id: Number(categoryEditionId),
            meta: {
              ceremony_id: result.ceremony_id,
              nomination_ids: nominationIds,
              cancelled_drafts: result.cancelled_drafts
            }
          });
        }

        // Notify any connected draft rooms (results view) that winners changed.
        void emitCeremonyWinnersUpdated({
          db: client,
          ceremonyId: result.ceremony_id,
          categoryEditionId,
          nominationIds
        });

        return res.status(200).json({
          winners: result.winners,
          draft_locked_at: result.draft_locked_at,
          cancelled_drafts: result.cancelled_drafts
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/finalize-winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{
            status: string;
            code: string | null;
            name: string | null;
          }>(tx, `SELECT status, code, name FROM ceremony WHERE id = $1`, [ceremonyId]);
          const ceremony = ceremonyRows[0];
          if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (ceremony.status === "ARCHIVED") {
            throw new AppError(
              "CEREMONY_ARCHIVED",
              409,
              "Archived ceremonies are read-only"
            );
          }
          if (ceremony.status === "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_PUBLISHED",
              409,
              "Publish the ceremony before finalizing winners"
            );
          }
          if (ceremony.status !== "LOCKED") {
            throw new AppError(
              "CEREMONY_NOT_LOCKED",
              409,
              "Winners can only be finalized once results entry has started (ceremony locked)"
            );
          }

          const { rows: winnerRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM ceremony_winner WHERE ceremony_id = $1 LIMIT 1`,
            [ceremonyId]
          );
          if (!winnerRows[0]) {
            throw new AppError(
              "NO_WINNERS",
              409,
              "At least one winner must be set before finalizing"
            );
          }

          try {
            await query(tx, `UPDATE ceremony SET status = 'COMPLETE' WHERE id = $1`, [
              ceremonyId
            ]);
          } catch (err) {
            const code = (err as { code?: string } | null)?.code;
            if (code === "23514" || code === "42P01") {
              throw new AppError(
                "MIGRATION_REQUIRED",
                409,
                "Database schema is out of date. Apply migrations and restart the API."
              );
            }
            throw err;
          }
          return {
            id: ceremonyId,
            status: "COMPLETE",
            code: ceremony.code,
            name: ceremony.name
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "finalize_winners",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { status: "COMPLETE" }
          });
        }

        void emitCeremonyFinalized({ db: client, ceremonyId });

        return res.status(200).json({ ceremony: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/nominees/upload",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        const dataset = req.body;
        if (!dataset || typeof dataset !== "object") {
          throw new AppError("VALIDATION_FAILED", 400, "Missing JSON body", {
            fields: ["body"]
          });
        }

        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [ceremonyId]
        );
        const status = ceremonyRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Nominees can only be uploaded while the ceremony is in draft"
          );
        }

        const draftsStarted = await hasDraftsStartedForCeremony(client, ceremonyId);
        if (draftsStarted) {
          throw new AppError(
            "DRAFTS_LOCKED",
            409,
            "Nominee structural changes are locked after drafts start"
          );
        }

        // Basic shape validation: ensure ceremonies array has only this ceremony id.
        const ceremonies = (dataset as { ceremonies?: unknown[] }).ceremonies;
        if (!Array.isArray(ceremonies) || ceremonies.length === 0) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Dataset must include ceremonies",
            {
              fields: ["ceremonies"]
            }
          );
        }
        const ceremonyIds = ceremonies
          .map((c) => (c as { id?: number })?.id)
          .filter((v) => Number.isFinite(v))
          .map((v) => Number(v));
        if (ceremonyIds.length !== 1 || ceremonyIds[0] !== ceremonyId) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Dataset ceremonies must include only the selected ceremony",
            { fields: ["ceremonies"] }
          );
        }

        await loadNominees(client as unknown as Pool, dataset as never);

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "nominees_upload",
            target_type: "ceremony",
            target_id: ceremonyId
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/films/import",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const body = req.body;
        if (!body || typeof body !== "object") {
          throw new AppError("VALIDATION_FAILED", 400, "Missing JSON body", {
            fields: ["body"]
          });
        }

        const filmsRaw = (body as { films?: unknown }).films;
        const films = Array.isArray(filmsRaw)
          ? filmsRaw
          : Array.isArray(body)
            ? (body as unknown[])
            : null;
        if (!films) {
          throw new AppError("VALIDATION_FAILED", 400, "Dataset must include films", {
            fields: ["films"]
          });
        }

        // Best-effort hydration: if TMDB is configured, pull canonical film details (title/year/poster)
        // and store credits payload on the film. We intentionally do NOT hydrate individual people.
        const tmdbHydratedById = new Map<
          number,
          {
            title: string;
            releaseYear: number | null;
            posterPath: string | null;
            posterUrl: string | null;
            credits: unknown | null;
          }
        >();
        const tmdbErrors: Array<{ tmdb_id: number; error: string }> = [];
        const tmdbIdsToHydrate: number[] = [];

        for (const item of films) {
          if (!item || typeof item !== "object") continue;
          const obj = item as Record<string, unknown>;
          const tmdbIdRaw =
            obj.external_ids && typeof obj.external_ids === "object"
              ? (obj.external_ids as { tmdb_id?: unknown }).tmdb_id
              : (obj as { tmdb_id?: unknown }).tmdb_id;
          const tmdbId =
            typeof tmdbIdRaw === "number"
              ? tmdbIdRaw
              : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                ? Number(tmdbIdRaw)
                : null;
          if (tmdbId && Number.isFinite(tmdbId)) tmdbIdsToHydrate.push(Number(tmdbId));
        }

        if (tmdbIdsToHydrate.length > 0) {
          try {
            const cfg = await getTmdbImageConfig();
            for (const tmdbId of tmdbIdsToHydrate) {
              if (tmdbHydratedById.has(tmdbId)) continue;
              try {
                const movie = await fetchTmdbMovieDetailsWithCredits(tmdbId);
                const releaseYear = parseReleaseYear(movie.release_date ?? null);
                const posterPath = movie.poster_path ?? null;
                const posterUrl = buildTmdbImageUrlFromConfig(
                  cfg,
                  "poster",
                  posterPath,
                  "w500"
                );
                const credits = movie.credits
                  ? {
                      cast: Array.isArray(movie.credits.cast)
                        ? movie.credits.cast.map((c) => ({
                            tmdb_id: c.id,
                            name: c.name,
                            character: c.character ?? null,
                            order: c.order ?? null,
                            credit_id: c.credit_id ?? null,
                            profile_path: c.profile_path ?? null
                          }))
                        : [],
                      crew: Array.isArray(movie.credits.crew)
                        ? movie.credits.crew.map((c) => ({
                            tmdb_id: c.id,
                            name: c.name,
                            department: c.department ?? null,
                            job: c.job ?? null,
                            credit_id: c.credit_id ?? null,
                            profile_path: c.profile_path ?? null
                          }))
                        : []
                    }
                  : null;
                tmdbHydratedById.set(tmdbId, {
                  title: movie.title,
                  releaseYear,
                  posterPath,
                  posterUrl,
                  credits
                });
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "TMDB request failed";
                tmdbErrors.push({ tmdb_id: tmdbId, error: message });
              }
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : "TMDB not configured";
            for (const tmdbId of tmdbIdsToHydrate) {
              tmdbErrors.push({ tmdb_id: tmdbId, error: message });
            }
          }
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          let upserted = 0;
          let hydrated = 0;

          for (const item of films) {
            if (!item || typeof item !== "object") continue;
            const obj = item as Record<string, unknown>;
            const ref = typeof obj.ref === "string" ? obj.ref.trim() : null;
            const name =
              typeof obj.name === "string"
                ? obj.name.trim()
                : typeof obj.title === "string"
                  ? obj.title.trim()
                  : null;
            const year =
              typeof obj.year === "number"
                ? obj.year
                : typeof obj.year === "string" && obj.year.trim()
                  ? Number(obj.year)
                  : null;
            const tmdbIdRaw =
              obj.external_ids && typeof obj.external_ids === "object"
                ? (obj.external_ids as { tmdb_id?: unknown }).tmdb_id
                : (obj as { tmdb_id?: unknown }).tmdb_id;
            const tmdbId =
              typeof tmdbIdRaw === "number"
                ? tmdbIdRaw
                : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                  ? Number(tmdbIdRaw)
                  : null;

            if (tmdbId && Number.isFinite(tmdbId)) {
              const hydratedRow = tmdbHydratedById.get(Number(tmdbId)) ?? null;
              const effectiveTitle = hydratedRow?.title ?? name ?? null;
              if (!effectiveTitle) continue;

              const effectiveYear =
                hydratedRow?.releaseYear ??
                (Number.isFinite(Number(year)) ? Number(year) : null);
              const effectivePosterPath = hydratedRow?.posterPath ?? null;
              const effectivePosterUrl = hydratedRow?.posterUrl ?? null;
              const effectiveCredits = hydratedRow?.credits ?? null;

              await query(
                tx,
                `INSERT INTO film (title, country, tmdb_id, ref, release_year, external_ids, poster_path, poster_url, tmdb_credits, tmdb_last_synced_at)
                 VALUES ($1, NULL, $2::int, $3, $4, $5::jsonb, $6::text, $7::text, $8::jsonb, CASE WHEN $6 IS NOT NULL OR $7 IS NOT NULL OR $8 IS NOT NULL THEN now() ELSE NULL END)
                 ON CONFLICT (tmdb_id)
                 DO UPDATE SET
                   title = EXCLUDED.title,
                   ref = COALESCE(film.ref, EXCLUDED.ref),
                   release_year = COALESCE(film.release_year, EXCLUDED.release_year),
                   poster_path = COALESCE(EXCLUDED.poster_path, film.poster_path),
                   poster_url = COALESCE(EXCLUDED.poster_url, film.poster_url),
                   tmdb_credits = COALESCE(EXCLUDED.tmdb_credits, film.tmdb_credits),
                   external_ids = COALESCE(film.external_ids, EXCLUDED.external_ids),
                   tmdb_last_synced_at = CASE WHEN EXCLUDED.poster_path IS NOT NULL OR EXCLUDED.poster_url IS NOT NULL OR EXCLUDED.tmdb_credits IS NOT NULL THEN now() ELSE film.tmdb_last_synced_at END`,
                [
                  effectiveTitle,
                  Number(tmdbId),
                  ref,
                  effectiveYear,
                  (obj as { external_ids?: unknown }).external_ids ?? null,
                  effectivePosterPath,
                  effectivePosterUrl,
                  effectiveCredits ? JSON.stringify(effectiveCredits) : null
                ]
              );
              upserted += 1;
              if (hydratedRow) hydrated += 1;
              continue;
            }

            if (ref) {
              if (!name) continue;
              await query(
                tx,
                `INSERT INTO film (title, country, tmdb_id, ref, release_year, external_ids)
                 VALUES ($1, NULL, NULL, $2, $3, $4)
                 ON CONFLICT (ref)
                 DO UPDATE SET
                   title = EXCLUDED.title,
                   release_year = COALESCE(film.release_year, EXCLUDED.release_year),
                   external_ids = COALESCE(film.external_ids, EXCLUDED.external_ids)`,
                [
                  name,
                  ref,
                  Number.isFinite(Number(year)) ? Number(year) : null,
                  (obj as { external_ids?: unknown }).external_ids ?? null
                ]
              );
              upserted += 1;
              continue;
            }

            if (!name) continue;
            await query(tx, `INSERT INTO film (title, country) VALUES ($1, NULL)`, [
              name
            ]);
            upserted += 1;
          }

          return { upserted, hydrated };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "import_films",
            target_type: "film",
            target_id: null,
            meta: { hydrated: result.hydrated, tmdb_errors: tmdbErrors }
          });
        }

        return res.status(200).json({ ok: true, ...result, tmdb_errors: tmdbErrors });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/films",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const like = q ? `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%` : null;
        const { rows } = await query(
          client,
          `SELECT
             id::int,
             title,
             release_year::int,
             tmdb_id::int,
             poster_url
           FROM film
           WHERE ($1::text IS NULL OR title ILIKE $1 ESCAPE '\\')
           ORDER BY title ASC, release_year DESC NULLS LAST, id ASC
           LIMIT 500`,
          [like]
        );
        return res.status(200).json({ films: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/films/:id/credits",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid film id");
        }
        const { rows } = await query<{ tmdb_credits: unknown | null }>(
          client,
          `SELECT tmdb_credits FROM film WHERE id = $1`,
          [id]
        );
        const credits = rows[0]?.tmdb_credits ?? null;
        // Don't over-validate; this payload is sourced from TMDB and stored as jsonb.
        return res.status(200).json({ credits });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/films/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid film id");
        }

        const tmdbIdRaw = (req.body as { tmdb_id?: unknown } | undefined)?.tmdb_id;
        const tmdbId =
          tmdbIdRaw === null || tmdbIdRaw === undefined
            ? null
            : typeof tmdbIdRaw === "number"
              ? tmdbIdRaw
              : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                ? Number(tmdbIdRaw)
                : NaN;

        if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "tmdb_id must be a positive integer",
            {
              fields: ["tmdb_id"]
            }
          );
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: existingRows } = await query<{
            id: number;
            title: string;
            release_year: number | null;
            tmdb_id: number | null;
          }>(
            tx,
            `SELECT id::int, title, release_year::int, tmdb_id::int
             FROM film
             WHERE id = $1`,
            [id]
          );
          const existing = existingRows[0];
          if (!existing) throw new AppError("NOT_FOUND", 404, "Film not found");

          if (tmdbId === null) {
            const { rows } = await query(
              tx,
              `UPDATE film
               SET tmdb_id = NULL,
                   external_ids = NULL,
                   poster_path = NULL,
                   poster_url = NULL,
                   tmdb_last_synced_at = NULL,
                   tmdb_credits = NULL
               WHERE id = $1
               RETURNING id::int, title, release_year::int, tmdb_id::int, poster_url`,
              [id]
            );
            return { film: rows[0], hydrated: false };
          }

          // Hydrate details + credits from TMDB and store them on the film record.
          const cfg = await getTmdbImageConfig();
          const movie = await fetchTmdbMovieDetailsWithCredits(Number(tmdbId));
          const releaseYear = parseReleaseYear(movie.release_date ?? null);
          const posterPath = movie.poster_path ?? null;
          const posterUrl = buildTmdbImageUrlFromConfig(
            cfg,
            "poster",
            posterPath,
            "w500"
          );
          const credits = movie.credits
            ? {
                cast: Array.isArray(movie.credits.cast)
                  ? movie.credits.cast.map((c) => ({
                      tmdb_id: c.id,
                      name: c.name,
                      character: c.character ?? null,
                      order: c.order ?? null,
                      credit_id: c.credit_id ?? null,
                      profile_path: c.profile_path ?? null
                    }))
                  : [],
                crew: Array.isArray(movie.credits.crew)
                  ? movie.credits.crew.map((c) => ({
                      tmdb_id: c.id,
                      name: c.name,
                      department: c.department ?? null,
                      job: c.job ?? null,
                      credit_id: c.credit_id ?? null,
                      profile_path: c.profile_path ?? null
                    }))
                  : []
              }
            : null;

          let rows: unknown[] = [];
          try {
            ({ rows } = await query(
              tx,
              `UPDATE film
               SET tmdb_id = $2::int,
                   external_ids = COALESCE(external_ids, '{}'::jsonb) || jsonb_build_object('tmdb_id', $2::int),
                   title = $3,
                   release_year = $4,
                   poster_path = $5,
                   poster_url = $6,
                   tmdb_last_synced_at = now(),
                   tmdb_credits = $7
               WHERE id = $1
               RETURNING id::int, title, release_year::int, tmdb_id::int, poster_url`,
              [
                id,
                Number(tmdbId),
                movie.title,
                releaseYear,
                posterPath,
                posterUrl,
                credits ? JSON.stringify(credits) : null
              ]
            ));
          } catch (err) {
            // Friendly feedback for a common admin mistake: trying to link the same TMDB id twice.
            const pg = err as { code?: unknown; constraint?: unknown };
            if (pg?.code === "23505" && pg?.constraint === "film_tmdb_id_key") {
              const { rows: dupeRows } = await query<{
                id: number;
                title: string;
              }>(
                tx,
                `SELECT id::int, title
                 FROM film
                 WHERE tmdb_id = $1::int
                 ORDER BY id ASC
                 LIMIT 1`,
                [Number(tmdbId)]
              );
              const dupe = dupeRows[0];
              throw new AppError(
                "TMDB_ID_ALREADY_LINKED",
                409,
                dupe?.title
                  ? `That TMDB id is already linked to “${dupe.title}”.`
                  : "That TMDB id is already linked to another film.",
                dupe
                  ? {
                      tmdb_id: Number(tmdbId),
                      linked_film_id: dupe.id,
                      linked_film_title: dupe.title
                    }
                  : { tmdb_id: Number(tmdbId) }
              );
            }
            throw err;
          }
          return { film: rows[0], hydrated: true };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "link_film_tmdb",
            target_type: "film",
            target_id: id,
            meta: { tmdb_id: tmdbId, hydrated: result.hydrated }
          });
        }

        return res.status(200).json({ film: result.film, hydrated: result.hydrated });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/people",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const like = q ? `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%` : null;
        const { rows } = await query(
          client,
          `SELECT id::int, full_name, tmdb_id::int, profile_url
           FROM person
           WHERE ($1::text IS NULL OR full_name ILIKE $1 ESCAPE '\\')
           ORDER BY full_name ASC, id ASC
           LIMIT 250`,
          [like]
        );
        return res.status(200).json({ people: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/people/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid person id");
        }

        const tmdbIdRaw = (req.body as { tmdb_id?: unknown } | undefined)?.tmdb_id;
        const tmdbId =
          tmdbIdRaw === null || tmdbIdRaw === undefined
            ? null
            : typeof tmdbIdRaw === "number"
              ? tmdbIdRaw
              : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                ? Number(tmdbIdRaw)
                : NaN;

        if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "tmdb_id must be a positive integer",
            {
              fields: ["tmdb_id"]
            }
          );
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: existingRows } = await query<{
            id: number;
            full_name: string;
            tmdb_id: number | null;
            profile_url: string | null;
          }>(
            tx,
            `SELECT id::int, full_name, tmdb_id::int, profile_url
             FROM person
             WHERE id = $1`,
            [id]
          );
          const existing = existingRows[0];
          if (!existing) throw new AppError("NOT_FOUND", 404, "Person not found");

          if (tmdbId === null) {
            const { rows } = await query(
              tx,
              `UPDATE person
               SET tmdb_id = NULL,
                   external_ids = NULL,
                   profile_path = NULL,
                   profile_url = NULL,
                   updated_at = now()
               WHERE id = $1
               RETURNING id::int, full_name, tmdb_id::int, profile_url`,
              [id]
            );
            return { person: rows[0], hydrated: false };
          }

          const details = await fetchTmdbPersonDetails(Number(tmdbId));
          const profilePath = details?.profile_path ?? null;
          const profileUrl = await buildTmdbImageUrl("profile", profilePath, "w185");

          let rows: unknown[] = [];
          try {
            ({ rows } = await query(
              tx,
              `UPDATE person
               SET tmdb_id = $2::int,
                   external_ids = COALESCE(external_ids, '{}'::jsonb) || jsonb_build_object('tmdb_id', $2::int),
                   full_name = COALESCE(NULLIF($3, ''), full_name),
                   profile_path = $4,
                   profile_url = $5,
                   updated_at = now()
               WHERE id = $1
               RETURNING id::int, full_name, tmdb_id::int, profile_url`,
              [id, Number(tmdbId), String(details?.name ?? ""), profilePath, profileUrl]
            ));
          } catch (err) {
            const pg = err as { code?: unknown; constraint?: unknown };
            if (pg?.code === "23505" && pg?.constraint === "person_tmdb_id_key") {
              const { rows: dupeRows } = await query<{
                id: number;
                full_name: string;
              }>(
                tx,
                `SELECT id::int, full_name
                 FROM person
                 WHERE tmdb_id = $1::int
                 ORDER BY id ASC
                 LIMIT 1`,
                [Number(tmdbId)]
              );
              const dupe = dupeRows[0];
              throw new AppError(
                "TMDB_ID_ALREADY_LINKED",
                409,
                dupe?.full_name
                  ? `That TMDB id is already linked to “${dupe.full_name}”.`
                  : "That TMDB id is already linked to another contributor.",
                dupe
                  ? {
                      tmdb_id: Number(tmdbId),
                      linked_person_id: dupe.id,
                      linked_person_name: dupe.full_name
                    }
                  : { tmdb_id: Number(tmdbId) }
              );
            }
            throw err;
          }
          return { person: rows[0], hydrated: true };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "link_person_tmdb",
            target_type: "person",
            target_id: id,
            meta: { tmdb_id: tmdbId, hydrated: result.hydrated }
          });
        }

        return res.status(200).json({ person: result.person, hydrated: result.hydrated });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/nominations/:id/contributors",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const nominationId = Number(req.params.id);
        if (!Number.isInteger(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination id");
        }

        const personIdRaw = (req.body as { person_id?: unknown } | undefined)?.person_id;
        const personId =
          typeof personIdRaw === "number"
            ? personIdRaw
            : typeof personIdRaw === "string" && personIdRaw.trim()
              ? Number(personIdRaw)
              : null;
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        const tmdbIdRaw = (req.body as { tmdb_id?: unknown } | undefined)?.tmdb_id;
        const tmdbId =
          typeof tmdbIdRaw === "number"
            ? tmdbIdRaw
            : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
              ? Number(tmdbIdRaw)
              : null;

        if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "tmdb_id must be a positive integer",
            {
              fields: ["tmdb_id"]
            }
          );
        }

        if (!personId && !name) {
          throw new AppError("VALIDATION_FAILED", 400, "person_id or name is required", {
            fields: ["person_id", "name"]
          });
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: metaRows } = await query<{ ceremony_id: number; status: string }>(
            tx,
            `SELECT ce.ceremony_id::int AS ceremony_id, c.status
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             JOIN ceremony c ON c.id = ce.ceremony_id
             WHERE n.id = $1`,
            [nominationId]
          );
          const meta = metaRows[0];
          if (!meta) throw new AppError("NOT_FOUND", 404, "Nomination not found");
          if (meta.status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be edited while the ceremony is in draft"
            );
          }
          const draftsStarted = await hasDraftsStartedForCeremony(tx, meta.ceremony_id);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          let resolvedPersonId: number | null = null;
          if (personId && Number.isFinite(personId)) {
            const { rows: personRows } = await query<{ id: number }>(
              tx,
              `SELECT id::int FROM person WHERE id = $1`,
              [Number(personId)]
            );
            if (!personRows[0]?.id)
              throw new AppError("NOT_FOUND", 404, "Person not found");
            resolvedPersonId = personRows[0].id;
          } else if (tmdbId && Number.isFinite(tmdbId)) {
            if (!name) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "name is required when providing tmdb_id",
                { fields: ["name"] }
              );
            }
            const { rows: personRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO person (full_name, tmdb_id, external_ids, updated_at)
               VALUES ($1, $2::int, jsonb_build_object('tmdb_id', $2::int), now())
               ON CONFLICT (tmdb_id)
               DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()
               RETURNING id::int`,
              [name, Number(tmdbId)]
            );
            resolvedPersonId = personRows[0]?.id ?? null;
          } else {
            const { rows: personRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO person (full_name) VALUES ($1) RETURNING id::int`,
              [name]
            );
            resolvedPersonId = personRows[0]?.id ?? null;
          }

          if (!resolvedPersonId)
            throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve person");

          const { rows: sortRows } = await query<{ max: number | null }>(
            tx,
            `SELECT COALESCE(MAX(sort_order), -1)::int AS max
             FROM nomination_contributor
             WHERE nomination_id = $1`,
            [nominationId]
          );
          const nextSortOrder = (sortRows[0]?.max ?? -1) + 1;

          const { rows: insertedRows } = await query<{ id: number }>(
            tx,
            `INSERT INTO nomination_contributor (nomination_id, person_id, role_label, sort_order)
             VALUES ($1, $2, NULL, $3)
             RETURNING id::int`,
            [nominationId, resolvedPersonId, nextSortOrder]
          );
          const nominationContributorId = insertedRows[0]?.id ?? null;
          if (!nominationContributorId)
            throw new AppError("INTERNAL_ERROR", 500, "Failed to add contributor");

          const { rows: peopleRows } = await query<{
            id: number;
            full_name: string;
            tmdb_id: number | null;
            profile_url: string | null;
          }>(
            tx,
            `SELECT id::int, full_name, tmdb_id::int, profile_url
             FROM person WHERE id = $1`,
            [resolvedPersonId]
          );

          return {
            nomination_contributor_id: nominationContributorId,
            person: peopleRows[0]
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "add_nomination_contributor",
            target_type: "nomination",
            target_id: nominationId,
            meta: { person_id: result.person?.id ?? null }
          });
        }

        return res.status(201).json({ ok: true, ...result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/nominations/:id/contributors/:contributorId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const nominationId = Number(req.params.id);
        const contributorId = Number(req.params.contributorId);
        if (!Number.isInteger(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination id");
        }
        if (!Number.isInteger(contributorId) || contributorId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid contributor id");
        }

        await runInTransaction(client as Pool, async (tx) => {
          const { rows: metaRows } = await query<{ ceremony_id: number; status: string }>(
            tx,
            `SELECT ce.ceremony_id::int AS ceremony_id, c.status
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             JOIN ceremony c ON c.id = ce.ceremony_id
             WHERE n.id = $1`,
            [nominationId]
          );
          const meta = metaRows[0];
          if (!meta) throw new AppError("NOT_FOUND", 404, "Nomination not found");
          if (meta.status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be edited while the ceremony is in draft"
            );
          }
          const draftsStarted = await hasDraftsStartedForCeremony(tx, meta.ceremony_id);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          const { rowCount } = await query(
            tx,
            `DELETE FROM nomination_contributor
             WHERE id = $1 AND nomination_id = $2`,
            [contributorId, nominationId]
          );
          if (!rowCount) throw new AppError("NOT_FOUND", 404, "Contributor not found");
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "remove_nomination_contributor",
            target_type: "nomination",
            target_id: nominationId,
            meta: { nomination_contributor_id: contributorId }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/nominees/upload",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const dataset = req.body;
        if (!dataset || typeof dataset !== "object") {
          throw new AppError("VALIDATION_FAILED", 400, "Missing JSON body", {
            fields: ["body"]
          });
        }

        const activeCeremonyRows = await query<{ active_ceremony_id: number | null }>(
          client,
          `SELECT active_ceremony_id FROM app_config WHERE id = TRUE`
        );
        const activeCeremonyId = activeCeremonyRows.rows?.[0]?.active_ceremony_id ?? null;
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
        }
        // Legacy endpoint: delegate to ceremony-scoped upload.
        req.params.id = String(activeCeremonyId);
        // Re-run through the new route logic by duplicating its checks (keep behavior stable).
        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          Number(activeCeremonyId)
        );
        if (draftsStarted) {
          throw new AppError(
            "DRAFTS_LOCKED",
            409,
            "Nominee structural changes are locked after drafts start"
          );
        }
        await loadNominees(client as unknown as Pool, dataset as never);
        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "nominees_upload",
            target_type: "ceremony",
            target_id: Number(activeCeremonyId)
          });
        }
        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
