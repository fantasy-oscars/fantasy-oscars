import { isIntegrityWarningWindow } from "../../lib/draft";
import type { LeagueMember, SeasonMember, SeasonMeta } from "../../lib/types";

export function computeSeasonIsArchived(season: SeasonMeta | null) {
  if (!season) return false;
  return season.is_active_ceremony === false || season.status !== "EXTANT";
}

export function computeAvailableLeagueMembers(args: {
  leagueMembers: LeagueMember[] | null | undefined;
  seasonMembers: SeasonMember[];
}) {
  const leagueMembers = args.leagueMembers ?? [];
  return leagueMembers.filter(
    (m) => !args.seasonMembers.some((sm) => sm.user_id === m.user_id)
  );
}

export function computeIntegrityWarningActive(args: {
  season: SeasonMeta | null;
  nowTs: number;
}) {
  const season = args.season;
  if (!season) return false;
  const ceremonyStartsAt = season.ceremony_starts_at ?? null;
  const draftStatus = season.draft_status ?? null;
  const draftWarningEligible =
    (season.is_active_ceremony ?? false) &&
    draftStatus &&
    (draftStatus === "PENDING" ||
      draftStatus === "IN_PROGRESS" ||
      draftStatus === "PAUSED");
  return draftWarningEligible && isIntegrityWarningWindow(ceremonyStartsAt, args.nowTs);
}
