import type express from "express";
import type { Pool } from "pg";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query, runInTransaction } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import {
  createDraftEvent,
  type DraftEventRecord
} from "../../data/repositories/draftRepository.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import { AppError } from "../../errors.js";
import type { AuthCookieConfig } from "./logout.js";

export function registerAuthDeleteMeRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
  cookieConfig: AuthCookieConfig;
}): void {
  const { router, client, authSecret, cookieConfig } = args;

  router.delete("/me", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.auth?.sub);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
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
                "Cannot delete the last super admin account"
              );
            }
          }

          // Abort live drafts (IN_PROGRESS / PAUSED only — PENDING drafts are
          // pre-draft and should survive so remaining members can still play).
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
                payload: { reason: "user_deleted_self", deleted_user_id: id }
              });
              abortedDraftEvents.push(event);
            }
          }

          // Revoke pending invites addressed to or created by this user.
          await query(
            tx,
            `UPDATE season_invite
               SET status = 'REVOKED'
               WHERE status = 'PENDING'
                 AND (intended_user_id = $1 OR created_by_user_id = $1)`,
            [id]
          );

          // Remove per-user draft preferences.
          await query(tx, `DELETE FROM draft_plan WHERE user_id = $1`, [id]);
          await query(tx, `DELETE FROM draft_autodraft WHERE user_id = $1`, [id]);

          // Transfer or dissolve owned leagues.
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

          // Transfer open season ownership to the next member.
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

          // Remove open (non-completed) season memberships.
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

          // Cancel seasons that are now empty.
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

          // Capture league IDs before removing memberships.
          const { rows: userLeagueRows } = await query<{ league_id: number }>(
            tx,
            `SELECT DISTINCT league_id::int AS league_id
               FROM league_member
               WHERE user_id = $1`,
            [id]
          );
          const userLeagueIds = userLeagueRows.map((r) => r.league_id);

          // Remove league memberships without draft history.
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

          // Soft-delete leagues that are now empty.
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

          await insertAdminAudit(tx, {
            actor_user_id: id,
            action: "delete_account_self",
            target_type: "user",
            target_id: id,
            meta: { username: target.username }
          });

          return { abortedDraftEvents };
        }
      );

      // Clear auth cookie so the browser session ends immediately.
      res.clearCookie(cookieConfig.name, {
        httpOnly: cookieConfig.httpOnly,
        sameSite: cookieConfig.sameSite,
        secure: cookieConfig.secure,
        path: cookieConfig.path
      });

      for (const event of abortedDraftEvents) {
        emitDraftEvent(event);
      }

      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}
