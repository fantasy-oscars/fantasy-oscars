export function computeAdminCeremonyIndexStatus(args: {
  status: string | null | undefined;
}): { statusUpper: string; isArchived: boolean; isDraft: boolean } {
  const statusUpper = String(args.status || "DRAFT").toUpperCase();
  const isArchived = statusUpper === "ARCHIVED";
  const isDraft = statusUpper === "DRAFT";
  return { statusUpper, isArchived, isDraft };
}

export function computeAdminCeremonyDeletePolicy(args: {
  status: string | null | undefined;
}): { needsConfirm: boolean; deleteDisabled: boolean } {
  const { isArchived, isDraft } = computeAdminCeremonyIndexStatus(args);
  // Unpublished drafts can be deleted immediately; other states (published/locked) confirm; archived disabled.
  const needsConfirm = !isDraft && !isArchived;
  const deleteDisabled = isArchived;
  return { needsConfirm, deleteDisabled };
}

/** Index order of ceremony statuses: live work first, archived ceremonies last. */
export const ADMIN_CEREMONY_INDEX_STATUS_ORDER = [
  "ACTIVE",
  "LOCKED",
  "PUBLISHED",
  "DRAFT",
  "ARCHIVED"
] as const;

function statusRank(status: string | null | undefined): number {
  const { statusUpper } = computeAdminCeremonyIndexStatus({ status });
  const rank = (ADMIN_CEREMONY_INDEX_STATUS_ORDER as readonly string[]).indexOf(
    statusUpper
  );
  // An unknown status sorts just before the archived ceremonies.
  return rank === -1 ? ADMIN_CEREMONY_INDEX_STATUS_ORDER.length - 1.5 : rank;
}

function dateValue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * The admin ceremonies index order: by status (ACTIVE, LOCKED, PUBLISHED,
 * DRAFT, then ARCHIVED), then by ceremony date, soonest first, or most recent
 * first for archived ceremonies. Undated ceremonies come last in their status.
 */
export function sortAdminCeremonyIndex<
  T extends { id: number; status?: string | null; starts_at: string | null }
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    const [ta, tb] = [dateValue(a.starts_at), dateValue(b.starts_at)];
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      const archived = computeAdminCeremonyIndexStatus({ status: a.status }).isArchived;
      return archived ? tb - ta : ta - tb;
    }
    return a.id - b.id;
  });
}
