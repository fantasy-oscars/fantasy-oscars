import type { Snapshot } from "../../lib/types";
import { buildNominationLabelById } from "../../decisions/draft";

type Env = { VITE_API_BASE?: string };

export const API_BASE = (
  (import.meta as unknown as { env: Env }).env.VITE_API_BASE ?? ""
).trim();

export function makeRequestId(): string {
  return (
    crypto?.randomUUID?.() ??
    `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

export function describeNomination(snapshot: Snapshot, nominationId: number) {
  const labels = buildNominationLabelById(snapshot);
  const nomineeLabel = labels.get(nominationId) ?? `#${nominationId}`;

  const nomination =
    (snapshot.nominations ?? []).find((n) => n.id === nominationId) ?? null;
  const categoryId = nomination?.category_edition_id ?? null;
  const categoryName =
    (snapshot.categories ?? []).find((c) => c.id === categoryId)?.family_name ??
    (categoryId ? `Category ${categoryId}` : "Category");

  return { categoryName, nomineeLabel };
}
