/**
 * The one status vocabulary for a season, in order: Pre-draft, Drafting, In progress,
 * Complete. "Paused" (a paused draft) and "Closed" (cancelled, archived or no longer
 * active) sit beside them. Full seasons use the same words (`circuitLeagueStatusLabel`).
 */
export type SeasonStatusLabel =
  "Closed" | "Complete" | "In progress" | "Drafting" | "Paused" | "Pre-draft";

/**
 * A single-ceremony season: Closed once archived or cancelled, Complete once the
 * ceremony's results are final, In progress from the end of the draft until then.
 */
function singleCeremonyStatusLabel(args: {
  closed: boolean;
  draftStatus: string | null | undefined;
  resultsFinalizedAt: string | null | undefined;
}): SeasonStatusLabel {
  const ds = String(args.draftStatus ?? "").toUpperCase();
  if (args.closed || ds === "CANCELLED") return "Closed";
  if (args.resultsFinalizedAt) return "Complete";
  if (ds === "COMPLETED") return "In progress";
  if (ds === "IN_PROGRESS" || ds === "LIVE") return "Drafting";
  if (ds === "PAUSED") return "Paused";
  return "Pre-draft";
}

export function computeSeasonProgression(args: {
  isArchived: boolean;
  draftStatus: string | null | undefined;
  resultsFinalizedAt?: string | null;
}): SeasonStatusLabel {
  return singleCeremonyStatusLabel({
    closed: args.isArchived,
    draftStatus: args.draftStatus,
    resultsFinalizedAt: args.resultsFinalizedAt
  });
}

export function computeSeasonLocked(args: {
  isArchived: boolean;
  draftStatus: string | null | undefined;
}): boolean {
  const { isArchived, draftStatus } = args;
  if (isArchived) return true;
  const ds = String(draftStatus ?? "").toUpperCase();
  return Boolean(ds && ds !== "PENDING");
}

export function computeSeasonDraftRoomCtaLabel(args: {
  ceremonyStatus: string | null | undefined;
  resultsFinalizedAt: string | null | undefined;
  draftStatus: string | null | undefined;
}): "View results" | "View draft results" | "Enter draft room" | "Draft unavailable" {
  const cs = String(args.ceremonyStatus ?? "").toUpperCase();
  if (args.resultsFinalizedAt || cs === "ARCHIVED") return "View results";

  const ds = String(args.draftStatus ?? "").toUpperCase();
  if (cs === "LOCKED" && ds !== "COMPLETED") return "Draft unavailable";
  if (ds === "CANCELLED") return "Draft unavailable";
  if (ds === "COMPLETED") return "View draft results";

  // PENDING / IN_PROGRESS / LIVE / PAUSED (and other pre-complete states)
  return "Enter draft room";
}

export function computeSeasonLifecycleLabelFromRow(args: {
  seasonStatus: string | null | undefined;
  draftStatus: string | null | undefined;
  isActiveCeremony: boolean | null | undefined;
  resultsFinalizedAt?: string | null;
}): SeasonStatusLabel {
  const seasonStatus = String(args.seasonStatus ?? "").toUpperCase();
  const closed = args.isActiveCeremony === false || seasonStatus === "ARCHIVED";
  if (!closed && seasonStatus === "COMPLETE") return "Complete";
  if (!closed && seasonStatus === "IN_PROGRESS") return "In progress";
  return singleCeremonyStatusLabel({
    closed,
    draftStatus: args.draftStatus,
    resultsFinalizedAt: args.resultsFinalizedAt
  });
}
