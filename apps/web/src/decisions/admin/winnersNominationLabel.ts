type WinnersNominationRow = {
  id: number;
  category_edition_id: number;
  film_title?: string | null;
  song_title?: string | null;
  performer_name?: string | null;
  contributors?: Array<{
    person_id: number;
    full_name: string;
    role_label: string | null;
    sort_order: number;
  }>;
};

export function winnersNominationLabel(
  n: WinnersNominationRow,
  unitKind?: "FILM" | "SONG" | "PERFORMANCE" | null
) {
  if (unitKind === "SONG") {
    if (n.song_title) return n.song_title;
  } else if (unitKind === "PERFORMANCE") {
    if (n.performer_name) return n.performer_name;
    if (Array.isArray(n.contributors) && n.contributors.length > 0) {
      return n.contributors[0]?.full_name ?? `Nomination #${n.id}`;
    }
  } else if (unitKind === "FILM") {
    if (n.film_title) return n.film_title;
  }

  // Defensive fallback when unit kind is unavailable or data is sparse.
  if (n.song_title) return n.song_title;
  if (n.performer_name) return n.performer_name;
  if (n.film_title) return n.film_title;
  if (Array.isArray(n.contributors) && n.contributors.length > 0)
    return n.contributors[0]?.full_name ?? `Nomination #${n.id}`;
  return `Nomination #${n.id}`;
}
