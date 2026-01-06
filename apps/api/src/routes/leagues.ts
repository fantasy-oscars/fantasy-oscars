import express from "express";
import { validationError, AppError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { createLeague, getLeagueById } from "../data/repositories/leagueRepository.js";
import type { DbClient } from "../data/db.js";

export function createLeaguesRouter(client: DbClient, authSecret: string) {
  const router = express.Router();

  router.post("/", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const { code, name, ceremony_id, max_members, roster_size, is_public } =
        req.body ?? {};
      const creator = req.auth;
      if (!creator?.sub) {
        throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      }

      if (!code || !name || !ceremony_id || !max_members || !roster_size) {
        throw validationError("Missing required fields", [
          "code",
          "name",
          "ceremony_id",
          "max_members",
          "roster_size"
        ]);
      }

      const league = await createLeague(client, {
        code: String(code),
        name: String(name),
        ceremony_id: Number(ceremony_id),
        max_members: Number(max_members),
        roster_size: Number(roster_size),
        is_public: Boolean(is_public),
        created_by_user_id: Number(creator.sub)
      });

      return res.status(201).json({ league });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        throw validationError("Invalid league id", ["id"]);
      }
      const league = await getLeagueById(client, id);
      if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      return res.json({ league });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
