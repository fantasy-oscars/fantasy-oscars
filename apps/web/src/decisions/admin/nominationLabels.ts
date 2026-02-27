export function nominationPrimaryLabel(input: {
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  film_title?: string | null;
  song_title?: string | null;
  performer_name?: string | null;
  contributors?: Array<{ full_name: string; sort_order: number }>;
  fallbackId: number;
}) {
  void input.fallbackId;
  if (input.unit_kind === "SONG") return input.song_title ?? "Untitled song nominee";
  if (input.unit_kind === "PERFORMANCE") {
    const names =
      input.contributors && input.contributors.length > 0
        ? [...input.contributors]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((c) => c.full_name)
            .filter(Boolean)
        : [];
    if (names.length > 0) return names.join(", ");
    return input.performer_name ?? "Untitled performance nominee";
  }
  return input.film_title ?? "Untitled film nominee";
}

export function nominationSecondaryLabel(input: {
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  film_title?: string | null;
}) {
  if (input.unit_kind === "PERFORMANCE" && input.film_title)
    return `from ${input.film_title}`;
  return null;
}
