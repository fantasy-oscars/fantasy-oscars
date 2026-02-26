import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query, runInTransaction } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

type UserDeletePreview = {
  leagues_removed: number;
  leagues_commissioner_transferred: number;
  open_season_memberships_removed: number;
  open_season_commissioner_transferred: number;
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

  return {
    leagues_removed: leaguesRemoved,
    leagues_commissioner_transferred: leaguesTransferred,
    open_season_memberships_removed: openSeasonRows.length,
    open_season_commissioner_transferred: openSeasonOwnerTransfers
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

      const deletedUser = await runInTransaction(client as Pool, async (tx) => {
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

        const { rows: openSeasonRows } = await query<{ season_id: number; role: string }>(
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

        await query(tx, `DELETE FROM league_member WHERE user_id = $1`, [id]);
        await query(tx, `DELETE FROM auth_password_reset WHERE user_id = $1`, [id]);
        await query(tx, `DELETE FROM auth_password WHERE user_id = $1`, [id]);
        await query(
          tx,
          `UPDATE app_user
           SET deleted_at = now(),
               username = $2,
               email = $3,
               is_admin = FALSE,
               admin_role = 'NONE',
               avatar_key = 'monkey'
           WHERE id = $1`,
          [id, `deleted-user-${id}`, `deleted+${id}@deleted.local`]
        );

        return { id: target.id, username: target.username, preview };
      });

      await insertAdminAudit(client as Pool, {
        actor_user_id: actorId,
        action: "delete_user",
        target_type: "user",
        target_id: deletedUser.id,
        meta: {
          username: deletedUser.username,
          consequences: deletedUser.preview
        }
      });

      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}
