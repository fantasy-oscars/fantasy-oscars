/*
 * Seasons can be set up before their ceremony or awards season goes live
 * (ceremony PUBLISHED, Circuit PUBLISHED). Players see it as "Coming soon";
 * the draft waits until it is live. No player copy here names a Circuit.
 */

/** Which room the draft runs in: a single ceremony's, or a full awards season's. */
export type DraftRoomKind = "ceremony" | "season";

export const COMING_SOON = "Coming soon";

/** Visible to players but not live yet: seasons can be set up, drafts cannot start. */
export function isComingSoon(status: string | null | undefined): boolean {
  return String(status ?? "").toUpperCase() === "PUBLISHED";
}

/** A picker option: the name, with "Coming soon" when it is not live yet. */
export function goLiveOptionLabel(option: {
  name: string;
  status: string | null | undefined;
}): string {
  return isComingSoon(option.status) ? `${option.name} · ${COMING_SOON}` : option.name;
}

/** Under a picker whose chosen option is coming soon: what works now and what waits. */
export function comingSoonSetupNote(room: DraftRoomKind): string {
  return room === "ceremony"
    ? "You can set up the season and invite players now. The draft opens when the ceremony goes live."
    : "You can set up the season and invite players now. The draft opens when the season goes live.";
}

function startDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

/**
 * The note on a season card while its ceremony or awards season is not live:
 * "Coming soon", with the start date when it is known. Null once it is live.
 */
export function comingSoonNote(input: {
  status: string | null | undefined;
  startsAt?: string | null;
}): string | null {
  if (!isComingSoon(input.status)) return null;
  const date = startDateLabel(input.startsAt);
  return date ? `${COMING_SOON} · ${date}` : COMING_SOON;
}

const NOT_LIVE_LINE: Record<DraftRoomKind, string> = {
  ceremony: "Opens when the ceremony goes live",
  season: "Opens when the season goes live"
};

export type DraftStartGate = {
  /** The viewer may press Start draft now. */
  canStart: boolean;
  /** The viewer is shown Start draft at all, enabled or not (commissioners only). */
  showStart: boolean;
  /** Why the draft cannot start yet, shown to everyone in the room; null when nothing blocks it. */
  blockedLine: string | null;
};

/**
 * Can the draft start, and why not. Only a commissioner starts it, and only
 * once the ceremony or awards season is live; until then everyone sees the
 * same line and the commissioner's Start draft is disabled. An unknown status
 * does not block: the server refuses a start that is not allowed.
 */
export function draftStartGate(input: {
  room: DraftRoomKind;
  /** The ceremony's status (ceremony room) or the awards season's (season room). */
  status: string | null | undefined;
  canManage: boolean;
}): DraftStartGate {
  const status = String(input.status ?? "").toUpperCase();
  const notLive = status === "DRAFT" || status === "PUBLISHED";
  const blockedLine = notLive ? NOT_LIVE_LINE[input.room] : null;
  return {
    canStart: input.canManage && !notLive,
    showStart: input.canManage,
    blockedLine
  };
}
