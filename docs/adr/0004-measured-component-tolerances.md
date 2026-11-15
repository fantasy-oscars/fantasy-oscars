# ADR 0004: Measured component tolerances

- Status: Accepted
- Date: 2026-11-15
- Supersedes: the screenshot tiers of [ADR 0003](0003-layered-visual-testing.md) (layout tier, specimen captures, brand screens). The rest of 0003 stands.

## Context

ADR 0003 cut the visual suite from 358 baselines to 122, but the repository still held 147 PNGs, and each new brand added Home, draft-room and specimen captures to review by eye. A screenshot says only "different from last time". What matters across brands (sizes, spacing, type, radius, focus rings, state changes, contrast) can be measured from the DOM, and a measurement can be checked against a range that does not move when a brand restyles.

Only two things are judged by eye: Home, which is bespoke per brand, and a card with the controls people see most.

## Decision

1. **Tolerance tier (new).** `tests/visual/tolerances.spec.ts` loads `/__specimen` for every brand x mode x viewport (desktop 1280, phone 390) and measures each representative component with `getComputedStyle` and `getBoundingClientRect`. The table is `tests/visual/tolerances/spec.ts`: per component (a `data-spec` hook), per state, per property family, a range or a relation. Ranges come from the token contract and the prescriptions, resolved per brand from the page's custom properties, so a brand inside the contract passes without editing the spec. Where the contract gives no bound, the check names its source. Relations catch what a range cannot: variants of one family share a height, input height equals button height, headings step down, padding and gap sit on the spacing scale, and radius equals the contract slot it should read. State checks fail when hover, focus, selected or disabled renders identically to default. The painted font is read from Chromium (`getPlatformFontsForNode`), so a fallback face fails even when the requested name is right.
2. **Mutation-proven.** Every property family was shown to fail under a throwaway CSS or token mutation (shrunk button, dropped focus ring, radius override, fallback font, flattened heading scale, low contrast, removed hover). About 45 mutations were recorded; a sweep of all 50 hooks found checks that could never fail, and those were replaced (an icon contrast check, an own-element signature for nominee pill states) or bound to their source. The runner takes `VISUAL_TOLERANCE_MUTATION` so a check can be re-proven.
3. **Pinned allowlist.** Findings that exist on today's look live in `tests/visual/tolerances/allowlist.ts`: eight entries, each with the exact measured value per brand, a reason, a date and a named follow-up. A different value still fails, and a stale entry fails the run.
4. **Screenshots only for Home and the sample card.** `home-logged-in` for every brand x mode x viewport (28) and a sample card (`data-specimen-sample`: title, status chip, body, input, primary and secondary button) per brand x mode at desktop (14): 42 baselines, from 147. `home-logged-out` is not captured: it shares Home's layout and slots, and what differs is covered by the tolerance and assertion tiers. The layout tier, the full specimen captures, the brand screens and the stress captures are deleted.
5. **CI selected by diff.** `.github/scripts/affected.mjs` holds one table from changed paths to groups; an unmapped path runs everything. A `changes` job computes the groups, jobs run conditionally, and an always-running `gate` job fails if any needed job failed and passes if each succeeded or was skipped. Pushes to `main` and the merge queue run everything. `pnpm run ci:affected` runs the same selection locally; `pnpm run ci` still runs everything and is the definition of done.

The assertion tier (overflow, clipping, overlap, 44 px targets, axe contrast, room geometry, the stress runs) is unchanged, as are the token unit tests.

## Alternatives Considered

- Keep the screenshot tiers of 0003 and add measurements. Safest against regressions, but the review and storage cost per brand stays. Rejected: the owner chose measured tolerances over pixel baselines.
- Screenshots for every component in every brand. Same cost as the specimen captures, with the same "different from last time" signal. Rejected.
- Bounds copied from today's pixels. Passes now, fails every legitimate restyle, and encodes accidents. Rejected: bounds come from the contract, and only where it is silent does a check use the current spread, with the reason stated.
- Path filters per workflow. Logic scattered across files, with required checks that never report when skipped. Rejected for one table and one `gate` job.

## Consequences

- Positive: a new brand costs its tokens plus six screenshots (Home in two modes at two widths, and a sample card in two modes); a brand change no longer produces dozens of PNGs; component regressions are named by property and value, not by an image diff; API-only and docs-only changes skip the visual jobs.
- Negative, stated plainly: pixel regressions outside Home and the sample card are caught only by the tolerance and assertion tiers. Something ugly that stays in range, overflows nothing, passes contrast, and is not Home or the sample card (a draft room composition, a spacing mix that is on the scale) is no longer caught by a test. Galleries and dogfooding cover it.
- Negative: the spec is a model of "correct" that can drift or be wrong; the mutation pass is the evidence it bites, and it must be repeated when a family of checks is added.
- Negative: required status checks change to `gate` alone (owner setting; `gate` appears in the branch rule search only after it has run once on a PR).
- Follow-ups: fix the allowlisted findings and delete their entries (`dark-primary-fill`, `checkbox-selected-state`, `form-row-touch-targets`, `markdown-heading-scale`, `banner-dismiss-touch-target`, the last in the assertion allowlist).

Evidence: [`tests/visual/tolerances.spec.ts`](../../tests/visual/tolerances.spec.ts), [`tests/visual/tolerances/spec.ts`](../../tests/visual/tolerances/spec.ts), [`tests/visual/tolerances/judge.ts`](../../tests/visual/tolerances/judge.ts), [`tests/visual/tolerances/allowlist.ts`](../../tests/visual/tolerances/allowlist.ts), [`tests/visual/matrix.ts`](../../tests/visual/matrix.ts), [`.github/scripts/affected.mjs`](../../.github/scripts/affected.mjs), [`tests/unit/tooling/affected.test.mjs`](../../tests/unit/tooling/affected.test.mjs).
