export const ceremonyStatuses = [
  "DRAFT",
  "PUBLISHED",
  "ACTIVE",
  "LOCKED",
  "ARCHIVED"
] as const;
export type CeremonyStatus = (typeof ceremonyStatuses)[number];

export function isCeremonyStatus(status: string): status is CeremonyStatus {
  return (ceremonyStatuses as readonly string[]).includes(status);
}

/**
 * Categories and nominations can be edited until the ceremony opens for leagues.
 */
export function isCeremonyContentEditable(status: string): boolean {
  return status === "DRAFT" || status === "PUBLISHED";
}

/**
 * Seasons can be set up once the ceremony is visible to players: while it is
 * published and still being finished, and after it opens for leagues.
 */
export function isCeremonyOpenForSeasons(status: string): boolean {
  return status === "PUBLISHED" || status === "ACTIVE";
}

/**
 * Drafts start only once the ceremony is open for leagues, when its content is
 * frozen.
 */
export function isCeremonyOpenForLeagues(status: string): boolean {
  return status === "ACTIVE";
}
