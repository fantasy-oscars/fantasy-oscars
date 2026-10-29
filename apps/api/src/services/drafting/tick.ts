import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import { runInTransaction } from "../../data/db.js";
import { getDraftByIdForUpdate } from "../../data/repositories/draftRepository.js";
import { getLeagueById } from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { autoPickIfExpired, runImmediateAutodraftIfEnabled } from "./autoPick.js";

export async function tickDraft(pool: Pool, draftId: number) {
  const updated = await runInTransaction(pool, async (tx) => {
    const lockedDraft = await getDraftByIdForUpdate(tx, draftId);
    if (!lockedDraft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

    const season = await getSeasonById(tx, lockedDraft.season_id);
    if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");

    const league = await getLeagueById(tx, season.league_id);
    if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

    // If a pick timer is enabled, this can auto-pick when the deadline has passed.
    return await autoPickIfExpired({ tx, draft: lockedDraft, season, league });
  });
  // If the next (or subsequent) seat has user-enabled auto-draft, schedule it.
  // This keeps auto-picks paced even when driven by timer tick endpoints.
  await runImmediateAutodraftIfEnabled({ pool, draftId });
  return updated;
}
