import type { CircuitLeagueCategory, CircuitSelectionSummary } from "../lib/types";
import { circuitSelectionLabel } from "./circuitRoster";

/*
 * A season contender drawn as the ceremony's nominee pill (pure): the
 * nominee card it shows on hover, focus or tap, and the pill's accessible
 * name. The category icon names the category on the pill; the card and the
 * name say it in words.
 */

/** Pill states in season contexts; `winner` combines with default and dropped. */
export type ContenderPillState = "default" | "muted" | "dropped" | "armed" | "pending";

/** The nominee card's fields for a contender (`NomineeTooltipCard` props). */
export type ContenderTooltip = {
  unitKind: "PERFORMANCE" | "FILM";
  categoryName: string;
  filmTitle: string;
  filmYear: number | null;
  filmPosterUrl: string | null;
  performerName: string | null;
  performerProfileUrl: string | null;
};

/**
 * An acting contender is a performance (the person is the hero, the film
 * below); any other is a film. The poster comes from the film, the portrait
 * from the person.
 */
export function contenderTooltip(
  selection: CircuitSelectionSummary,
  category: { name: string; kind: string } | null
): ContenderTooltip {
  const performance = category?.kind === "ACTING";
  return {
    unitKind: performance ? "PERFORMANCE" : "FILM",
    categoryName: category?.name ?? "Contender",
    filmTitle: selection.film.title,
    filmYear: selection.film.release_year,
    filmPosterUrl: selection.film.poster_url,
    performerName: performance ? (selection.person?.name ?? null) : null,
    performerProfileUrl: performance ? (selection.person?.profile_url ?? null) : null
  };
}

function pointsPhrase(points: number): string {
  const value = Number(points.toFixed(2));
  return `${value} ${value === 1 ? "point" : "points"}`;
}

/**
 * "Best Actress: Ada Lane, Paper Moon (2026), 3 points, dropped": the
 * category and label, the points where they show, then the state's words
 * ("dropped", "owned by pia", "lost") when there are any.
 */
export function contenderPillName(input: {
  categoryName: string;
  label: string;
  points?: number | null;
  stateSuffix?: string | null;
}): string {
  const parts = [`${input.categoryName}: ${input.label}`];
  if (input.points !== null && input.points !== undefined) {
    parts.push(pointsPhrase(input.points));
  }
  if (input.stateSuffix) parts.push(input.stateSuffix);
  return parts.join(", ");
}

/** What a pill draws for a contender: its label, category and the card. */
export type ContenderPillView = {
  label: string;
  categoryName: string;
  iconCode: string | null;
  iconVariant: string;
  tooltip: ContenderTooltip;
};

/** A contender's pill from its selection and the season's categories. */
export function contenderPillView(
  selection: CircuitSelectionSummary,
  categories: readonly Pick<
    CircuitLeagueCategory,
    "id" | "name" | "kind" | "icon_code" | "icon_variant"
  >[]
): ContenderPillView {
  const category = categories.find((c) => c.id === selection.circuit_category_id) ?? null;
  return {
    label: circuitSelectionLabel(selection),
    categoryName: category?.name ?? "Contender",
    iconCode: category?.icon_code ?? null,
    iconVariant: category?.icon_variant ?? "default",
    tooltip: contenderTooltip(selection, category)
  };
}
