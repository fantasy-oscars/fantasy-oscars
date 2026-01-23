# Public Leagues Policy (Post-MVP)

## Visibility & defaults

- Default: leagues are invite-only (`is_public = false`).
- Commissioners may opt into public visibility; active season must exist.
- Participant cap: enforce `league.max_members` as the hard ceiling.

## Join flow

- Auth required; joins operate via season membership (creates league_member if missing, then season_member).
- Rate limit: 8 join attempts per 5 minutes per IP.
- If league is full, return `LEAGUE_FULL`.

## Discovery rules

- Public listing includes name/code/ceremony, member count, active season status.
- Hide leagues without an EXTANT season.

## Abuse controls

- Rate limits on join.
- Optional manual review: commissioners can toggle public off at any time.
- If abuse detected, admins can revert to invite-only or cancel season (existing tooling).

## UX commitments

- Public league detail shows member count, remaining slots, active season.
- Joining communicates that it joins the current active season.

## Audit / telemetry

- Joins happen via season membership records (user + timestamps).
- League visibility stored on league; no extra audit yet (covered by existing admin audit if toggled via admin tools).
