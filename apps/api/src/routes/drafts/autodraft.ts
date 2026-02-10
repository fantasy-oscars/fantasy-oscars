import type { NextFunction, Response } from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { query, runInTransaction } from "../../data/db.js";
import {
  getDraftById,
  getDraftByIdForUpdate
} from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import {
  getDraftAutodraftConfig,
  upsertDraftAutodraftConfig
} from "../../data/repositories/draftAutodraftRepository.js";
import { runImmediateAutodraftIfEnabled } from "../../services/drafting/autoPick.js";

export function buildGetDraftAutodraftHandler(client: DbClient) {
  return async function handleGetDraftAutodraft(
    req: AuthedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

      const draft = await getDraftById(client, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
      const season = await getSeasonById(client, draft.season_id);
      if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
      const membership = await getSeasonMember(client, season.id, userId);
      if (!membership) throw new AppError("FORBIDDEN", 403, "Not a season member");

      const cfg =
        (await getDraftAutodraftConfig(client, {
          draft_id: draftId,
          user_id: userId
        })) ?? { enabled: false, strategy: "RANDOM" as const, plan_id: null };

      return res.status(200).json({ autodraft: cfg });
    } catch (err) {
      next(err);
    }
  };
}

export function buildUpsertDraftAutodraftHandler(pool: Pool) {
  return async function handleUpsertDraftAutodraft(
    req: AuthedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

      const enabled = Boolean(req.body?.enabled);
      const strategyRaw = String(req.body?.strategy ?? "RANDOM").toUpperCase();
      if (
        strategyRaw !== "RANDOM" &&
        strategyRaw !== "PLAN" &&
        strategyRaw !== "BY_CATEGORY" &&
        strategyRaw !== "ALPHABETICAL" &&
        strategyRaw !== "WISDOM"
      ) {
        throw validationError("Invalid strategy", ["strategy"]);
      }
      const strategy = strategyRaw as
        | "RANDOM"
        | "PLAN"
        | "BY_CATEGORY"
        | "ALPHABETICAL"
        | "WISDOM";
      const planIdRaw = req.body?.plan_id;
      const planId =
        planIdRaw === null || planIdRaw === undefined || planIdRaw === ""
          ? null
          : Number(planIdRaw);
      if (planId !== null && (!Number.isFinite(planId) || planId <= 0)) {
        throw validationError("Invalid plan_id", ["plan_id"]);
      }

      const result = await runInTransaction(pool, async (tx) => {
        const draft = await getDraftByIdForUpdate(tx, draftId);
        if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
        if (draft.status === "COMPLETED") {
          throw new AppError(
            "DRAFT_SETTINGS_LOCKED",
            409,
            "Auto-draft settings are locked once the draft completes"
          );
        }

        const season = await getSeasonById(tx, draft.season_id);
        if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        const membership = await getSeasonMember(tx, season.id, userId);
        if (!membership) throw new AppError("FORBIDDEN", 403, "Not a season member");

        let resolvedPlanId = enabled && strategy === "PLAN" ? planId : null;
        if (resolvedPlanId) {
          // Validate the plan belongs to this user and ceremony.
          const { rows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM draft_plan WHERE id = $1 AND user_id = $2 AND ceremony_id = $3`,
            [resolvedPlanId, userId, season.ceremony_id]
          );
          if (!rows[0]) {
            throw new AppError("NOT_FOUND", 404, "Draft plan not found");
          }
        }

        const cfg = await upsertDraftAutodraftConfig(tx, {
          draft_id: draftId,
          user_id: userId,
          enabled,
          strategy,
          plan_id: resolvedPlanId
        });

        return cfg;
      });

      if (result.enabled) {
        // If the current seat user enables auto-draft, schedule it (no timer wait).
        await runImmediateAutodraftIfEnabled({ pool, draftId });
      }
      return res.status(200).json({ autodraft: result });
    } catch (err) {
      next(err);
    }
  };
}

