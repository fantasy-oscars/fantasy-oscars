import { AppError } from "../errors.js";

/*
 * Withdrawing a published ceremony or Circuit returns it to DRAFT, which hides
 * it from players. It is refused while any season is set up against it, so no
 * season is left pointing at something players cannot see. Seasons are not
 * removed for the admin: their commissioners remove them first.
 */

export function assertNoSeasonsToWithdraw(
  code: "CEREMONY_HAS_SEASONS" | "CIRCUIT_HAS_SEASONS",
  seasonCount: number
) {
  if (seasonCount <= 0) return;
  const seasons = seasonCount === 1 ? "season" : "seasons";
  throw new AppError(
    code,
    409,
    `Remove the ${seasonCount} ${seasons} set up for this first`,
    { season_count: seasonCount }
  );
}
