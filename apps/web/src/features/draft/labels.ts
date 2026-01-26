import type { Snapshot } from "../../lib/types";

export function buildDraftedSet(picks: Snapshot["picks"]) {
  const drafted = new Set<number>();
  for (const p of picks) drafted.add(p.nomination_id);
  return drafted;
}

export function buildNominationLabelById(snapshot: Snapshot | null) {
  const map = new Map<number, string>();
  const rows = snapshot?.nominations ?? [];
  for (const n of rows) {
    map.set(n.id, n.label);
  }
  return map;
}

export function iconCodeForCategory(snapshot: Snapshot | null) {
  const map = new Map<number, string>();
  const cats = snapshot?.categories ?? [];
  for (const c of cats) {
    if (c.icon_code) map.set(c.id, c.icon_code);
  }
  return map;
}
