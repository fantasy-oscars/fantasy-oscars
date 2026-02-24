export function computeSeasonCeremonyLabel(season: {
  ceremony_name?: string | null;
  ceremony_code?: string | null;
  ceremony_id: number;
}): string {
  if (season.ceremony_name) return season.ceremony_name;
  if (season.ceremony_code) return season.ceremony_code;
  return `Ceremony ${season.ceremony_id}`;
}
