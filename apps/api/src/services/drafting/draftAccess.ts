import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import { getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";

export type DraftViewer = { userId: number | null; isSuperAdmin: boolean };

type DraftScope = { league_id: number; season_id: number };

/**
 * Who may see a draft: a member of its league or season, or a super admin.
 * Anyone else gets the same 404 as a draft that does not exist.
 */
export async function assertDraftReadAccess(
  pool: Pool,
  draft: DraftScope,
  viewer: DraftViewer
): Promise<void> {
  if (viewer.isSuperAdmin) return;
  if (viewer.userId) {
    const leagueMember = await getLeagueMember(pool, draft.league_id, viewer.userId);
    if (leagueMember) return;
    const seasonMember = await getSeasonMember(pool, draft.season_id, viewer.userId);
    if (seasonMember) return;
  }
  throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
}

/**
 * Who may change a draft's recorded results: a league owner or co-owner, or a
 * super admin. Non-members get the 404 for a missing draft; plain members are
 * told commissioner permission is required.
 */
export async function assertDraftCommissionerAccess(
  pool: Pool,
  draft: DraftScope,
  viewer: DraftViewer
): Promise<void> {
  if (viewer.isSuperAdmin) return;
  const leagueMember = viewer.userId
    ? await getLeagueMember(pool, draft.league_id, viewer.userId)
    : null;
  if (!leagueMember) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
  if (leagueMember.role !== "OWNER" && leagueMember.role !== "CO_OWNER") {
    throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
  }
}
