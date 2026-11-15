export type PodiumPlace = 1 | 2 | 3;
export type PodiumCell = { place: PodiumPlace; names: string[] };

/** Trims names, drops empty ones and places with no name, orders by place, keeps three. */
export function resolvePodium(
  raw: Array<{ place: PodiumPlace; names: string[] }>
): PodiumCell[] {
  return raw
    .map((p) => ({
      place: p.place,
      names: p.names.map((name) => name.trim()).filter((name) => name.length > 0)
    }))
    .filter((p) => p.names.length > 0)
    .sort((a, b) => a.place - b.place)
    .slice(0, 3);
}

/** Changes whenever the podium does, so a cycle can restart. */
export function podiumSignature(podium: PodiumCell[]): string {
  return podium.map((p) => `${p.place}:${p.names.join("|")}`).join("||");
}

export function hasPodiumTie(podium: PodiumCell[]): boolean {
  return podium.some((p) => p.names.length > 1);
}

/** The place word on each cell, so rank never rests on the metal alone. */
export function podiumKicker(place: PodiumPlace, tied: boolean): string {
  if (place === 1) return tied ? "Joint winner" : "Winner";
  const ordinal = place === 2 ? "2nd" : "3rd";
  return tied ? `Tied ${ordinal}` : ordinal;
}

const PLACE_WORD: Record<PodiumPlace, string> = {
  1: "First",
  2: "Second",
  3: "Third"
};

/** What a screen reader hears for a cell; the visible name cycles, this does not. */
export function podiumAriaLabel(cell: PodiumCell): string {
  const tied = cell.names.length > 1;
  return `${PLACE_WORD[cell.place]} place: ${cell.names.join(", ")}${tied ? " (tied)" : ""}`;
}
