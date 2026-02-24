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

  if (n.song_title) {
    const secondary = [n.film_title, peopleLabel].filter(Boolean).join(" • ");
    return secondary ? `${n.song_title} — ${secondary}` : n.song_title;
  }

  if (n.performer_name) {
    return n.film_title ? `${n.performer_name} — ${n.film_title}` : n.performer_name;
  }

  if (n.film_title) {
    return peopleLabel ? `${n.film_title} — ${peopleLabel}` : n.film_title;
  }

  if (peopleLabel) return peopleLabel;
  return `Nomination #${n.id}`;
}
