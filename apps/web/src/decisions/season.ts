export function computeSeasonProgression(args: {
  isArchived: boolean;
  draftStatus: string | null | undefined;
}): "Archived" | "Draft complete" | "Drafting" | "Paused" | "Pre-draft" {
  const { isArchived, draftStatus } = args;
  if (isArchived) return "Archived";
  const ds = String(draftStatus ?? "").toUpperCase();
  if (ds === "COMPLETED") return "Draft complete";
  if (ds === "IN_PROGRESS" || ds === "LIVE") return "Drafting";
  if (ds === "PAUSED") return "Paused";
  return "Pre-draft";
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
  draftStatus: string | null | undefined;
}): "View results" | "View draft results" | "Enter draft room" {
  const cs = String(args.ceremonyStatus ?? "").toUpperCase();
  if (cs === "COMPLETE" || cs === "ARCHIVED") return "View results";

  const ds = String(args.draftStatus ?? "").toUpperCase();
  if (ds === "COMPLETED") return "View draft results";

  // PENDING / IN_PROGRESS / LIVE / PAUSED (and other pre-complete states)
  return "Enter draft room";
}

export function computeSeasonLifecycleLabelFromRow(args: {
  seasonStatus: string | null | undefined;
  draftStatus: string | null | undefined;
  isActiveCeremony: boolean | null | undefined;
}):
  | "Archived"
  | "Complete"
  | "In progress"
  | "Draft complete"
  | "Drafting"
  | "Pre-draft" {
  const seasonStatus = String(args.seasonStatus ?? "").toUpperCase();
  if (args.isActiveCeremony === false || seasonStatus === "ARCHIVED") return "Archived";

  if (seasonStatus === "COMPLETE") return "Complete";
  if (seasonStatus === "IN_PROGRESS") return "In progress";

  const ds = String(args.draftStatus ?? "").toUpperCase();
  if (ds === "COMPLETED") return "Draft complete";
  if (ds === "LIVE" || ds === "IN_PROGRESS" || ds === "PAUSED") return "Drafting";
  return "Pre-draft";
}
