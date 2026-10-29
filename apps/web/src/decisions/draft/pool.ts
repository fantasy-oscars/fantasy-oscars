import type { Snapshot } from "../../lib/types";

export type PoolNomination = {
  id: number;
  label: string;
  posterUrl: string | null;
  filmTitle: string | null;
  filmYear: number | null;
  contributors: string[];
  performerContributors: Array<{
    fullName: string;
    roleLabel: string | null;
    profileUrl: string | null;
    profilePath: string | null;
    sortOrder: number;
  }>;
  songTitle: string | null;
  performerName: string | null;
  performerCharacter: string | null;
  performerProfileUrl: string | null;
  performerProfilePath: string | null;
  muted: boolean;
  selected: boolean;
  winner: boolean;
};

export type PoolCategory = {
  id: number;
  title: string;
  icon: string;
  iconVariant: "default" | "inverted";
  unitKind: string;
  weight: number | null;
  nominations: PoolNomination[];
  emptyText: string | null;
};

export function formatNameList(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function buildPoolCategories(args: {
  snapshot: Snapshot | null;
  drafted: Set<number>;
  winnerSet: Set<number>;
  selectedNominationId: number | null;
  scoringStrategyName: string;
  categoryWeightByCategoryId: Map<number, number>;
  iconByCategoryId: Map<number, string>;
  nominationsByCategoryId: Map<number, Snapshot["nominations"]>;
}): PoolCategory[] {
  const {
    snapshot,
    drafted,
    winnerSet,
    selectedNominationId,
    scoringStrategyName,
    categoryWeightByCategoryId,
    iconByCategoryId,
    nominationsByCategoryId
  } = args;
  if (!snapshot) return [];
  const categories = snapshot.categories ?? [];

  return categories.map((c) => {
    const rows = nominationsByCategoryId.get(c.id) ?? [];
    const active = rows.filter((n) => n.status === "ACTIVE");
    const filtered = active;
    const icon = iconByCategoryId.get(c.id) ?? "";
    const nominations = filtered.map((n) => {
      const isDrafted = drafted.has(n.id);
      const performerContributorNames =
        (
          n as {
            performer_contributors?: Array<{
              full_name?: string | null;
            }>;
          }
        ).performer_contributors
          ?.map((c) => String(c.full_name ?? "").trim())
          .filter(Boolean) ?? [];
      const performanceLabel =
        performerContributorNames.length > 0
          ? formatNameList(performerContributorNames)
          : n.label;
      return {
        id: n.id,
        label:
          String(c.unit_kind ?? "").toUpperCase() === "PERFORMANCE"
            ? performanceLabel
            : n.label,
        posterUrl: (n as { film_poster_url?: string | null }).film_poster_url ?? null,
        filmTitle: (n as { film_title?: string | null }).film_title ?? null,
        filmYear: (n as { film_year?: number | null }).film_year ?? null,
        contributors: (n as { contributors?: string[] }).contributors ?? [],
        performerContributors:
          (
            n as {
              performer_contributors?: Array<{
                full_name?: string | null;
                role_label?: string | null;
                profile_url?: string | null;
                profile_path?: string | null;
                sort_order?: number | null;
              }>;
            }
          ).performer_contributors?.map((c, idx) => ({
            fullName: String(c.full_name ?? "").trim(),
            roleLabel: c.role_label ?? null,
            profileUrl: c.profile_url ?? null,
            profilePath: c.profile_path ?? null,
            sortOrder: typeof c.sort_order === "number" ? c.sort_order : idx + 1
          })) ?? [],
        songTitle: (n as { song_title?: string | null }).song_title ?? null,
        performerName: (n as { performer_name?: string | null }).performer_name ?? null,
        performerCharacter:
          (n as { performer_character?: string | null }).performer_character ?? null,
        performerProfileUrl:
          (n as { performer_profile_url?: string | null }).performer_profile_url ?? null,
        performerProfilePath:
          (n as { performer_profile_path?: string | null }).performer_profile_path ??
          null,
        muted: isDrafted,
        selected: selectedNominationId === n.id,
        winner: winnerSet.has(n.id)
      };
    });
    return {
      id: c.id,
      title: c.family_name,
      icon,
      iconVariant: (c.icon_variant ?? "default") as "default" | "inverted",
      unitKind: String(c.unit_kind ?? ""),
      weight:
        scoringStrategyName === "category_weighted"
          ? (categoryWeightByCategoryId.get(c.id) ?? 1)
          : null,
      nominations,
      emptyText: nominations.length ? null : "No nominees."
    };
  });
}
