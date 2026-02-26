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

export function leaguePath(input: { leagueId: number; leagueName?: string | null }): string {
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
