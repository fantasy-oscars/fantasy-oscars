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

export function markdownToTagline(markdown: string): string {
  const block =
    markdown
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  const noLinks = block.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const noStars = noLinks.replace(/[*_`>#]/g, "");
  return noStars.replace(/\s+/g, " ").trim();
}

export function computeLandingSeasonCeremonyLabel(args: {
  ceremonyName: string | null | undefined;
  ceremonyId: number;
}): string {
  return args.ceremonyName ?? `Ceremony ${args.ceremonyId}`;
}

/** Shown in the hero when the landing blurb cannot be loaded. */
export const HERO_FALLBACK_TAGLINE = "Draft night, but for awards.";

export type HeroTitleTier = "display" | "medium" | "long";

/**
 * How large the hero title may be set, from its length and its longest word
 * (code points, words split on whitespace). Long titles fall back to the
 * page-title size so they wrap instead of overflowing.
 */
export function computeHeroTitleTier(title: string): HeroTitleTier {
  const text = title.trim();
  const length = [...text].length;
  const longestWord = text
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, [...word].length), 0);
  if (length <= 24 && longestWord <= 8) return "display";
  if (length <= 40 && longestWord <= 12) return "medium";
  return "long";
}

/** "Jan 31, 2026" in the viewer's locale; empty when the date is missing or invalid. */
export function formatUpdateDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
