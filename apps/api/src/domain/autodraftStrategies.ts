import type { DraftRecord } from "../data/repositories/draftRepository.js";
import type { listNominationsForCeremony } from "../data/repositories/nominationRepository.js";

type CeremonyNomination = Awaited<ReturnType<typeof listNominationsForCeremony>>[number];

export type Strategy =
  | "NEXT_AVAILABLE"
  | "RANDOM_SEED"
  | "ALPHABETICAL"
  | "CANONICAL"
  | "SMART"
  | "CUSTOM_USER";

export function resolveStrategy(
  strategy: DraftRecord["auto_pick_strategy"] | null | undefined
): Strategy {
  if (
    strategy === "RANDOM_SEED" ||
    strategy === "ALPHABETICAL" ||
    strategy === "CANONICAL" ||
    strategy === "SMART" ||
    strategy === "CUSTOM_USER"
  ) {
    return strategy;
  }
  return "NEXT_AVAILABLE";
}

export type AutoPickConfig = {
  canonical_order?: number[];
  custom_rankings?: Record<string, number[]>;
  smart_priorities?: number[];
  alphabetical_field?: "film_title" | "song_title" | "performer_name";
};

function normalizeTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  const normalized = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return normalized.replace(/^(the|a|an)\s+/i, "").trim();
}

function createSeededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
    h |= 0;
  }
  return () => {
    h = Math.imul(48271, h) % 0x7fffffff;
    const result = h / 0x7fffffff;
    return result < 0 ? result * -1 : result;
  };
}

export function chooseAlphabetical(
  available: CeremonyNomination[],
  field: AutoPickConfig["alphabetical_field"]
) {
  return [...available]
    .sort((a, b) => {
      const fieldAValue = field ? (a as Record<string, unknown>)[field] : null;
      const fieldBValue = field ? (b as Record<string, unknown>)[field] : null;
      const fieldA =
        (typeof fieldAValue === "string" ? fieldAValue : null) ??
        a.film_title ??
        a.song_title ??
        a.performer_name ??
        "";
      const fieldB =
        (typeof fieldBValue === "string" ? fieldBValue : null) ??
        b.film_title ??
        b.song_title ??
        b.performer_name ??
        "";
      const nameA = normalizeTitle(fieldA);
      const nameB = normalizeTitle(fieldB);
      if (nameA === nameB) return a.id - b.id;
      return nameA.localeCompare(nameB);
    })
    .map((n) => n.id)[0];
}

export function chooseByCategoryOrder(args: {
  available: CeremonyNomination[];
  categorySortIndexById: Map<number, number>;
}) {
  const { available, categorySortIndexById } = args;
  return [...available]
    .sort((a, b) => {
      const ai = categorySortIndexById.get(a.category_edition_id) ?? 0;
      const bi = categorySortIndexById.get(b.category_edition_id) ?? 0;
      if (ai !== bi) return ai - bi;
      const ao = a.sort_order ?? 0;
      const bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.id - b.id;
    })
    .map((n) => n.id)[0];
}

export function chooseAlphabeticalThenCategory(args: {
  available: CeremonyNomination[];
  categorySortIndexById: Map<number, number>;
}) {
  const { available, categorySortIndexById } = args;
  return [...available]
    .sort((a, b) => {
      const labelA = a.film_title ?? a.performer_name ?? a.song_title ?? "";
      const labelB = b.film_title ?? b.performer_name ?? b.song_title ?? "";
      const nameA = normalizeTitle(labelA);
      const nameB = normalizeTitle(labelB);
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      const ai = categorySortIndexById.get(a.category_edition_id) ?? 0;
      const bi = categorySortIndexById.get(b.category_edition_id) ?? 0;
      if (ai !== bi) return ai - bi;
      const ao = a.sort_order ?? 0;
      const bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.id - b.id;
    })
    .map((n) => n.id)[0];
}

export function chooseRandomized(
  availableIds: number[],
  seed: string | null | undefined
): { id: number | undefined; seed: string } {
  const resolvedSeed = seed ?? "draft-random-default";
  const rand = createSeededRandom(resolvedSeed);
  const ids = [...availableIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return { id: ids[0], seed: resolvedSeed };
}

export function chooseCanonical(
  availableIds: number[],
  config: AutoPickConfig | null | undefined
) {
  const order = config?.canonical_order ?? [];
  if (Array.isArray(order) && order.length > 0) {
    const next = order.find((id) => availableIds.includes(id));
    if (next) return next;
  }
  return undefined;
}

export function chooseCustomUser(
  userId: number,
  availableIds: number[],
  config: AutoPickConfig | null | undefined
) {
  const rankings = config?.custom_rankings ?? {};
  const userList = rankings[String(userId)] ?? rankings[userId] ?? [];
  const match = userList.find((id) => availableIds.includes(id));
  return match ?? undefined;
}

