// Ordered ceremony lifecycle; later entries come after earlier ones.
export const CEREMONY_LIFECYCLE = [
  "DRAFT",
  "PUBLISHED",
  "LOCKED",
  "COMPLETE",
  "ARCHIVED"
] as const;

export type CeremonyStatus = (typeof CEREMONY_LIFECYCLE)[number];
