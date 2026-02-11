function toTs(iso: string | null): number {
  if (!iso) return -Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

export function sortNewestFirst<T extends { id: number; starts_at: string | null }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => toTs(b.starts_at) - toTs(a.starts_at) || b.id - a.id);
}

export function splitActiveArchived<T extends { status: string }>(rows: T[]): {
  active: T[];
  archived: T[];
} {
  const active = rows.filter((c) => c.status !== "ARCHIVED");
  const archived = rows.filter((c) => c.status === "ARCHIVED");
  return { active, archived };
}

