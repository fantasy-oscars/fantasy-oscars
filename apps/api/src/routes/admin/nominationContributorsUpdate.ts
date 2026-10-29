import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query, runInTransaction } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";
import {
  adminContributorParams,
  adminContributorUpdateBody
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";

export function registerAdminNominationContributorsUpdateRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.patch(
    "/nominations/:id/contributors/:contributorId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: nominationId, contributorId } = parseParams(
          adminContributorParams,
          req.params
        );

        const {
          display_name_override: displayName,
          display_role_override: displayRole,
          avatar_person_id_override: avatarPersonId
        } = parseBody(adminContributorUpdateBody, req.body);
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

          if (avatarPersonId !== null) {
            const { rows: peopleRows } = await query<{ id: number }>(
              tx,
              `SELECT id::int FROM person WHERE id = $1`,
              [Number(avatarPersonId)]
            );
            if (!peopleRows[0]?.id) {
              throw new AppError("NOT_FOUND", 404, "Avatar source person not found");
            }
          }

          const { rowCount } = await query(
            tx,
            `UPDATE nomination_contributor
             SET display_name_override = $3,
                 display_role_override = $4,
                 avatar_person_id_override = $5
             WHERE id = $1
               AND nomination_id = $2`,
            [contributorId, nominationId, displayName, displayRole, avatarPersonId]
          );
          if (!rowCount) throw new AppError("NOT_FOUND", 404, "Contributor not found");
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "update_nomination_contributor_display",
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
}
