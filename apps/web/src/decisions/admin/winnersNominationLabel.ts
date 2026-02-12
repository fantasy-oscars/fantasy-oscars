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

export function winnersNominationLabel(n: WinnersNominationRow) {
  const people =
    Array.isArray(n.contributors) && n.contributors.length > 0
      ? n.contributors.map((c) => c.full_name)
      : n.performer_name
        ? [n.performer_name]
        : [];
  const peopleLabel =
    people.length > 0
      ? `${people[0]}${people.length > 1 ? ` +${people.length - 1}` : ""}`
      : "";
  if (n.song_title)
    return peopleLabel ? `${n.song_title} — ${peopleLabel}` : n.song_title;
  if (peopleLabel) return n.film_title ? `${peopleLabel} — ${n.film_title}` : peopleLabel;
  return n.film_title ?? `Nomination #${n.id}`;
}
