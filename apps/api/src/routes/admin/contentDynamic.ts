import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import {
  createDynamicDraft,
  listDynamicContentByKey,
  publishDynamicContent,
  unpublishDynamicContent,
  updateDynamicDraft
} from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminContentDynamicRoutes(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

  router.get("/content/dynamic/:key", async (req: AuthedRequest, res, next) => {
    try {
      const key = String(req.params.key ?? "").trim();
      if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
      const entries = await listDynamicContentByKey(client, key);
      return res.status(200).json({ entries });
    } catch (err) {
      next(err);
    }
  });

  router.post("/content/dynamic/:key/drafts", async (req: AuthedRequest, res, next) => {
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
          (variant as "info" | "warning" | "success" | "error" | undefined) ?? undefined,
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
  });

  router.patch(
    "/content/dynamic/:key/drafts/:id",
    async (req: AuthedRequest, res, next) => {
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
    async (req: AuthedRequest, res, next) => {
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
    async (req: AuthedRequest, res, next) => {
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

  router.post("/content/dynamic/:key/unpublish", async (req: AuthedRequest, res, next) => {
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
  });

  router.delete("/content/dynamic/:key/entries/:id", async (req: AuthedRequest, res, next) => {
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
  });
}

