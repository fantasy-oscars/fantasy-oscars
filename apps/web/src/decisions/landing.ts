export function titleCase(input: string) {
  return input
    .toLowerCase()
    .split(/\\s+/)
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
