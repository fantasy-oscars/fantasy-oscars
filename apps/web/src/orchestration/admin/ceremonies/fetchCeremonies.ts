import { fetchJson } from "../../../lib/api";
import type { CeremonyOption } from "./types";

export async function fetchAdminCeremonies() {
  return fetchJson<{ ceremonies: CeremonyOption[] }>("/admin/ceremonies", {
    method: "GET"
  });
}

export function sortCeremonies(rows: CeremonyOption[]) {
  const toTs = (iso: string | null) => {
    if (!iso) return -Infinity;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...rows].sort((a, b) => toTs(b.starts_at) - toTs(a.starts_at) || b.id - a.id);
}
