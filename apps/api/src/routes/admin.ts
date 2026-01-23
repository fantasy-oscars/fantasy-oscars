import express from "express";
import { AppError } from "../errors.js";
import { type DbClient, query, runInTransaction } from "../data/db.js";
import { AuthedRequest } from "../auth/middleware.js";
import { setActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import {
  lockCeremonyDraft,
  getCeremonyDraftLockedAt
} from "../data/repositories/ceremonyRepository.js";
import { upsertWinner } from "../data/repositories/winnerRepository.js";
import {
  updateNominationStatus,
  insertNominationChangeAudit
} from "../data/repositories/nominationRepository.js";
import { hasDraftsStartedForCeremony } from "../data/repositories/draftRepository.js";
import { loadNominees } from "../scripts/load-nominees.js";
import type { Pool } from "pg";
import { insertAdminAudit } from "../data/repositories/adminAuditRepository.js";

export function createAdminRouter(client: DbClient) {
  const router = express.Router();

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

  router.post(
    "/winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const categoryEditionId = Number(req.body?.category_edition_id);
        const nominationId = Number(req.body?.nomination_id);
        if (!Number.isFinite(categoryEditionId) || categoryEditionId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category_edition_id");
        }
        if (!Number.isFinite(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination_id");
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

          const { rows: nomRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM nomination WHERE id = $1 AND category_edition_id = $2`,
            [nominationId, categoryEditionId]
          );
          if (!nomRows[0]) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Nomination does not belong to category edition"
            );
          }

          const { rows: activeRows } = await query<{ active_ceremony_id: number | null }>(
            tx,
            `SELECT active_ceremony_id FROM app_config WHERE id = TRUE`
          );
          const activeCeremonyId = activeRows[0]?.active_ceremony_id ?? null;
          if (!activeCeremonyId) {
            throw new AppError(
              "ACTIVE_CEREMONY_NOT_SET",
              409,
              "Active ceremony is not configured"
            );
          }
          if (Number(activeCeremonyId) !== Number(category.ceremony_id)) {
            throw new AppError(
              "CEREMONY_INACTIVE",
              409,
              "Only the active ceremony can accept winners"
            );
          }

          const winner = await upsertWinner(tx, {
            ceremony_id: category.ceremony_id,
            category_edition_id: categoryEditionId,
            nomination_id: nominationId
          });

          const lockedAtBefore = await getCeremonyDraftLockedAt(tx, category.ceremony_id);
          const lockedAt =
            lockedAtBefore ??
            (await lockCeremonyDraft(tx, category.ceremony_id)) ??
            lockedAtBefore;

          return { winner, draft_locked_at: lockedAt };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "winner_upsert",
            target_type: "category_edition",
            target_id: Number(categoryEditionId),
            meta: { ceremony_id: result.winner.ceremony_id, nomination_id: nominationId }
          });
        }

        return res
          .status(200)
          .json({ winner: result.winner, draft_locked_at: result.draft_locked_at });
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

        // Basic shape validation: ensure ceremonies array has only the active ceremony id.
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
          .filter((v) => Number.isFinite(v));
        const includesActive = ceremonyIds.some(
          (id) => Number(id) === Number(activeCeremonyId)
        );
        if (!includesActive) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Dataset ceremonies must include the active ceremony",
            { fields: ["ceremonies"] }
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
