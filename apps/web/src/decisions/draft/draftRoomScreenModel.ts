import type { DraftRoomOrchestration } from "../../orchestration/draft";

export type DraftScreenCategory = {
  id: string;
  title: string;
  icon: string;
  iconVariant: "default" | "inverted";
  unitKind: string;
  weight: number | null;
  nominees: Array<{
    id: string;
    label: string;
    muted: boolean;
    winner: boolean;
    posterUrl: string | null;
    filmTitle: string | null;
    filmYear: number | null;
    contributors: string[];
    songTitle: string | null;
    performerName: string | null;
    performerCharacter: string | null;
    performerProfileUrl: string | null;
    performerProfilePath: string | null;
    draftedByLabel?: string | null;
    draftedByAvatarKey?: string | null;
    draftedRoundPick?: string | null;
  }>;
};

export type NomineeMetaById = Map<
  number,
  {
    unitKind: string;
    categoryName: string;
    filmTitle: string | null;
    filmYear: number | null;
    filmPosterUrl: string | null;
    contributors: string[];
    performerName: string | null;
    performerCharacter: string | null;
    performerProfileUrl: string | null;
    performerProfilePath: string | null;
    songTitle: string | null;
    categoryIcon: string;
    categoryIconVariant: "default" | "inverted";
    draftedByLabel?: string | null;
    draftedByAvatarKey?: string | null;
    draftedRoundPick?: string | null;
  }
>;

export function mapDraftScreenCategories(
  poolCategories: DraftRoomOrchestration["pool"]["categories"]
): DraftScreenCategory[] {
  return poolCategories.map((c) => ({
    id: String(c.id),
    title: c.title,
    icon: c.icon,
    iconVariant: c.iconVariant ?? "default",
    unitKind: c.unitKind ?? "",
    weight: c.weight ?? null,
    nominees: c.nominations.map((n) => ({
      id: String(n.id),
      label: n.label,
      muted: n.muted,
      winner: n.winner,
      posterUrl: n.posterUrl ?? null,
      filmTitle: n.filmTitle ?? null,
      filmYear: n.filmYear ?? null,
      contributors: n.contributors ?? [],
      songTitle: n.songTitle ?? null,
      performerName: n.performerName ?? null,
      performerCharacter: n.performerCharacter ?? null,
      performerProfileUrl: n.performerProfileUrl ?? null,
      performerProfilePath: n.performerProfilePath ?? null
    }))
  }));
}

export function buildNomineeMetaById(categories: DraftScreenCategory[]): NomineeMetaById {
  const m: NomineeMetaById = new Map();
  for (const c of categories) {
    for (const n of c.nominees) {
      const id = Number(n.id);
      if (!Number.isFinite(id)) continue;
      m.set(id, {
        unitKind: c.unitKind,
        categoryName: c.title,
        filmTitle: n.filmTitle,
        filmYear: n.filmYear,
        filmPosterUrl: n.posterUrl,
        contributors: n.contributors,
        performerName: n.performerName,
        performerCharacter: n.performerCharacter,
        performerProfileUrl: n.performerProfileUrl,
        performerProfilePath: n.performerProfilePath,
        songTitle: n.songTitle,
        categoryIcon: c.icon,
        categoryIconVariant: c.iconVariant
      });
    }
  }
  return m;
}

export function buildDraftedNominationIds(
  rows: DraftRoomOrchestration["ledger"]["rows"]
) {
  const set = new Set<number>();
  for (const r of rows) {
    if (typeof r.nominationId === "number") set.add(r.nominationId);
  }
  return set;
}

export function buildAvatarKeyBySeat(
  participants: DraftRoomOrchestration["header"]["participants"]
) {
  const m = new Map<number, string | null>();
  for (const p of participants) m.set(p.seatNumber, p.avatarKey ?? null);
  return m;
}
