import type {
  CircuitLeagueCategory,
  CircuitSelectionOwner,
  CircuitSelectionSummary
} from "../lib/types";
import { circuitSelectionLabel } from "./circuitRoster";
import { contenderFilmLabel } from "./contenders";

/*
 * The picker's preview row (pure): the contender the picker has built, as a
 * pill with its owned state, and the add icon (free agency) or the claim
 * icon (waivers) beside it. The owner comes from
 * the selection read; until it arrives the contender is drawn as free and the
 * server's own checks stay the guard.
 */

export type CircuitFreeAgentPreview = {
  label: string;
  categoryName: string;
  iconCode: string | null;
  iconVariant: string;
  /** Muted, with the caption, when someone (or the viewer) holds it. */
  owned: boolean;
  /** "Owned by pia" or "Already on your roster"; null for a free agent. */
  caption: string | null;
  /** The caption's words in the pill's accessible name: "owned by pia". */
  stateSuffix: string | null;
  /** "Add Best Picture: Night Train (2026)", "Claim Best Picture: …". */
  addLabel: string;
  /** "Add", "Add, dropping …", "Claim", or the caption while it is owned. */
  addTooltip: string;
  addDisabled: boolean;
};

export function circuitFreeAgentPreview(input: {
  category: { id: number; name: string; kind: string } | null;
  film: { title: string; release_year: number | null } | null;
  person: { name: string } | null;
  categories: readonly Pick<
    CircuitLeagueCategory,
    "id" | "name" | "icon_code" | "icon_variant"
  >[];
  /** The selection read's owner; undefined until it has been read. */
  owner: CircuitSelectionOwner | undefined;
  viewerUserId: number | null;
  drop: CircuitSelectionSummary | null;
  /** "Add" in free agency (the default); "Claim" on waivers, where the drop is set later. */
  verb?: "Add" | "Claim";
}): CircuitFreeAgentPreview | null {
  const { category, film } = input;
  const verb = input.verb ?? "Add";
  if (!category || !film) return null;
  const person = category.kind === "ACTING" ? input.person : null;
  if (category.kind === "ACTING" && !person) return null;
  const leagueCategory = input.categories.find((c) => c.id === category.id) ?? null;
  const filmLabel = contenderFilmLabel(film);
  const label = person ? `${person.name}, ${filmLabel}` : filmLabel;
  const categoryName = leagueCategory?.name ?? category.name;
  const owner = input.owner ?? null;
  const caption = owner
    ? owner.user_id === input.viewerUserId
      ? "Already on your roster"
      : `Owned by ${owner.username}`
    : null;
  return {
    label,
    categoryName,
    iconCode: leagueCategory?.icon_code ?? null,
    iconVariant: leagueCategory?.icon_variant ?? "default",
    owned: owner !== null,
    caption,
    stateSuffix: caption ? caption.charAt(0).toLowerCase() + caption.slice(1) : null,
    addLabel: `${verb} ${categoryName}: ${label}`,
    addTooltip:
      caption ??
      (input.drop ? `${verb}, dropping ${circuitSelectionLabel(input.drop)}` : verb),
    addDisabled: owner !== null
  };
}
