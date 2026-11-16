export type DynamicKey = "banner" | "home_main";

export const DYNAMIC_META: Record<DynamicKey, { label: string; hint: string }> = {
  home_main: {
    label: "Home announcement",
    hint: "Exactly one Home announcement is published at a time."
  },
  banner: {
    label: "Banner announcement",
    hint: "Several banners may be published at the same time."
  }
};

/** The two announcement types, one per dynamic content key. */
export type AnnouncementType = "home" | "banner";
export type AnnouncementFilter = "all" | AnnouncementType;

export const ANNOUNCEMENT_TYPES: AnnouncementType[] = ["home", "banner"];

export const ANNOUNCEMENT_TYPE_KEY: Record<AnnouncementType, DynamicKey> = {
  home: "home_main",
  banner: "banner"
};

export const ANNOUNCEMENT_TYPE_LABEL: Record<AnnouncementType, string> = {
  home: "Home",
  banner: "Banner"
};

export function announcementTypeForKey(key: string): AnnouncementType | null {
  if (key === "home_main") return "home";
  if (key === "banner") return "banner";
  return null;
}

export function parseAnnouncementFilter(raw: string | null): AnnouncementFilter {
  return raw === "home" || raw === "banner" ? raw : "all";
}

export function filterAnnouncements<T extends { key: string }>(
  entries: T[],
  filter: AnnouncementFilter
): T[] {
  if (filter === "all") return entries;
  return entries.filter((e) => announcementTypeForKey(e.key) === filter);
}

/** Most recently updated first; ties fall back to the higher id. */
export function sortAnnouncements<T extends { id: number; updated_at: string }>(
  entries: T[]
): T[] {
  const time = (value: string) => {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  return [...entries].sort(
    (a, b) => time(b.updated_at) - time(a.updated_at) || b.id - a.id
  );
}

/**
 * Only one Home announcement is published at a time: publishing a Home entry
 * unpublishes the current one. Returns that entry so the caller can confirm the
 * replacement, or null when publishing `entryId` replaces nothing.
 */
export function homeAnnouncementToReplace<
  T extends { id: number; key: string; status: string }
>(entries: T[], entryId: number): T | null {
  const target = entries.find((e) => e.id === entryId);
  if (!target || announcementTypeForKey(target.key) !== "home") return null;
  return (
    entries.find(
      (e) =>
        e.id !== entryId &&
        announcementTypeForKey(e.key) === "home" &&
        e.status === "PUBLISHED"
    ) ?? null
  );
}

const OPERATOR_DYNAMIC_KEYS = new Set<DynamicKey>(["home_main", "banner"]);

export function canEditDynamicContentByRole(args: {
  role: "NONE" | "OPERATOR" | "SUPER_ADMIN";
  key: DynamicKey;
}) {
  if (args.role === "SUPER_ADMIN") return true;
  if (args.role === "OPERATOR") return OPERATOR_DYNAMIC_KEYS.has(args.key);
  return false;
}

export function formatDateTimeForHumans(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function formatSchedule(startsAt?: string | null, endsAt?: string | null) {
  const s = startsAt ? formatDateTimeForHumans(startsAt) : null;
  const e = endsAt ? formatDateTimeForHumans(endsAt) : null;
  if (s && e) return `${s} – ${e}`;
  if (s) return `Starts ${s}`;
  if (e) return `Ends ${e}`;
  return null;
}

export function isoToLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function localInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function announcementStatusLabel(status: string): "Published" | "Draft" {
  return status === "PUBLISHED" ? "Published" : "Draft";
}
