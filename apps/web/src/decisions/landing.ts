export function titleCase(input: string) {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

export function computeLandingSeasonStatus(args: {
  draftStatus: string | null | undefined;
  draftId: number | null | undefined;
}): {
  label: string;
  urgent: boolean;
  urgencyHelp: string | null;
} {
  const draftStatus = String(args.draftStatus ?? "").toUpperCase();
  if (draftStatus === "LIVE" || draftStatus === "IN_PROGRESS") {
    return {
      label: "Draft Live",
      urgent: true,
      urgencyHelp: "Draft is currently in progress."
    };
  }
  if (draftStatus === "PAUSED") {
    return { label: "Draft Paused", urgent: true, urgencyHelp: "Draft is paused." };
  }
  if (draftStatus === "COMPLETED") {
    return { label: "Draft Complete", urgent: false, urgencyHelp: null };
  }
  if (!args.draftId) {
    return { label: "Draft Not Started", urgent: false, urgencyHelp: null };
  }
  return { label: "Draft Not Started", urgent: false, urgencyHelp: null };
}

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
