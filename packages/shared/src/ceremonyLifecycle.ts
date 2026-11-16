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
 * Seasons and drafts can be created only while the ceremony is open for leagues.
 */
export function isCeremonyOpenForLeagues(status: string): boolean {
  return status === "ACTIVE";
}
