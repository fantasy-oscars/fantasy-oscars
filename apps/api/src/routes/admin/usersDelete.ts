import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query, runInTransaction } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import {
  createDraftEvent,
  type DraftEventRecord
} from "../../data/repositories/draftRepository.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import { AppError } from "../../errors.js";

type UserDeletePreview = {
  leagues_removed: number;
  leagues_commissioner_transferred: number;
  open_season_memberships_removed: number;
  open_season_commissioner_transferred: number;
  drafts_aborted: number;
};

async function computeUserDeletePreview(
  db: DbClient,
  userId: number
): Promise<UserDeletePreview> {
  const { rows: ownedLeagueRows } = await query<{ league_id: number }>(
    db,
    `SELECT lm.league_id::int AS league_id
     FROM league_member lm
     WHERE lm.user_id = $1
       AND lm.role = 'OWNER'`,
    [userId]
  );

  let leaguesRemoved = 0;
  let leaguesTransferred = 0;
  for (const league of ownedLeagueRows) {
    const { rows: replacementRows } = await query<{ user_id: number }>(
      db,
      `SELECT lm.user_id::int AS user_id
       FROM league_member lm
       WHERE lm.league_id = $1
         AND lm.user_id <> $2
       ORDER BY lm.joined_at ASC, lm.user_id ASC
       LIMIT 1`,
      [league.league_id, userId]
    );
    if (replacementRows[0]) leaguesTransferred += 1;
    else leaguesRemoved += 1;
  }

  const { rows: openSeasonRows } = await query<{ season_id: number; role: string }>(
    db,
    `SELECT sm.season_id::int AS season_id, sm.role
     FROM season_member sm
     JOIN season s ON s.id = sm.season_id
     LEFT JOIN draft d ON d.season_id = s.id
     WHERE sm.user_id = $1
       AND s.status = 'EXTANT'
       AND COALESCE(d.status, 'PENDING') <> 'COMPLETED'`,
    [userId]
  );

  let openSeasonOwnerTransfers = 0;
  for (const season of openSeasonRows) {
    if (season.role !== "OWNER") continue;
    const { rows: replacementRows } = await query<{ user_id: number }>(
      db,
      `SELECT sm.user_id::int AS user_id
       FROM season_member sm
       WHERE sm.season_id = $1
         AND sm.user_id <> $2
       ORDER BY sm.joined_at ASC, sm.user_id ASC
       LIMIT 1`,
      [season.season_id, userId]
    );
    if (replacementRows[0]) openSeasonOwnerTransfers += 1;
  }

  const { rows: draftRows } = await query<{ n: number }>(
    db,
    `SELECT COUNT(DISTINCT d.id)::int AS n
     FROM draft d
     JOIN season_member sm ON sm.season_id = d.season_id AND sm.user_id = $1
     WHERE d.status IN ('IN_PROGRESS', 'PAUSED')`,
    [userId]
  );

  return {
    leagues_removed: leaguesRemoved,
    leagues_commissioner_transferred: leaguesTransferred,
    open_season_memberships_removed: openSeasonRows.length,
    open_season_commissioner_transferred: openSeasonOwnerTransfers,
    drafts_aborted: Number(draftRows[0]?.n ?? 0)
  };
}

export function registerAdminUsersDeleteRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/users/:id/delete-preview", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid user id");
      }

      const { rows: userRows } = await query<{ id: number; username: string }>(
        client,
        `SELECT id::int, username
         FROM app_user
         WHERE id = $1
           AND deleted_at IS NULL`,
        [id]
      );
      const user = userRows[0];
      if (!user) throw new AppError("NOT_FOUND", 404, "User not found");

      const preview = await computeUserDeletePreview(client, id);
      return res.status(200).json({
        user: { id: user.id, username: user.username },
        consequences: preview
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/users/:id", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      const actorId = Number(req.auth?.sub);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid user id");
      }
      if (!Number.isInteger(actorId) || actorId <= 0) {
        throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      }
      if (id === actorId) {
        throw new AppError("CANNOT_DELETE_SELF", 409, "You cannot remove your own user");
      }

      const { abortedDraftEvents } = await runInTransaction(
        client as Pool,
        async (tx) => {
          const { rows: userRows } = await query<{
            id: number;
            username: string;
            admin_role: string;
          }>(
            tx,
            `SELECT id::int,
                    username,
                    COALESCE(admin_role, CASE WHEN is_admin THEN 'SUPER_ADMIN' ELSE 'NONE' END) AS admin_role
             FROM app_user
             WHERE id = $1
               AND deleted_at IS NULL
             FOR UPDATE`,
            [id]
          );
          const target = userRows[0];
          if (!target) throw new AppError("NOT_FOUND", 404, "User not found");

          if (target.admin_role === "SUPER_ADMIN") {
            const { rows: countRows } = await query<{ n: number }>(
              tx,
              `SELECT COUNT(*)::int AS n
               FROM app_user
               WHERE deleted_at IS NULL
                 AND COALESCE(admin_role, CASE WHEN is_admin THEN 'SUPER_ADMIN' ELSE 'NONE' END) = 'SUPER_ADMIN'`
            );
            const superAdminCount = Number(countRows[0]?.n ?? 0);
            if (superAdminCount <= 1) {
              throw new AppError(
                "CANNOT_DELETE_LAST_SUPER_ADMIN",
                409,
                "Cannot remove the last super admin"
              );
            }
          }

          const preview = await computeUserDeletePreview(tx, id);

          // --- Abort active drafts ---
          // Only IN_PROGRESS and PAUSED drafts are cancelled. PENDING drafts
          // (pre-draft seasons that haven't started yet) are left intact so that
          // the remaining participants can still run their draft. If a PENDING-draft
          // season collapses to zero members further below, the orphaned-season step
          // will cancel the season; the draft then becomes unreachable but is left
          // as-is rather than adding a second UPDATE.
          //
          // Completed drafts are intentionally preserved. Their league_member and
          // draft_pick rows are retained further below to keep game history valid.
          // The app_user row is anonymised (not hard-deleted), satisfying GDPR
          // Art. 17's exemption for processing necessary for performance of contract:
          // PII is erased while pseudonymous game records are kept.
          const { rows: activeDraftRows } = await query<{ id: number }>(
            tx,
            `SELECT DISTINCT d.id::int
             FROM draft d
             JOIN season_member sm ON sm.season_id = d.season_id AND sm.user_id = $1
             WHERE d.status IN ('IN_PROGRESS', 'PAUSED')`,
            [id]
          );

          const abortedDraftEvents: DraftEventRecord[] = [];
          if (activeDraftRows.length > 0) {
            const activeDraftIds = activeDraftRows.map((r) => r.id);
            await query(
              tx,
              `UPDATE draft
               SET status = 'CANCELLED',
                   completed_at = now(),
                   pick_deadline_at = NULL,
                   pick_timer_remaining_ms = NULL
               WHERE id = ANY($1::int[])`,
              [activeDraftIds]
            );
            for (const draft of activeDraftRows) {
              const event = await createDraftEvent(tx, {
                draft_id: draft.id,
                event_type: "draft.cancelled",
                payload: { reason: "admin_user_deleted", deleted_user_id: id }
              });
              abortedDraftEvents.push(event);
            }
          }

          // --- Revoke pending season invites ---
          // USER_TARGETED invites for the deleted user can never be claimed.
          // Pending invites the user created are revoked because the creator will
          // no longer exist to manage those seasons.
          await query(
            tx,
            `UPDATE season_invite
             SET status = 'REVOKED'
             WHERE status = 'PENDING'
               AND (intended_user_id = $1 OR created_by_user_id = $1)`,
            [id]
          );

          // --- Remove per-user draft preferences ---
          // draft_plan and draft_autodraft have ON DELETE CASCADE FKs to app_user,
          // but that only fires on a hard DELETE. Soft-delete requires explicit cleanup.
          await query(tx, `DELETE FROM draft_plan WHERE user_id = $1`, [id]);
          await query(tx, `DELETE FROM draft_autodraft WHERE user_id = $1`, [id]);

          // --- Handle owned leagues (transfer ownership or delete) ---
          const { rows: ownedLeagueRows } = await query<{ league_id: number }>(
            tx,
            `SELECT lm.league_id::int AS league_id
             FROM league_member lm
             WHERE lm.user_id = $1
               AND lm.role = 'OWNER'`,
            [id]
          );
          for (const league of ownedLeagueRows) {
            const { rows: replacementRows } = await query<{ user_id: number }>(
              tx,
              `SELECT lm.user_id::int AS user_id
               FROM league_member lm
               WHERE lm.league_id = $1
                 AND lm.user_id <> $2
               ORDER BY lm.joined_at ASC, lm.user_id ASC
               LIMIT 1`,
              [league.league_id, id]
            );
            const replacement = replacementRows[0];
            if (!replacement) {
              await query(tx, `DELETE FROM league WHERE id = $1`, [league.league_id]);
              continue;
            }
            await query(
              tx,
              `UPDATE league_member
               SET role = 'MEMBER'
               WHERE league_id = $1
                 AND user_id = $2
                 AND role = 'OWNER'`,
              [league.league_id, id]
            );
            await query(
              tx,
              `UPDATE league_member
               SET role = 'OWNER'
               WHERE league_id = $1
                 AND user_id = $2`,
              [league.league_id, replacement.user_id]
            );
          }

          // --- Handle open season ownership (transfer to next member) ---
          const { rows: openSeasonRows } = await query<{
            season_id: number;
            role: string;
          }>(
            tx,
            `SELECT sm.season_id::int AS season_id, sm.role
             FROM season_member sm
             JOIN season s ON s.id = sm.season_id
             LEFT JOIN draft d ON d.season_id = s.id
             WHERE sm.user_id = $1
               AND s.status = 'EXTANT'
               AND COALESCE(d.status, 'PENDING') <> 'COMPLETED'`,
            [id]
          );
          for (const season of openSeasonRows) {
            if (season.role !== "OWNER") continue;
            const { rows: replacementRows } = await query<{ user_id: number }>(
              tx,
              `SELECT sm.user_id::int AS user_id
               FROM season_member sm
               WHERE sm.season_id = $1
                 AND sm.user_id <> $2
               ORDER BY sm.joined_at ASC, sm.user_id ASC
               LIMIT 1`,
              [season.season_id, id]
            );
            const replacement = replacementRows[0];
            if (!replacement) continue;
            await query(
              tx,
              `UPDATE season_member
               SET role = 'MEMBER'
               WHERE season_id = $1
                 AND user_id = $2
                 AND role = 'OWNER'`,
              [season.season_id, id]
            );
            await query(
              tx,
              `UPDATE season_member
               SET role = 'OWNER'
               WHERE season_id = $1
                 AND user_id = $2`,
              [season.season_id, replacement.user_id]
            );
          }

          // --- Remove open season memberships ---
          await query(
            tx,
            `DELETE FROM season_member sm
             USING season s
             LEFT JOIN draft d ON d.season_id = s.id
             WHERE sm.season_id = s.id
               AND sm.user_id = $1
               AND s.status = 'EXTANT'
               AND COALESCE(d.status, 'PENDING') <> 'COMPLETED'`,
            [id]
          );

          // --- Cancel orphaned EXTANT seasons ---
          // If the deleted user was the last member of an open, non-completed season,
          // that season now has no participants and must be closed.
          await query(
            tx,
            `UPDATE season s
             SET status = 'CANCELLED',
                 deleted_at = COALESCE(s.deleted_at, now())
             WHERE s.status = 'EXTANT'
               AND NOT EXISTS (
                 SELECT 1 FROM season_member sm WHERE sm.season_id = s.id
               )
               AND COALESCE(
                 (SELECT d.status FROM draft d WHERE d.season_id = s.id LIMIT 1),
                 'PENDING'
               ) <> 'COMPLETED'`
          );

          // --- Capture league IDs before removing memberships ---
          const { rows: userLeagueRows } = await query<{ league_id: number }>(
            tx,
            `SELECT DISTINCT league_id::int AS league_id
             FROM league_member
             WHERE user_id = $1`,
            [id]
          );
          const userLeagueIds = userLeagueRows.map((r) => r.league_id);

          // --- Remove league memberships without draft history ---
          // Rows referenced by draft_seat or draft_pick are retained so completed
          // draft records remain valid (pseudonymous game history, see note above).
          await query(
            tx,
            `DELETE FROM league_member lm
             WHERE lm.user_id = $1
               AND NOT EXISTS (
                 SELECT 1
                 FROM draft_pick dp
                 WHERE dp.league_member_id = lm.id
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM draft_seat ds
                 WHERE ds.league_member_id = lm.id
               )`,
            [id]
          );

          // --- Soft-delete leagues that are now empty ---
          // A league whose last member just had their row removed is effectively dead.
          if (userLeagueIds.length > 0) {
            await query(
              tx,
              `UPDATE league
               SET deleted_at = COALESCE(deleted_at, now())
               WHERE id = ANY($1::int[])
                 AND deleted_at IS NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM league_member lm WHERE lm.league_id = league.id
                 )`,
              [userLeagueIds]
            );
          }

          await query(tx, `DELETE FROM auth_password_reset WHERE user_id = $1`, [id]);
          await query(tx, `DELETE FROM auth_password WHERE user_id = $1`, [id]);
          await query(
            tx,
            `UPDATE app_user
             SET deleted_at = now(),
                 username = $2,
                 email = $3,
                 is_admin = FALSE,
                 admin_role = NULL,
                 avatar_key = 'monkey'
             WHERE id = $1`,
            [id, `deleted-user-${id}`, `deleted+${id}@deleted.local`]
          );

          // Audit is recorded inside the transaction so it is atomically committed
          // or rolled back with the delete itself.
          await insertAdminAudit(tx, {
            actor_user_id: actorId,
            action: "delete_user",
            target_type: "user",
            target_id: target.id,
            meta: {
              username: target.username,
              consequences: preview
            }
          });

          return { abortedDraftEvents };
        }
      );

      // Notify connected draft clients that their sessions were terminated.
      // Done after the transaction commits so we never emit for a rolled-back change.
      for (const event of abortedDraftEvents) {
        emitDraftEvent(event);
      }

      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}
