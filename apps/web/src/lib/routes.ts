export function slugifyPathSegment(value: string | null | undefined): string {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

export function parsePositiveIntParam(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return null;
  return parsed;
}

export function leaguePath(input: {
  leagueId: number;
  leagueName?: string | null;
}): string {
  return `/leagues/${input.leagueId}/${slugifyPathSegment(input.leagueName ?? "")}`;
}

export function leagueSeasonCreatePath(input: {
  leagueId: number;
  leagueName?: string | null;
}): string {
  return `${leaguePath(input)}/seasons/new`;
}

export function ceremonyCodeSlug(ceremonyCode: string | null | undefined): string {
  return slugifyPathSegment(ceremonyCode ?? "ceremony");
}

export function seasonPath(input: {
  leagueId: number;
  leagueName?: string | null;
  ceremonyCode: string | null | undefined;
  ceremonyId?: number | null;
}): string {
  return `/leagues/${input.leagueId}/${slugifyPathSegment(input.leagueName ?? "")}/${ceremonyCodeSlug(
    input.ceremonyCode ?? (input.ceremonyId ? String(input.ceremonyId) : "ceremony")
  )}`;
}

/**
 * A league's competition in one Circuit. Players see it as a full awards
 * season, so its URL sits under the league's seasons and never says "circuit".
 */
export function circuitLeaguePath(input: {
  leagueId: number;
  leagueName?: string | null;
  circuitLeagueId: number;
}): string {
  return `${leaguePath(input)}/seasons/full/${input.circuitLeagueId}`;
}

/** A member's roster in a league's season; no member shows the viewer's own. */
export function circuitRosterPath(input: {
  leagueId: number;
  leagueName?: string | null;
  circuitLeagueId: number;
  memberUserId?: number | null;
}): string {
  const base = `${circuitLeaguePath(input)}/roster`;
  return input.memberUserId ? `${base}?member=${input.memberUserId}` : base;
}

/** The transaction log of a league's season. */
export function circuitTransactionsPath(input: {
  leagueId: number;
  leagueName?: string | null;
  circuitLeagueId: number;
}): string {
  return `${circuitLeaguePath(input)}/transactions`;
}

/** The draft of a league's season: the lobby before it starts, then the room. */
export function circuitDraftPath(input: {
  leagueId: number;
  leagueName?: string | null;
  circuitLeagueId: number;
}): string {
  return `${circuitLeaguePath(input)}/draft`;
}
