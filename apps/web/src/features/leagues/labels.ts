import type { LeagueDetail, SeasonSummary } from "../../lib/types";

export function seasonLabel(season: SeasonSummary) {
  const date = season.ceremony_starts_at ?? season.created_at;
  try {
    const year = new Date(date).getFullYear();
    if (Number.isFinite(year)) return `Season ${year}`;
  } catch {
    // Fall back to id below.
  }
  return `Season ${season.id}`;
}

export function buildLeagueInviteText(input: {
  origin: string;
  league: Pick<LeagueDetail, "id" | "code">;
}) {
  const link = `${input.origin}/leagues/${input.league.id}`;
  return `League invite code: ${input.league.code}\nLink: ${link}`;
}
