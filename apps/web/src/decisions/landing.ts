export function computeLandingSeasonCeremonyLabel(args: {
  ceremonyName: string | null | undefined;
  ceremonyId: number;
}): string {
  return args.ceremonyName ?? `Ceremony ${args.ceremonyId}`;
}

/** The tagline under the Home hero title. */
export const HERO_TAGLINE = "Draft night, but for awards.";

/** "Jan 31, 2026" in the viewer's locale; empty when the date is missing or invalid. */
export function formatUpdateDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
