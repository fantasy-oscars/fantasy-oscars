# 05 Picker and launch (Appearance settings, per-person draw, wordmark shuffle, enable all brands)

Package: the Appearance section on the account page, the move of light and dark from the page chrome into that section, each person's own daily theme, discovery, the hidden wordmark shuffle, logged-out behaviour, the data behind all of it, the release of the six remaining brands and the launch audit. Source: owner direction, 2026-11-09 (which replaces the 2026-11-04 picker and refines its draw and shuffle; the 2026-11-04 wordmark interaction, subtlety and 04:00 expiry still stand). The design export has no picker board, so nothing here is copied from a mockup.

Brand letters: A refined-gold, B red-carpet, C ballot, D noir, E festival, F technicolor, G lightbox. "Brand" is the code word and "theme" is the word users see; the two mean the same thing. Contrast was computed from the token values on main (`apps/web/src/theme/brands/*`). The draw was prototyped outside the repo and its worked examples in 4.3 are real output.

## 1. Scope

### In scope

1. An **Appearance** section on `/account`, holding every appearance setting: Mode, Random or Fixed, the themes dropdown, and the single-mode conflict control. The rest of the account page keeps its layout.
2. **Mode moves.** Light, Dark and Theme default replace the toggles in the shell header, the login layout and the draft room (desktop, compact and phone). Each theme declares its modes (3.2).
3. **Each person's daily theme** under Random: three groups, per-group no-repeat rounds, the day's theme saved once drawn. This replaces the shared rotation and the "random" hash.
4. **Discovery**, including the Refined Gold start, auto-join to the Random selection and the "Undiscovered themes" option.
5. The **wordmark shuffle** on Home.
6. **Logged-out behaviour**: no menu, Random across all released themes, each theme's default mode, browser-stored discoveries, merge at login, one-time copy of a legacy light or dark choice.
7. **Data**: migration 020, the API, shared validation.
8. **Enabling all brands** (`ENABLED_BRAND_IDS`) and the launch audit: 14 palettes, QA per brand, and the open dogfooding notes (muted pill ink, touch-target families, four inconsistencies).
9. Marginal improvements (section 9), the same in every brand.

### Not changed

- Page layouts other than the account page's new section. No Cinema themes ship (the structures support them, 3.2, and unit tests exercise them with a fixture catalog).
- No toast, badge, counter or other announcement of a discovery; no growth or engagement feature.
- Home compositions, card, button and chip skins (03 and 04), except the four specimen-surfaced inconsistencies (4.13.3).
- Items carried from earlier packages that are not in 4.13: the super-admin 403 on `/seasons/:id/invites`, the league owner with a stale season role, the phone countdown pulse and technicolor on-turn bar, the admin toast over the dropdown, admin category keyboard reorder, `.drh-tokenWrap[aria-label]`, raw 2 px in `.baseline-ctaMark::before` and the `run.mjs --update` flag order. They stay open; none of them blocks launch.
- The phone shell width (escalation a4 in 04).

## 2. Intent

**Package intent.** The look of the app becomes something each person owns quietly. A person's theme is theirs for the day, it never changes under them, and the settings live in one place instead of being scattered as toggles that no longer make sense once themes can have a single mode. Launch should be calm: a person who never opens Appearance simply gets a new theme each day, and nothing in the page chrome tells them to do anything about it.

The picker is deliberately plain. It uses the controls the app already has (SegmentedControl, Select, MultiSelect), so every brand needs no new visual treatment and the section looks like the rest of the account page in each one.

## 3. Token values and the contract change

### 3.1 No new colour or shape slots

This package adds no colour, shadow, type, shape or decoration slot. Every text and background pair below uses the existing slots. The only contract change is 3.2.

### 3.2 Contract change: each theme declares its modes (the smallest one)

`packages/shared/src/brands.ts` gets a catalog. It lives in `shared`, not in `theme/brands/contract.ts`, because the pre-paint script needs it and must not import brand definitions (they bring raw values and font lists, and the script has a size budget).

```ts
export const COLOR_BASES = ["light", "dark"] as const;
export type ColorBase = (typeof COLOR_BASES)[number];

/** One mode a theme offers. A mode that is neither light nor dark names its nearest base. */
export type ThemeMode = { id: string; base: ColorBase };

export const BRAND_COLLECTIONS = ["ceremony", "cinema"] as const;
export type BrandCollection = (typeof BRAND_COLLECTIONS)[number];

export type BrandCatalogEntry = {
  id: BrandId;
  collection: BrandCollection;
  /** First entry is the theme's primary mode ("Theme default"). At most one mode per base. */
  modes: readonly [ThemeMode, ...ThemeMode[]];
};

export const BRAND_CATALOG: readonly BrandCatalogEntry[];
export const BRAND_LABELS: Record<BrandId, string>; // kept apart so pre-paint tree-shakes it
export const STARTING_BRAND: BrandId = "refined-gold";
```

`BrandDefinition.modes` stays `Record<Mode, ModeSlots>`. A single-mode theme fills `light` and `dark` with the **same** palette object. That single rule keeps `css.ts`, `--brand-light-*` / `--brand-dark-*`, the `data-mantine-color-scheme` selectors and every doubled dark rule working unchanged, with no optional slots and no non-null assertions. `brandContract.test.ts` gains two checks: every `BRAND_DEFINITIONS` id has one catalog entry, and a single-mode entry has `modes.light` deep-equal to `modes.dark`. No named mode id is emitted to CSS, because no component reads it.

Values:

| Brand | Collection | Primary mode (Theme default) | Modes       | Label        |
| ----- | ---------- | ---------------------------- | ----------- | ------------ |
| A     | ceremony   | light                        | light, dark | Refined Gold |
| B     | ceremony   | dark                         | dark, light | Red Carpet   |
| C     | ceremony   | light                        | light, dark | Ballot       |
| D     | ceremony   | dark                         | dark, light | Noir         |
| E     | ceremony   | light                        | light, dark | Festival     |
| F     | ceremony   | light                        | light, dark | Technicolor  |
| G     | ceremony   | light                        | light, dark | Lightbox     |

The primary modes equal `PRIMARY_MODE` in `tests/visual/matrix.ts`, which then derives from the catalog instead of repeating it. The light and dark `ThemeMode` values are shared constants (`{ id: "light", base: "light" }`, `{ id: "dark", base: "dark" }`).

A future single-mode Cinema theme looks like `modes: [{ id: "sepia", base: "dark" }]`.

`BRAND_IDS`'s comment ("fixed rotation order") becomes "stable identifiers; append only, because stored values and rounds name them".

### 3.3 Mantine's colour scheme

Mantine still has `light` and `dark` only, and it still drives every `:root[data-mantine-color-scheme]` rule. The attribute's value is now always the resolved mode's **base**. Nothing else reads a mode. See 4.7.

### 3.4 Contrast of the Appearance controls (all pairs, 14 palettes)

All values are computed. Body text needs 4.5:1; boundaries and non-text 3:1. Card fill is `raised`; inputs and the unselected segment well are `sunken`.

| Palette | text on raised (labels, option text, pill text, checked-segment label) | muted on raised (helpers, status, group headings, floor option) | muted on sunken (inactive segment label, placeholder, muted pill text) | text on sunken (selected option) | ruleStrong on raised (input, segmented indicator) | ruleStrong on sunken (MultiSelect pill edge) |
| ------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| A light | 17.37                                                                  | 6.03                                                            | 5.21                                                                   | 15.01                            | 3.59                                              | 3.10                                         |
| A dark  | 15.01                                                                  | 6.63                                                            | 5.97                                                                   | 13.52                            | 3.42                                              | 3.08                                         |
| B light | 18.00                                                                  | 6.43                                                            | 5.14                                                                   | 14.40                            | 3.86                                              | 3.09                                         |
| B dark  | 15.90                                                                  | 8.02                                                            | 7.38                                                                   | 14.63                            | 3.35                                              | 3.08                                         |
| C light | 16.51                                                                  | 6.99                                                            | 5.91                                                                   | 13.96                            | 3.69                                              | 3.12                                         |
| C dark  | 13.97                                                                  | 6.23                                                            | 5.75                                                                   | 12.90                            | 3.37                                              | 3.11                                         |
| D light | 18.88                                                                  | 6.90                                                            | 5.68                                                                   | 15.55                            | 3.84                                              | 3.17                                         |
| D dark  | 16.16                                                                  | 7.17                                                            | 6.46                                                                   | 14.55                            | 3.45                                              | 3.10                                         |
| E light | 17.67                                                                  | 5.95                                                            | 5.45                                                                   | 16.17                            | 3.33                                              | 3.05                                         |
| E dark  | 16.28                                                                  | 7.19                                                            | 6.45                                                                   | 14.60                            | 3.43                                              | 3.08                                         |
| F light | 16.45                                                                  | 6.85                                                            | 5.84                                                                   | 14.03                            | 3.59                                              | 3.06                                         |
| F dark  | 15.00                                                                  | 8.72                                                            | 7.49                                                                   | 12.89                            | 4.47                                              | 3.84                                         |
| G light | 18.42                                                                  | 7.25                                                            | 5.73                                                                   | 14.56                            | 3.97                                              | 3.14                                         |
| G dark  | 14.30                                                                  | 6.66                                                            | 6.05                                                                   | 13.00                            | 3.38                                              | 3.08                                         |

Weakest pairs that matter: muted on sunken 5.14 (B light); ruleStrong on sunken 3.05 (E light). No pair fails. The save-failure message uses the existing `FormStatus` alert (03 pairs). Win gold and status colours do not appear in the section.

The muted pill pair is under 4.13.1.

## 4. Component rules and behaviour

### 4.1 Model and layering

#### The state each person has

| Setting             | Values                                               | Default                                                                        |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Selection           | Random, or Fixed on one theme                        | Random                                                                         |
| Mode                | `light`, `dark`, `theme`                             | `theme`                                                                        |
| Random exclusions   | themes removed from the Random selection             | none. Selected = discovered minus excluded, so a new discovery joins by itself |
| Undiscovered themes | on, off                                              | on                                                                             |
| Single-mode policy  | `own`, `exclude`                                     | `own`                                                                          |
| Discovered themes   | set; Refined Gold is always counted and never stored | empty set                                                                      |
| Daily draw          | `{ day, brand, rounds: { ceremony, cinema } }`       | none                                                                           |

#### Layering (`docs/architecture/atomization.md`)

| Layer         | File                                                                                                            | Contents                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision      | `packages/shared/src/brands.ts`                                                                                 | ids, `ENABLED_BRAND_IDS`, catalog, labels, `brandDayNumber`, stored-value normalisers                                                                    |
| Decision      | `packages/shared/src/appearance.ts` (new subpath `./appearance`, no zod)                                        | `seedHash`, `seedFraction`, `buildGroups`, `groupShares`, `pickGroup`, `drawDaily`, `drawShuffle`, `resolveMode`, `resolveAppearance`, `parseAppearance` |
| Decision      | `packages/shared/src/schemas/account.ts`                                                                        | request schemas (4.5)                                                                                                                                    |
| Decision      | `apps/web/src/decisions/brand.ts`                                                                               | `enabledBrandIds`, `userIdentity`, `anonymousIdentity`, `resolvePrepaintAppearance`, parsers for the stored JSON, `decideWordmarkShuffle` (4.9)          |
| Decision      | `apps/web/src/decisions/appearance.ts` (new)                                                                    | `deriveAppearanceView` (options, headings, floor, conflict visibility, notes), `applyRandomListChange`, `pendingAccountMerge`                            |
| Orchestration | `apps/web/src/orchestration/brand/storage.ts`                                                                   | the stores of 4.6                                                                                                                                        |
| Orchestration | `apps/web/src/orchestration/brand/orchestration.ts`                                                             | the boot sequence (4.6), the save queue, optimistic updates and rollback, `shuffle()`, writing `data-brand` and `setColorScheme`                         |
| Orchestration | `apps/web/src/orchestration/brand/colorSchemeManager.ts` (new)                                                  | the non-persisting Mantine manager (4.7)                                                                                                                 |
| Orchestration | `apps/web/src/orchestration/brand/prepaint.ts`, `brand-init.ts`, `vite/brandInit.ts`                            | pre-paint                                                                                                                                                |
| API           | `apps/api/src/data/repositories/userAppearanceRepository.ts` (new), `routes/auth/{me,login,preferences}.ts`     | column IO; routes stay thin                                                                                                                              |
| Glue          | `apps/web/src/brand/context.tsx`, `app/pages/AccountPage.tsx`, `app/layouts/ShellLayout.tsx`                    | wiring; the phone flag (`useMediaQuery`); the wordmark click handed to `ShellHeader`                                                                     |
| UI            | `apps/web/src/features/account/ui/AppearanceSection.tsx` (new), `app/chrome/ui/Wordmark.tsx`, `ShellHeader.tsx` | props and events only. No storage, no fetches, no rules                                                                                                  |

### 4.2 The daily draw (pure, in `appearance.ts`)

**Inputs:** `identity` (`user:<id>` or `anon:<id>`), `day` (`brandDayNumber` of the viewer's local time), `catalog`, `enabled`, `discovered`, the settings, `previous` (the last `DailyDraw`, or null). All are arguments; nothing is read from the environment.

**Seed.** `seedHash(...parts)` is FNV-1a of `parts.join("|")` passed through a 32-bit avalanche (`h ^= h >>> 16; h = imul(h, 0x85ebca6b); h ^= h >>> 13; h = imul(h, 0xc2b2ae35); h ^= h >>> 16`), and `seedFraction` divides it by 2^32. The avalanche is needed because FNV alone is weak when strings differ only at the end. Over 200,000 identities the group roll landed within 0.1 point of its target and the seven themes within 0.2 point of equal.

**Groups** (`buildGroups`). Let `known` be enabled themes that are discovered or `STARTING_BRAND`. Let `selected` be `known` minus the exclusions and `fresh` be enabled themes not in `known` (empty when Undiscovered themes is off).

| Group        | Pool                                                    | Share                           |
| ------------ | ------------------------------------------------------- | ------------------------------- |
| `cinemaNew`  | `fresh` themes in the Cinema collection                 | 5 % if non-empty                |
| `cinemaSeen` | `selected` themes in the Cinema collection              | 5 % if non-empty                |
| `ceremony`   | `selected` Ceremony themes plus `fresh` Ceremony themes | the remainder (90, 95 or 100 %) |

Equal shares inside `ceremony` come from the rounds below: every theme in the pool, discovered or not, is drawn once before any repeats. Selection size never moves the group odds. When `ceremony` is empty, the Cinema groups present split 100 % equally. Rule of thumb: Cinema groups keep exactly 5 % as long as Ceremony exists, and Ceremony takes everything else, so "an empty group's share passes on".

**Single-mode policy.** If mode is `light` or `dark` and the policy is `exclude`, remove single-mode themes from all three pools. If that leaves all three empty, restore them (the owner's "use them anyway").

**Floor.** If all three are still empty (only possible when every option is off through a release change), `selected` becomes all of `known` with Undiscovered off. `STARTING_BRAND` is always enabled, so this always yields a theme.

**Draw.**

1. `r = seedFraction(identity, day, "group")`. Walk `cinemaNew`, `cinemaSeen`, `ceremony` in that order, adding each non-empty group's share; the first group where `r` is less than the running total wins (rounding: if none, the last non-empty group wins).
2. Rounds are per collection: `ceremony` for that group, `cinema` for both Cinema groups. `round = previous.rounds[key]` (or empty).
3. `eligible = pool minus round minus previous.brand`.
4. If `eligible` is non-empty, pick the one with the lowest `seedHash(identity, day, group, brand)` and append it to the round.
5. Otherwise start a new round: `eligible = pool minus previous.brand`; if that is empty, `eligible = pool`. Pick the lowest again; the round becomes `[pick]`.
6. Return `{ day, brand: pick, rounds }`.

Picking by lowest hash, rather than by a stored permutation, means adding or removing a theme does not reorder the rest.

**Reconciling the rules.**

- _No repeat within a group, given random group choice._ Each collection has its own round, and a round only advances on days its group wins. A group that wins rarely simply progresses rarely; its own "no repeat" holds regardless of the days between. A Cinema theme drawn from `cinemaNew` goes into the `cinema` round, so it cannot immediately reappear through `cinemaSeen`.
- _Against the earlier 7-day block._ The block becomes a round. For the common case (seven Ceremony themes selected, none Cinema) a round is seven visited days with no repeat inside it, and the first theme of a new round is never the last theme of the one before, so no two consecutive days match. That is the 2026-11-04 behaviour. A theme can still recur a few days apart across a round boundary (the shortest gap in the prototype run was 2 days), as the 2026-11-04 block design also allowed. Unvisited days do not use up a theme.
- _A selection that changes mid-round._ The pool is read fresh each draw and the round is a memory of what was shown. A theme that was shown stays in the round even if removed and re-added, so it does not repeat within that round. A removed theme is simply not eligible. A theme newly added or newly discovered is eligible at once. When everything in the current pool has been shown, a new round starts. Example 3 in 4.3 shows this.
- _Cross-group repeat._ The pools are disjoint, or the theme is already in the round, so consecutive days can repeat only when the pool has one theme, in which case repeating is correct.

**The day's theme, stored.** A draw happens once per brand day per identity: the app calls `drawDaily` only when there is no record for the current day. After the first draw of the day the record is the theme; `resolveAppearance` never redraws while it exists. A discovery or a Random-list edit therefore cannot change today's theme.

**Local brand day and devices.** The 04:00 day is local to the device (unchanged `brandDayNumber`). One account has one record, and the record's `day` only moves forward:

- `record.day >= localDay` → the record's brand. A device whose local day is behind (the other device is east of it, or the person flew west) shows the account's saved theme and does not draw.
- `record.day < localDay` → draw, save, and on a successful save the new record becomes the account's.
- The save is compare-and-set (4.5): the write applies only if the stored record is older. Two devices that draw at the same moment compute the same theme, because the inputs and the seed are the same; if they differ (one had stale settings) the first write wins and the second device adopts the returned record at once.

#### Where the day's theme is saved

| Audience   | Store                                                                             | Agreement                                                       |
| ---------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Signed in  | `app_user.daily_draw` (server), mirrored in `fo:account-appearance` for pre-paint | The server record. Two devices of one account read the same row |
| Logged out | `fo:anon-draw` (localStorage)                                                     | One browser, one identity                                       |

**Fixed** never draws and writes no record. Switching Fixed to Random mid-day uses today's record if one exists, otherwise it draws at that moment.

**Mid-day changes.** Mode applies at once. A change of Selection (Random and Fixed, or the Fixed theme) applies at once. A Random-list or Undiscovered change applies from the next draw (escalation a2). A running page that crosses 04:00 keeps its theme until reload, as today.

### 4.3 Worked examples (unit-test vectors)

Day 20766 is brand day 2026-11-09. `C7` is the seven real themes. The fixture adds `cinema-a` and `cinema-c` (two modes) and `cinema-b` (`[{ id: "sepia", base: "dark" }]`).

**Example 1. Default, `user:42`, nothing discovered, all seven released.** Every roll lands in `ceremony`. In the table, "Roll" is `seedFraction("user:42", day, "group")`.

| Day   | Roll   | Theme        |
| ----- | ------ | ------------ |
| 20766 | 0.4343 | festival     |
| 20767 | 0.3386 | refined-gold |
| 20768 | 0.2071 | noir         |
| 20769 | 0.2118 | ballot       |
| 20770 | 0.3061 | red-carpet   |
| 20771 | 0.6084 | lightbox     |
| 20772 | 0.2650 | technicolor  |
| 20773 | 0.3047 | festival     |
| 20774 | 0.0802 | red-carpet   |

Seven days without a repeat, then a new round, and day 20773 is not technicolor. Red-carpet on days 20770 and 20774 is correct: the two days are in different rounds, and only the previous day is avoided at a boundary. Over 2,000 identities and 70 days each (ten rounds): no theme repeated inside a round, and no two consecutive days matched. A sliding seven-day window does not hold: every identity had a repeat inside one at some boundary, and the shortest gap between two showings of a theme was 2 days. Logged-out `anon:3f1c`: 20766 technicolor, 20767 noir, 20768 refined-gold (same rules, different seed).

**Example 2. Cinema fixture, `user:42`, `discovered = [cinema-a]` at the start, default settings.** Pools: `cinemaNew` {cinema-b, cinema-c}, `cinemaSeen` {cinema-a}, `ceremony` {all seven}. Shares 5, 5, 90. Roll 0.0802 on day 20774 is between 0.05 and 0.10, so `cinemaSeen` wins and the draw is cinema-a. Over 60 days of the same run (discoveries accumulating): cinema-a on days 20774, 20789 and 20799 (rolls 0.0802, 0.0788, 0.0519); `cinemaNew` wins on day 20803 (0.0124, cinema-b) and day 20815 (0.0388, cinema-c); `cinemaSeen` shows cinema-b on day 20808 (0.0663); every other day is Ceremony.

**Example 3. A selection that changes mid-round, `user:42`, `C7`.** Days 20766 to 20768 as in example 1 (festival, refined-gold, noir). From day 20769 the person excludes festival and noir.

| Day   | Round before                                             | Pool                                                    | Eligible (4.2 step 3)                                                                | Theme       |
| ----- | -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| 20769 | festival, refined-gold, noir                             | refined-gold, red-carpet, ballot, technicolor, lightbox | red-carpet, ballot, technicolor, lightbox                                            | ballot      |
| 20770 | festival, refined-gold, noir, ballot                     | same                                                    | red-carpet, technicolor, lightbox                                                    | red-carpet  |
| 20771 | …, red-carpet                                            | same                                                    | technicolor, lightbox                                                                | lightbox    |
| 20772 | …, lightbox                                              | same                                                    | technicolor                                                                          | technicolor |
| 20773 | …, technicolor (nothing eligible, so a new round starts) | same                                                    | refined-gold, red-carpet, ballot, lightbox (step 5: all but yesterday's technicolor) | ballot      |
| 20774 | ballot                                                   | same                                                    | refined-gold, red-carpet, technicolor, lightbox                                      | red-carpet  |

The excluded festival and noir stay in the old round's memory and are simply not eligible. The round ended after the five remaining themes were shown, on day 20772, and the new round holds only the current pool.

**Example 4. Only Cinema selected.** `user:42`, `discovered = C7 + cinema-a + cinema-b`, all of `C7` excluded, Undiscovered on. Pools: `cinemaNew` {cinema-c}, `cinemaSeen` {cinema-a, cinema-b}, `ceremony` empty. Shares 50, 50, 0. Roll 0.4343 gives `cinemaNew`, cinema-c. With Undiscovered off: `cinemaSeen` 100 %. With an empty Random list the floor (4.8) prevents this state from being saved.

**Example 5. Single-mode policy.** Mode `light`, policy `exclude`, `discovered = [cinema-b]`: `cinema-b` leaves every pool. Pools: `cinemaNew` {cinema-a, cinema-c}, `ceremony` {all seven}. With the same settings plus `refined-gold` excluded and Undiscovered off: removing `cinema-b` would empty everything, so it stays: `cinemaSeen` {cinema-b}, 100 %.

**Example 6. Undiscovered off.** Fixture, `discovered = [cinema-a]`: `cinemaSeen` 5 %, `ceremony` {refined-gold} 95 %.

### 4.4 Discovery

- **Counts as shown:** a theme applied to the document by a completed daily draw or a wordmark shuffle, after the session check has finished. A pre-paint guess that the session check corrects does not count. A Fixed theme is not a discovery route (Fixed stops discovery); a stored Fixed slug naming an undiscovered theme just appears in the list.
- **When it is recorded:** in the same step that saves the draw (`add_discovered_brands` in the same PATCH, or `fo:anon-draw` plus `fo:discovered` for a logged-out visitor), and for a shuffle immediately after the swap.
- **Everyone starts with Refined Gold.** `STARTING_BRAND` counts as discovered everywhere and is never stored.
- **Headings.** "Ceremony" and "Cinema" render only when one of their themes is discovered. In the shipped catalog "Ceremony" is always present and "Cinema" never is.
- **Auto-join.** Selected is `discovered minus excluded`, so a newly discovered theme is in the Random list with nothing to write. Removing it adds it to the exclusions.
- **"Undiscovered themes".** Shown in the Random list while any released theme remains undiscovered; on by default; not shown under Fixed. When nothing remains undiscovered the option is gone and its stored value is inert.
- **Browser queue.** `fo:discovered` holds discoveries an account has not confirmed: every logged-out discovery, and a signed-in discovery until its PATCH succeeds. At every signed-in boot, anything in it that the account lacks is sent and the entries are then removed. That is the login merge and also the retry.

### 4.5 Data

**Migration** `database/migrations/020_app_user_appearance.sql`:

```sql
-- Appearance: mode, Random selection, discoveries and the saved theme of the day.
-- Values are validated by the API; see packages/shared/src/schemas/account.ts.
ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS mode_preference text,
  ADD COLUMN IF NOT EXISTS random_excluded_brands text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS undiscovered_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS single_mode_policy text NOT NULL DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS discovered_brands text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS daily_draw jsonb;
```

`brand_preference` (019) stays and keeps its meaning: `random`, `rotate` or NULL mean Random defaults; a slug means Fixed. New writes only store `random` or a slug.

#### Stored value rules (`parseAppearance`, shared)

| Stored                                                                                      | Resolves to                                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `brand_preference` NULL, `rotate`, `random` or unknown                                      | Random. The row is not rewritten                                                           |
| `brand_preference` a released slug                                                          | Fixed                                                                                      |
| `brand_preference` a slug not released                                                      | Random, with the note in 4.8. The value is kept and returns if the brand is released again |
| `mode_preference` NULL                                                                      | `theme`; still eligible for the legacy copy (4.10)                                         |
| `discovered_brands`, `random_excluded_brands`, draw rounds naming unreleased or unknown ids | Filtered at read. Never rewritten                                                          |
| `daily_draw.brand` not released                                                             | Ignored; today draws again and overwrites (the CAS below allows this)                      |
| Settings that select nothing after filtering                                                | Floor (4.2): `selected` becomes all of `known`, and the list shows them selected           |

**API.** `GET /auth/me` and `POST /auth/login` keep `brand_preference` and add:

```json
"appearance": {
  "mode_preference": "light",
  "random_excluded_brands": ["noir"],
  "undiscovered_enabled": true,
  "single_mode_policy": "own",
  "discovered_brands": ["ballot"],
  "daily_draw": { "day": 20766, "brand": "festival", "rounds": { "ceremony": ["festival"], "cinema": [] } }
}
```

`PATCH /auth/me/preferences` stays the single write path, now a partial update (`updatePreferencesBodySchema`):

| Field                    | Validation                                                                                                                                                                                                                                                      | Write                                                                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brand_preference`       | optional, as today (`BRAND_PREFERENCES` or null)                                                                                                                                                                                                                | set                                                                                                                                                                                                                       |
| `mode_preference`        | optional, `light`, `dark`, `theme` or null                                                                                                                                                                                                                      | set                                                                                                                                                                                                                       |
| `random_excluded_brands` | optional, deduped array of `BRAND_IDS`, max `BRAND_IDS.length`                                                                                                                                                                                                  | set; rejected (`400`) if it would leave no option selected for this account, counted after any `add_discovered_brands` in the same request and with `undiscovered_enabled` as sent or stored                              |
| `undiscovered_enabled`   | optional boolean                                                                                                                                                                                                                                                | set                                                                                                                                                                                                                       |
| `single_mode_policy`     | optional, `own`, `exclude`                                                                                                                                                                                                                                      | set                                                                                                                                                                                                                       |
| `add_discovered_brands`  | optional, deduped array of `BRAND_IDS`, max `BRAND_IDS.length`                                                                                                                                                                                                  | union into `discovered_brands`                                                                                                                                                                                            |
| `daily_draw`             | optional object: `day` integer within 2 of the server's UTC day number, `brand` in `BRAND_IDS`, `rounds` a strict object with exactly the keys `ceremony` and `cinema` (any other key is rejected), each a deduped array of `BRAND_IDS`, max `BRAND_IDS.length` | Compare-and-set, one `UPDATE`: applies only when `daily_draw IS NULL`, or the stored `day` is older, or the stored brand is not in `ENABLED_BRAND_IDS`. Otherwise this field is ignored and the stored record is returned |

At least one field is required (400 otherwise). The body is a partial update; only provided columns are in the `SET` list, all in one `UPDATE ... RETURNING`. The response is `{ preferences: { brand_preference, appearance } }`. Keeping `brand_preference` works for any page still loaded on the old bundle.

The `±2` rule on `day` covers every real time zone (the local day is between 2 behind and 1 ahead of the UTC date, after the 04:00 shift), and stops a device with a wrong clock poisoning the record: the write is rejected and the local draw simply is not saved.

### 4.6 Pre-paint, stores and the boot sequence

**Stores** (`orchestration/brand/storage.ts`, localStorage unless noted)

| Key                          | Content                                               | Lifetime                                                         |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| `fo:account-appearance`      | `{ identity, brandPreference, appearance }`           | Written on every session resolve; removed on logout              |
| `fo:anon-draw`               | `{ day, brand, rounds }`                              | Logged-out daily draw                                            |
| `fo:discovered`              | array of ids (4.4)                                    | Logged-out discoveries and unconfirmed signed-in ones            |
| `fo:shuffle`                 | `{ identity, day, brand, rounds, seq }` (4.9)         | Ignored and removed once `day` is not today, or identity differs |
| `fo:anon-id`                 | unchanged                                             |                                                                  |
| `mantine-color-scheme-value` | legacy light or dark; read once at first login (4.10) | Removed after it is consumed                                     |

Retired and deleted at boot: `fo:brand-session` (sessionStorage), `fo:brand-last`, `fo:brand-preference`. The day record replaces the per-tab pin.

**Pre-paint.** `applyPrepaintBrand` becomes `applyPrepaintAppearance(root, now, enabled)`: it calls `resolvePrepaintAppearance` and sets both `data-brand` and `data-mantine-color-scheme`, then the fonts preload runs as today. The block in `main.tsx` that sets the attribute is removed. The same pure code runs in the script and the app, as today. The script budget in `prepaint.test.ts` ("is small and self-contained") goes from 6000 to 8000 characters; the draw adds about 3 KB.

| Situation                                                             | What the script reads                                                 | Paints                                                              | After the session check                                                                                                                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed in, same brand day                                             | `fo:account-appearance`                                               | The saved theme and resolved mode                                   | Nothing changes                                                                                                                                                                    |
| Signed in, new brand day                                              | `fo:account-appearance` (settings, previous draw)                     | Runs `drawDaily` itself; same inputs as the app, so the same result | Nothing changes, unless another device changed settings since; then one correction                                                                                                 |
| Signed in, shuffled today                                             | plus `fo:shuffle` (identity matches)                                  | The shuffled theme                                                  | Nothing changes                                                                                                                                                                    |
| Logged out, returning                                                 | `fo:anon-*`, `fo:discovered`                                          | The saved theme, or the day's draw                                  | Nothing changes                                                                                                                                                                    |
| First visit ever                                                      | nothing                                                               | The draw for a new anon id, that theme's primary mode               | Nothing changes                                                                                                                                                                    |
| **Signed in on a fresh device** (valid cookie, empty storage)         | nothing; the script cannot tell a session exists                      | The anon draw, once                                                 | `/auth/me` returns; the account's theme replaces it with one swap and the snapshot is written, so this cannot happen on that device again. No discovery is recorded from the guess |
| Session expired (`fo:account-appearance` exists, the cookie does not) | `fo:account-appearance`; the script cannot tell the session has ended | The account's theme, as a guess                                     | The session check returns no user: one instant swap to the logged-out theme, and the snapshot is removed (below)                                                                   |
| Script throws                                                         | nothing                                                               | Unset attributes: refined-gold, dark                                | Corrected by the app                                                                                                                                                               |

**Boot sequence** (`useBrandOrchestration`, runs when `authLoading` turns false and whenever `identity` changes; never on a background refetch):

1. If the session check failed (`sessionError`: the API could not answer), keep the painted theme, make no writes of any kind, local or remote, and keep the snapshot. Retry on the next load. This is not the expired-session case below.
2. Retire the three old keys.
3. Build the effective state: signed in, the account's values, with `pendingAccountMerge` (browser discoveries the account lacks, the legacy mode if `mode_preference` is NULL). Signed out, the Random defaults plus `fo:discovered` and `fo:anon-draw`.
4. If the snapshot has a newer draw for this identity than the server (a previous save failed), use the snapshot's draw and send it again rather than redraw.
5. `resolveAppearance`. Result: `{ brand, mode, draw }`.
6. Apply `data-brand` and `setColorScheme(mode.base)`.
7. Persist the snapshot or the anon keys.
8. Signed in: one PATCH carrying everything from steps 3–5 that changed. On success, update the auth query from the response. On a losing CAS (the response's draw differs), re-apply the returned theme once. Clear the consumed local keys. On failure, keep the local state, write nothing else and retry on the next load.

**Session expired.** The session check answers normally but with no user (`user` null, `sessionError` null) while `fo:account-appearance` exists: the cookie expired, or it was cleared, with no explicit logout. It takes the same path as a logout. The identity is the anonymous one, so step 3 builds the logged-out state and `resolveAppearance` uses `fo:anon-draw`, or draws for the anon identity. The painted account theme is replaced in one instant swap, and only if the theme or base differs. The snapshot is removed, so the next load does not paint the account's theme for a visitor who is no longer signed in. Nothing is written against the account: no PATCH, no `daily_draw`, no `add_discovered_brands`. A logged-out draw goes only to `fo:anon-draw` and `fo:discovered`, and the existing entries in `fo:discovered` stay for the merge at the next login. If the session ends while a page is open, a background refetch changes `identity` and the same path runs. At the next login the account's own record decides the theme (4.10).

The difference from step 1: `sessionError` means "unknown, change nothing"; no user means "known to be logged out".

**Several tabs.** There is no live sync between open tabs. Production code adds no `storage` listener for any of these keys (the only listener is the test-build one in 4.7). A tab keeps what it painted until it reloads or its identity changes.

| Event in another tab             | This open tab                                                                                                                                                                                           | On reload or in a new tab                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings change                  | Keeps its theme and mode. Its Appearance section shows the new values after the next focus refetch of `/auth/me`, and a save from here sends only the changed fields, so it does not overwrite the rest | Reads the saved settings                                                                                                                                                    |
| Wordmark shuffle                 | Keeps its theme. A shuffle clicked here reads `fo:shuffle` at click time, so the rounds and `seq` are shared                                                                                            | Paints the shuffled theme (4.9), so "refreshes and new tabs keep it" holds                                                                                                  |
| 04:00 crossing                   | Keeps its theme, as a single tab does (4.2)                                                                                                                                                             | Draws, or reads the record if another tab already drew. Tabs that draw together have the same inputs and compute the same theme; the compare-and-set settles any difference |
| Logout, or login as someone else | The focus refetch changes `identity`, and the boot sequence runs                                                                                                                                        | Resolves for the new identity                                                                                                                                               |

### 4.7 Mode, Mantine and existing stored choices

**Resolve** (`resolveMode(preference, entry)`):

- `theme` → `entry.modes[0]`.
- `light` or `dark` → the first entry mode whose `base` equals the preference, else `entry.modes[0]` (that is what makes a single-mode theme "simply use its only mode").

**Mantine.** `MantineProvider` receives a custom `colorSchemeManager` (from `main.tsx`, passed through `AppProviders`, because `ui/` may not import orchestration): `get` returns the current `data-mantine-color-scheme` attribute (falling back to the default), `set`, `clear` and `subscribe` do nothing in production. Mantine therefore stops writing `mantine-color-scheme-value`, which keeps that key meaningful as "a person chose this before" (4.10). `useBrandOrchestration` (through `BrandProvider`) calls `setColorScheme(base)`, which updates the attribute and Mantine's state. `defaultColorScheme` stays `"dark"` only as the unreachable fallback.

**Test-only override.** In builds with `__FO_ENABLE_ALL_BRANDS__` / `VITE_FO_ENABLE_ALL_BRANDS=1`, `fo:test-appearance` (`{ brand, mode }`) is honoured first by `resolvePrepaintAppearance` and `useBrandOrchestration`, which then draws nothing, saves nothing and records no discovery, and the manager's `subscribe` listens for `storage` events on that key so the assertion tier can repaint in place. The flag is compiled out of production; the existing production-build tests extend to assert the key is ignored.

**Existing stored choices.** A legacy `mantine-color-scheme-value` exists only for people who once pressed the toggle (Mantine writes it only on a change). It is ignored while logged out and copied at first login if the account has none (4.10). Everyone without it moves to Theme default, which means refined-gold's light mode for people who have never touched the toggle (build notes, risks).

### 4.8 The Appearance section

**Placement and construction.** A `StandardCard` after the Account details card, `id="appearance"`, `aria-labelledby="appearance-title"`, in `AccountScreen`. The intro line becomes "Manage your profile, appearance and security." Order inside: heading row, Mode, Theme, Themes, conflict control. Single column, gap `var(--fo-space-sm)`.

```text
<StandardCard component="section" id="appearance">
  <Group justify="space-between" align="center">
    <Title id="appearance-title" variant="section" order={3}>Appearance</Title>
    <Text variant="meta" role="status" aria-live="polite" className="account-saveStatus" />   // reserves one line
  </Group>
  [FormStatus on failure]
  Mode        SegmentedControl
  Theme       SegmentedControl (Random / Fixed)
  Themes      Select (Fixed) or MultiSelect (Random)
  Conflict    SegmentedControl, only when shown
</StandardCard>
```

#### Controls

| Control   | Mantine                         | Configuration                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode      | `SegmentedControl`, `fullWidth` | Data: `Light`, `Dark`, `Theme default`; label "Mode" (`Text` with `id`, `aria-labelledby` on the control). Width ≥ 500: horizontal. Width &lt; 500: `orientation="vertical"`, from `useMediaQuery` with `getInitialValueInEffect: false`, so the phone never shows a horizontal frame. Three segments do not fit 256 px                                                                  |
| Selection | `SegmentedControl`, `fullWidth` | Data: `Random`, `Fixed`; label "Theme". Horizontal at every width                                                                                                                                                                                                                                                                                                                        |
| Fixed     | `Select`                        | `searchable={false}`, `allowDeselect={false}`, `withCheckIcon`, `checkIconPosition="right"`, `comboboxProps={{ withinPortal: true, position: "bottom-start" }}`; grouped `data` (`[{ group: "Ceremony", items: [...] }, ...]`), group only when non-empty; label "Your theme"                                                                                                            |
| Random    | `MultiSelect`                   | `searchable={false}`, `hidePickedOptions={false}`, `clearable={false}`, `withCheckIcon`, `checkIconPosition="right"`, `placeholder="Choose…"`, same `comboboxProps`; label "Themes to include"; `data` first holds `{ value: "undiscovered", label: "Undiscovered themes" }` (when shown) then the groups, ungrouped option first. `value` sorted by catalog order, "undiscovered" first |
| Conflict  | `SegmentedControl`, `fullWidth` | Data as owner's text: "Use the theme's own mode", "Leave those themes out"; label "Themes with one mode"; vertical below 500, horizontal above                                                                                                                                                                                                                                           |

`placeholder` must be set: Mantine renders a non-searchable MultiSelect field as `type="hidden"` when there is no placeholder, which removes it from the tab order. `searchable={false}` also keeps the phone keyboard closed.

**Skin** (`styles.css`, the same for every brand; only slots): dropdown already uses `--brand-raised` and `--brand-shadow-overlay`. New: `.mantine-Select-groupLabel, .mantine-MultiSelect-groupLabel` in `--brand-font-label`, `--fo-font-size-xs`, `--brand-label-case`, `--brand-label-letter-spacing`, `--brand-muted`. `.mantine-MultiSelect-pill`: fill `--brand-raised`, `--brand-text`, `box-shadow: 0 0 0 var(--fo-border-width) var(--brand-rule-strong)`, radius `--brand-button-radius`. Disabled option (the floor): `opacity: 1; color: var(--brand-muted); cursor: not-allowed` so its label stays readable. `.mantine-Select-option[data-combobox-disabled], .mantine-MultiSelect-option[data-combobox-disabled]` carry that disabled rule. `.mantine-MultiSelect-input:focus-within`: the same `--brand-focus-ring` box-shadow and border as `.mantine-Select-input:focus` (the MultiSelect root is a div, so `:focus` never matches; this is M6).

#### Phone rendering (390; card inner width 256 px)

- Segmented controls stack: Mode vertically, three rows; each segment label `min-height: var(--fo-touch-target)`.
- Select and MultiSelect inputs are 44 px minimum height (4.13.2). The dropdown opens below the field, full field width, capped by the existing `min(280px, 100vh - 220px)` rule; option rows `min-height: var(--fo-touch-target)`, content centred. It uses the Combobox dropdown, not a bottom sheet. It is read-only (no phone keyboard).
- MultiSelect pills wrap inside the field. The field's `inputField` is `min-height: 44px; flex: 1 0 100%` at this width, so "Choose…" sits on its own 44 px row. The pills' remove buttons are hidden below 500; tap the field, tap the option in the list.

#### Keyboard

- Segmented controls: one Tab stop per group; Arrow keys move and select (native radios).
- Select: Enter, Space or Arrow keys open; Arrow keys move between options, skipping group labels; Enter chooses and closes; Escape closes.
- MultiSelect: Tab focuses the field. Space, Arrow Down and Arrow Up open; Arrow keys move, skipping group labels and the disabled floor option; Enter toggles and keeps it open; Escape closes; Tab closes and moves on. Backspace removes the last value (kept; `applyRandomListChange` rejects it at the floor). Pills' remove buttons are not focusable (Mantine renders them `aria-hidden`) and are a pointer convenience; the list is the keyboard path.

#### Behaviour of each change

| Action             | Writes                                                  | Effect                                                                   |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Mode change        | `mode_preference`                                       | The attribute changes at once for the current theme                      |
| Random to Fixed    | `brand_preference` = the theme on screen                | No visible change; the Select shows that theme. Shuffle override cleared |
| Fixed theme change | `brand_preference`                                      | That theme and its mode at once. Shuffle override cleared                |
| Fixed to Random    | `brand_preference: "random"`; `daily_draw` if drawn now | Today's record, or a draw now. Shuffle override cleared                  |
| Random list change | `random_excluded_brands` and/or `undiscovered_enabled`  | Nothing visible now; applies from the next draw                          |
| Conflict change    | `single_mode_policy`                                    | Applies from the next draw                                               |

**Saving.** Optimistic. Controls stay enabled during a save (disabling a focused radio would drop keyboard focus). Writes are serialised: one PATCH in flight, later changes merged into the next. The status text is "Saving…" while in flight, "Saved" for 2 s afterward, otherwise empty.

#### States

| State                              | What the section shows                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                            | No section skeleton. `/account` is behind the guard, so the route shows `PageLoader` "Checking session…" until the session is known, and the section's data comes with the session. A background refetch never shows loading. If `appearance` is missing (a very old session response) the section shows the Random defaults             |
| Save in flight                     | Controls enabled with the new value; status "Saving…"                                                                                                                                                                                                                                                                                    |
| Save failure                       | The section reverts to the last saved values; Mode and any Fixed-theme change are reverted on the page too. `FormStatus` below the heading: "Couldn't save your appearance settings. Your previous settings are back." and "Retry", which re-sends the failed change                                                                     |
| One theme discovered only          | Random: list is "Undiscovered themes" then Ceremony / Refined Gold; both selected; helper "Themes appear here once you've seen them." Fixed: one option, Refined Gold. With one released theme there is no Undiscovered option and the floor state below applies                                                                         |
| All discovered                     | No "Undiscovered themes" option. Helper "Themes appear here once you've seen them." is gone; the list is the full catalog by group                                                                                                                                                                                                       |
| Single-mode theme selected (Fixed) | Mode control unchanged and enabled; a helper under it: "{Theme} has one mode, so this setting doesn't change it."                                                                                                                                                                                                                        |
| Conflict control                   | Rendered only when mode is Light or Dark, selection is Random, and at least one discovered released theme has a single mode. Never rendered in the shipped catalog; covered by the specimen fixture                                                                                                                                      |
| Random floor (one option selected) | That option is `disabled` in the list and its pill has no remove button. Helper in place of the rule helper: "At least one option stays selected."                                                                                                                                                                                       |
| Last item removal                  | Impossible from the UI: the one remaining option is disabled, and Backspace or a stale value is rejected by `applyRandomListChange`. A newly discovered theme joins by itself, so the list cannot empty through discovery. If a release change empties it, the floor in 4.2 applies and the list shows everything discovered as selected |
| Stored Fixed theme not released    | Selection shows Random; helper under Theme: "Your fixed theme isn't available right now, so we're using Random."                                                                                                                                                                                                                         |

#### Copy (in `decisions/appearance.ts` or the UI file, no brand variation)

| Where            | Text                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Mode helper      | "Theme default uses the mode each theme was designed for."                                           |
| Random helper    | "A new theme each day, picked from the themes below. Changes here apply from your next daily theme." |
| Fixed helper     | "The same theme every day."                                                                          |
| Conflict, helper | "Some themes come in only one mode."                                                                 |

### 4.9 Wordmark shuffle

**Trigger** (`decideWordmarkShuffle`, pure): a plain click (`button === 0`, no meta, ctrl, shift or alt) on the wordmark, with `pathname === "/"` before navigation. The check is on `pathname` alone, so a query string or hash is ignored and `/?a=1#b` counts as Home. The wordmark remains a link; every other click navigates as today, so the click that arrives at Home never shuffles. Only in `ShellHeader`: the auth layout's wordmark is not on Home and needs no handler.

**The draw** (`drawShuffle`, pure). Same `buildGroups` and shares as the daily draw, the Undiscovered setting and the single-mode policy, with two changes: `current` is removed from every pool, and on Fixed the groups are built from all discovered themes (no exclusions, no `fresh`). Per-collection rounds are local to the brand day; on the first shuffle of a day `current` is the start of its collection's round. Seeds: `seedFraction(identity, day, "shuffle", seq, "group")` and `seedHash(identity, day, "shuffle", seq, group, brand)`, with `seq` counting today's shuffles. Round handling is the same as 4.2, without the `previous` avoidance (the pools already exclude `current`).

**No-op condition.** `drawShuffle` returns null when every pool is empty after removing `current`: one theme released; or Fixed with one discovered; or Random with only today's theme selected and Undiscovered off or empty. Then nothing changes and the click is an ordinary link to `/`.

**The click.** The handler runs the draw synchronously. When `drawShuffle` returns a theme, it calls `event.preventDefault()`, so React Router does not navigate: no history entry, no URL change and no scroll reset. When it returns null, the handler does not call `preventDefault` and the link behaves normally. A click ignored because a transition is running also calls `preventDefault`, so it cannot navigate either.

**Worked example.** `user:42`, day 20766, Random, `current = festival`, `discovered = [festival]`: ballot, technicolor, red-carpet, noir, refined-gold, lightbox, then a new round starts on technicolor. Fixed on ballot with `discovered = [ballot, noir]`: noir, refined-gold, noir, ballot (always within the three, never the current one).

**Subtle.** No toast, tooltip or live-region announcement. About 150 ms cross-fade: `document.startViewTransition` when available and motion is not reduced, swapping `data-brand` and `setColorScheme` inside the callback and awaiting `document.fonts.ready` capped at 200 ms, so the new face has a chance to arrive. `::view-transition-old(root), ::view-transition-new(root) { animation-duration: 150ms; }`. With `prefers-reduced-motion`, or where the API is missing, the swap is instant. A click while a transition runs is ignored. Add `user-select: none` to `.brand` (it stays a link).

**Persistent and independent.** `fo:shuffle` is written on every shuffle. Refreshes and new tabs keep it (pre-paint reads it). It is ignored and removed when `day` is not today, so normal resolution resumes after 04:00; or when `identity` differs. It never writes `brand_preference`, `daily_draw` or `random_excluded_brands`, and it does not change the Mode preference (a Theme-default person sees the shuffled theme's primary mode). It does record a discovery when the theme is new (4.4). Any explicit change to Selection or the Fixed theme clears it.

**Order of precedence in `resolveAppearance`.** Test override, shuffle for today, Fixed theme, today's record, draw. The mode is then `resolveMode` for the resulting theme.

### 4.10 Logged-out visitors

No menu and no Appearance section (the route is guarded). Random across all released themes (`selection: random`, no exclusions, Undiscovered on), each theme's primary mode, `fo:anon-draw` and `fo:discovered` in this browser, the shuffle on Home. Logged-out mode is always Theme default; the old stored toggle value is not read.

**At login** (boot sequence, step 3): browser discoveries the account lacks are sent and removed locally; if the account's `mode_preference` is NULL and `mantine-color-scheme-value` is `light` or `dark`, that value is sent. The legacy key is deleted after a successful copy, or immediately if the account already has a value. The account's day record, if any, then decides the theme, so a person who has already drawn on another device sees that theme; otherwise the draw runs with the merged discoveries. The theme can change at login; this swap is instant. A later logout returns to the logged-out draw (and `fo:discovered`, now empty, starts again).

### 4.11 Removing the mode toggles

Removed: the `colorScheme`, `setColorScheme`, `themeToggleIcon` props and the toggle in `ShellHeader`; `themeToggleIcon` and the toggle in `AuthLayout`; `themeIcon`, `themeLabel`, `onToggleTheme` in `DraftRoomScreen`, `DraftBoardHeader`, `DraftHeaderRightWing`, `DraftHeaderMeasureRow`, `MobileDraftHeader`, `MobileDraftRoom`; `decisions/draft/themeSwitchLabel.ts`; the CSS class `.theme-toggle` where it has no other reader (the compact settings button keeps its behaviour under a neutral class name, `.drh-settingsBtn`).

| Layout                     | Before                                               | After                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell, desktop, signed in  | wordmark … toggle, bell, account                     | wordmark … bell, account (flush right, same 8 px gap)                                                                                                                                                                                                     |
| Shell, desktop, signed out | wordmark … toggle, Create account, Log in            | wordmark … Create account, Log in                                                                                                                                                                                                                         |
| Shell, session loading     | wordmark … toggle, "Checking…"                       | wordmark … "Checking…"                                                                                                                                                                                                                                    |
| Shell, phone (drawer)      | menu, wordmark, toggle, (bell)                       | menu, wordmark, (bell). Signed out: menu, wordmark, **Log in** (M2)                                                                                                                                                                                       |
| Row height                 | the toggle held the row at the control height        | `.site-header-row` gets `min-height: var(--fo-header-control-size)` (phone: `--fo-touch-target`), so the row and everything under it do not move in any case                                                                                              |
| Auth, desktop and phone    | wordmark at the start, toggle at the end             | Wordmark alone, start-aligned. `.auth-header` gets `display: flex; align-items: center; min-height: var(--fo-header-control-size)` (phone: `--fo-touch-target`), so the sign-in card stays where it is                                                    |
| Draft, desktop, wide       | settings columns, toggle button, user badge          | Settings columns, user badge. `DraftHeaderMeasureRow` loses the matching placeholder in the same change, so wing measurement stays true                                                                                                                   |
| Draft, compact header      | Settings menu lists sound, cursor spy, mode, drafted | Sound, cursor spy, drafted. The menu is never empty (sound is always there)                                                                                                                                                                               |
| Draft, final results       | Only the toggle remains on the right                 | User badge only                                                                                                                                                                                                                                           |
| Draft, phone               | Settings menu: mode, drafted, start or pause         | Drafted, start or pause. Show the trigger only when at least one item applies (`showDraftedVisible` or `showDraftControls && canManageDraft`). When it does not, render a same-size `aria-hidden` spacer in its grid cell so the clock stays centred (M3) |

### 4.12 Enabling all brands

The gate is one line: `ENABLED_BRAND_IDS` in `packages/shared/src/brands.ts` becomes `BRAND_IDS` (same order). It flips **last**, after the picker and resolution are deployed and the audit (4.13) has passed. Everything is safe with refined-gold alone enabled: one theme, nothing undiscovered, no shuffle, Mode works. Rollback is reverting that line; records naming a brand no longer released redraw (4.5).

### 4.13 Final audit and the open dogfooding notes

**4.13.0 The audit.** Before the flip:

- Token tests (`brandTokens.test.ts`) for all 14 palettes, including new pairs from 3.4 (`muted` and `text` on `sunken`, `ruleStrong` on `sunken`, if not already in `PAIRS`).
- Assertion tier across all 21 cells, no new allowlist entries, every deletion below made.
- Launch gates recorded by earlier packages, all confirmed present: E and F's non-colour countdown cue (`draft-live-countdown`, glyph and "{N}s left"), the nav-indicator slot before E or F (`--brand-nav-indicator`), danger text per mode (`--fo-danger-text`), the dark hero fix.
- QA per brand, 6.5.

**4.13.1 Muted pill ink: raised, not exempted.** Decision: raise the ink, delete both `contrast` allowlist entries. Drafted pills carry information that people read during a draft ("Show drafted" exists for that), so the inactive-control exemption is the wrong answer even though it would be technically available. Replace the element opacity in `.dr-pill.is-muted`:

```css
.dr-pill.is-muted {
  background: var(--brand-sunken);
  border-color: transparent;
}
.dr-pill.is-muted .dr-pill-text,
.dr-pill.is-muted .dr-pill-points {
  color: var(--brand-muted);
  font-weight: var(--fo-font-weight-regular);
}
```

`opacity: 1` overrides in `.is-hoverMatch.is-muted` and `.is-winner.is-muted` become unnecessary and go; hover-match and winner keep precedence by source order, so a drafted winner still never dims. Muted text on `sunken` is 5.14 to 7.49 across the 14 palettes (was about 3.1 to 3.5 light, 4.4 ballot dark). The drafted state now reads through both tone and a recessed fill, not a transparent copy of the available pill. Pending (0.65, dashed) is unchanged. Affected cells: every draft cell with drafted pills, specimen pills.

**4.13.2 Touch-target families (15).** The bar in the assertion tier is 44 × 44; WCAG 2.5.8 (AA) is 24 px or spaced. Each row: in this package, entry deleted; or stays, entry reason rewritten as noted.

| Family                                           | Decision                                                                                                                                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Footer text links (`mantine-Text-root`)          | **In.** At &lt; 500, `.footer-col-links a { display: inline-flex; align-items: center; min-height: var(--fo-touch-target); }`, gap `0`. Phone footer grows about 130 px                                                          |
| `footer-logo-link`                               | **In.** `min-width` and `min-height` 44 at &lt; 500                                                                                                                                                                              |
| 36 px inputs (`Input-input`)                     | **In.** At &lt; 500, `--input-height-sm: var(--fo-touch-target) !important` in the same selector group as the phone button-height rule (`.page`, `.auth-page`) plus `.mantine-Modal-root`. Covers the new Select and MultiSelect |
| Wordmark link                                    | **In.** `.brand { display: inline-flex; align-items: center; min-height: var(--fo-touch-target); }` at &lt; 500                                                                                                                  |
| Admin sub-nav `nav-link` (41 px)                 | **In.** `.admin-header .nav-link { min-height: var(--fo-touch-target); }` at &lt; 500                                                                                                                                            |
| `nomination-group-header` (40 px)                | **In.** Same, `min-height` 44 at &lt; 500                                                                                                                                                                                        |
| `dr-mobileRailBtn` (52 × 40)                     | **In.** `--fo-db-mobileRailBtn-height` becomes 44. Bar height follows; `--fo-db-mobileBottomBarHeight` updates with it                                                                                                           |
| `mantine-Menu-item` (36 px, specimen-only entry) | **In.** At &lt; 500, `--fo-menu-item-height` is 44. Applies to the account menu and every other menu on phone                                                                                                                    |
| `mantine-active` (specimen modal actions)        | **In.** Extend the phone button-height rule to portal content: add `.mantine-Modal-root .mantine-Button-root` to the existing selector group. Confirm the matched element in `touch-targets.txt`                                 |
| `Checkbox-input` (20 × 20)                       | **Stays.** The label is the real target; rows (`admin-films`, specimen) keep their 20 px box. Reason: "the row or label is the target; the box is a visual mark"                                                                 |
| `nomination-drag-handle-button` (18 × 18)        | **Stays.** Admin-only, one operator; the drag handle needs rework for keyboard reordering first (a known carried item). Reason updated                                                                                           |
| `mantine-Stepper-step` (32 px)                   | **Stays.** Admin-only and dense by design; 44 px per step adds a screen of chrome. Reason updated                                                                                                                                |
| `mantine-NumberInput-control`                    | **Stays.** Specimen-only finding; the field accepts typing on touch, the steppers are a convenience. Reason updated                                                                                                              |
| `dr-pill` (22 px)                                | **Stays** (owner confirm, a1). 22 px plus 6 px gaps meets WCAG 2.5.8 by spacing. A tap only opens the sheet, whose Draft button is 44 px. At 44 px the phone board doubles in length with 120 nominations. Reason updated        |
| `dr-card-titleRow` (20 px)                       | **Stays.** It is the keyboard entry to pill mode; touch users tap pills directly. Reason updated                                                                                                                                 |

**4.13.3 The four inconsistencies (all in this package).**

1. Secondary, ghost and danger show no hover. The variant rules set `background` directly, which beats Mantine's hover. Add `:hover` rules for those three, `background: var(--button-hover)`, as the primary rule does (`styles.css` ~2160).
2. NumberInput label is bolder. Add `.mantine-NumberInput-label` to the muted-label rule (`styles.css` ~2474).
3. `Menu.Item color="red"` does not render red. Change the base rule to `color: var(--menu-item-color, var(--brand-text))`, and add `--mantine-color-red-6: var(--fo-danger-text)` to the two palette blocks that already remap red (`styles.css` ~37 and ~139), so the danger item passes contrast. Mantine sets `--menu-item-color` to `red-6`, which is otherwise a raw palette red.
4. `admin-ceremony-nominees` at 390: the empty 350 px between Category and Film is `flex-basis` (260 and 420 px) acting as height, because `.admin-add-row` becomes `flex-direction: column` below the breakpoint. In that media block add `.admin-add-row > * { flex-basis: auto; }`.

## 5. Deviations

There is no picker board, so there are no mockup deviations. Where the 2026-11-09 direction was silent, these decisions were made; none needs the designer.

| #   | Topic                      | Decision                                                                                                                                                                                                         | Reason                                                                                   |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| D1  | 7-day shuffle block        | A round, as long as the pool, per collection (4.2). No repeat inside a round and no two consecutive days match; a theme can recur a few days apart across a round boundary, as the 2026-11-04 block also allowed | A fixed block has no meaning when a group wins only some days and selections change      |
| D2  | Empty-group redistribution | Cinema groups keep exactly 5 %; Ceremony absorbs the rest. Without Ceremony, Cinema groups split 100 % equally                                                                                                   | "Ceremony themes: the remainder" and "selection size does not change the group odds"     |
| D3  | Random selection storage   | Stored as exclusions                                                                                                                                                                                             | A discovery joins automatically with no write and no race                                |
| D4  | Random-list edit timing    | From the next draw (a2)                                                                                                                                                                                          | "The day's theme is saved once drawn"; a page-wide restyle mid-edit is jarring           |
| D5  | The per-tab pin            | Removed                                                                                                                                                                                                          | The saved day record gives the same result in every tab and reload                       |
| D6  | Picker controls            | Existing `SegmentedControl`, `Select` and `MultiSelect`                                                                                                                                                          | Conventional, already skinned in every brand; radios would add a new 20 px target family |

## 6. Acceptance and test plan (layered suite, ADR 0003)

Regions: **header band** (wordmark row), **content**, **footer band**, **draft header** (right wing), **board pills**. Filtered commands only; run in turn and add `--update` only to re-baseline in-scope cells:

```sh
node tests/visual/run.mjs -g "account"
node tests/visual/run.mjs -g "login|register"
node tests/visual/run.mjs -g "home-|leagues|league-detail|season|invites|ceremon|not-found|admin|draft-plans"
node tests/visual/run.mjs -g "draft-"
node tests/visual/run.mjs -g "specimen"
node tests/visual/run.mjs -g "assertions refined-gold"   # and each other brand
```

The assertion tier's stale-allowlist judgement needs all 21 cells; that runs in CI (`visual-assertions`) or the final `--tier assertions`.

### 6.1 Layout tier

| Cells                                                                                    | Expected                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every shell screen, light desktop and mobile; `DARK_KEY_SCREENS` dark                    | Header band: no toggle; bell and account flush right (signed in), Create account and Log in (signed out); Log in on the phone (M2). Row height unchanged, nothing below moves. Phone footer taller from the link targets (4.13.2)                                |
| `login`, `register`                                                                      | Wordmark start-aligned, no toggle, the card in the same place; the inputs are 44 px on the phone                                                                                                                                                                 |
| `account`, light desktop and mobile                                                      | New Appearance card under the details card. Random selected, Mode Theme default, list with Undiscovered themes and Refined Gold (two pills) and the helper. Phone: Mode stacked in three 44 px rows, Theme in one row, the pills wrap                            |
| **New** `account-appearance-open`, light desktop and mobile (2 new baselines, total 124) | Same, `/auth/me` answered with `discovered_brands` of ballot, noir and festival, the MultiSelect open: "Undiscovered themes", heading "Ceremony", four themes with check marks, focus on the field. Phone: the dropdown under the field, rows 44 px, not clipped |
| `draft-live-*`, `draft-paused`, desktop                                                  | Right wing: no toggle, user badge in its place, strip recalculated. Board pills: drafted pills on a sunken fill with muted text, no transparency                                                                                                                 |
| `draft-live-*`, `draft-paused`, phone                                                    | Board pills as above; bar and footer otherwise unchanged (menu closed). Rail bar 44 px                                                                                                                                                                           |
| `draft-completed`                                                                        | Right wing: user badge only                                                                                                                                                                                                                                      |
| `admin-ceremony-nominees` mobile                                                         | No gap between Category and Film; 44 px group headers and admin sub-nav                                                                                                                                                                                          |

### 6.2 Specimen tier (all 21 captures)

New section "Appearance" with `AppearanceSection` rendered from fixtures, one cell each: Random default, Fixed, floor (one selected), conflict control visible, save failure, one discovered, all discovered, and one with the Random list open (`dropdownOpened`, `withinPortal={false}`). The specimen's `ShellHeader` loses the toggle. Buttons: secondary, ghost and danger hover cells change. Menu: the red item renders in `--fo-danger-text`. Pills: muted. Number input label weight.

### 6.3 Brand-screens tier

`home-logged-out`, `home-logged-in`, `draft-live-your-turn`, each brand, primary mode, both viewports: header band and pills as above. No Home composition change.

### 6.4 Assertion and token tiers, unit and integration

Assertion: covers Appearance on `account` and the specimen across all brands, modes and widths, with no new allowlist entries. Allowlist: delete the two `contrast` entries, delete the nine families marked In, rewrite the reasons for the six marked Stays. Token: new pairs of 3.4.

Unit: shared draw vectors (4.3), `resolveMode`, `buildGroups` fixtures, floor, `parseAppearance`, the schema (including the `±2` day rule and the at-least-one-field rule), `deriveAppearanceView` for every state in 4.8, `applyRandomListChange`, `decideWordmarkShuffle`, pre-paint (script matches `resolveAppearance` for a fixture matrix; ignores `fo:test-appearance` in production builds). Integration (`auth.preferences.integration.test.ts`): partial update, CAS (older day applies; same or newer day ignored and returned; unreleased stored brand overwritten), union of discoveries, floor rejection, `±2` rejection, and `rotate`/NULL still returned as stored.

### 6.5 QA per brand (real flows, each brand and mode, desktop and phone, keyboard only)

1. Fresh browser, logged out: Home in a released theme and its primary mode, no flash on reload; wordmark shuffle on Home switches, new tab keeps it, the click from another page does not.
2. Register and log in: discoveries merged, legacy `light` copied once, the Appearance section loads.
3. Appearance: change Mode (immediate), Random to Fixed (no change), Fixed theme (immediate), Random list and the floor, Undiscovered off, reload.
4. Save failure with the API down: revert, message, Retry.
5. Two sessions of one account, one set to a different clock: both show one theme.
6. Crossing 04:00 by a clock change: the open page keeps its theme; reload draws.
7. Draft room: no mode control anywhere, header wings correct, phone Settings hidden when empty, muted pills legible; every theme passes the countdown and final-results flow.
8. Keyboard: every control of 4.8 by keyboard, wordmark Enter behaves as a link.

### 6.6 What the design reviewer sees per brand

Appearance in every brand: only colour, type and shape from existing slots; pills and segments legible; no gold, teal, red or green except the failure alert. The header band has no hole where the toggle was.

## 7. Escalations

### (a) Owner

| #   | Question                                                                                                                                                            | Recommendation and default                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a1  | Phone draft pills stay 22 px (allowlisted as report-only). Raising them to 44 px would about double the phone board's length with a full ceremony's 120 nominations | **Keep 22 px for launch** (default). A tap only opens the sheet, and 22 px plus gaps meets WCAG 2.5.8                                                               |
| a2  | Should removing a theme from the Random list change today's theme straight away?                                                                                    | **No, from the next draw** (default): the day's theme stays stable, and Fixed already gives an immediate change. Adding an immediate redraw is small if you want it |

Suggestions outside this package: a per-brand `theme-color` meta (the browser bar stays gold today); the phone shell width (a4 in 04) remains open.

### (b) Designer

None. Nothing in this package needs a redesign or new board.

## 8. Build notes

### 8.1 Files likely touched

- Shared: `brands.ts`, new `appearance.ts` (subpath in `package.json` `exports`), `schemas/account.ts`, `index.ts`.
- Migration `020_app_user_appearance.sql`.
- API: `routes/auth/{me,login,preferences}.ts`, new `data/repositories/userAppearanceRepository.ts`.
- Web: `decisions/{brand,appearance}.ts`, `orchestration/brand/{storage,orchestration,prepaint,colorSchemeManager}.ts`, `orchestration/auth/sessionOrchestration.ts` (`AuthUser.appearance`), `brand-init.ts`, `vite/brandInit.ts`, `brand/context.tsx`, `ui/AppProviders.tsx`, `main.tsx`, `app/chrome/ui/{ShellHeader,ShellNavDrawer,Wordmark}.tsx`, `app/layouts/{ShellLayout,AuthLayout,SiteFooter}.tsx`, `features/account/{screens/AccountScreen.tsx,ui/AppearanceSection.tsx}`, `app/pages/AccountPage.tsx`, the six draft header files, `decisions/draft/themeSwitchLabel.ts` (delete), `features/specimen/screens/SpecimenScreen.tsx`, `styles.css`, `theme/tokens.ts`.
- Docs: `docs/architecture/brands.md` (Ids, Preference, Resolution, Enabled brands, Pinning, First paint, Adding a brand), `docs/standards/testing.md` (in-place mode switching), and a one-line status note in ADR 0003 pointing to the new override. `docs/design/app-inventory.md` afterward (inventory update).
- `material-symbols-icons.txt` if a new glyph is added (`palette` for M1).

### 8.2 Tests that assume the old toggles or the shared rotation

| Test                                                                     | Fate                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/tests/unit/brands.test.ts`                              | Delete `rotate` and `random` cases and the "enabled brands" cases that assert rotation; keep day-number and validation cases. New `appearance.test.ts`                                                                                                                                                                                                                                   |
| `apps/web/tests/unit/brand/useBrandOrchestration.test.tsx`               | Rewrite for the boot sequence. Delete the rotation, local-preference, pin and last-brand cases                                                                                                                                                                                                                                                                                           |
| `apps/web/tests/unit/brand/prepaint.test.ts`                             | Rewrite against `resolveAppearance`; delete pin and last-brand cases; raise the size limit                                                                                                                                                                                                                                                                                               |
| `apps/web/tests/unit/app/ShellChrome.test.tsx`                           | Remove the toggle props from the harness; add cases for M1 and M2                                                                                                                                                                                                                                                                                                                        |
| `apps/web/tests/unit/draft/countdownCue.test.tsx`                        | Remove the `themeSwitchLabel` assertions and the toggle props                                                                                                                                                                                                                                                                                                                            |
| `apps/web/tests/unit/draft/DraftRoomAccessibility.test.tsx`              | Remove the toggle props                                                                                                                                                                                                                                                                                                                                                                  |
| `apps/api/tests/integration/routes/auth.preferences.integration.test.ts` | Extend (6.4)                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/web/tests/unit/lib/legacyAuthStorage.test.ts`                      | Unchanged: `mantine-color-scheme-value` stays until consumed                                                                                                                                                                                                                                                                                                                             |
| `tests/visual/support/page.ts`                                           | `setColorScheme`, `switchColorScheme` and `selectBrand` become `selectAppearance(context, brand, mode)` and `switchAppearance(page, brand, mode)`, writing `fo:test-appearance`. `/auth/me` is still answered with a fixed appearance and writes still aborted and counted                                                                                                               |
| `tests/visual/screens.spec.ts`, `tests/visual/assertions.spec.ts`        | Both call `setColorScheme` and `selectBrand`: replace the two calls with one `selectAppearance(context, brand.slug, mode)`. `screens.spec.ts` still asserts the returned write list is empty. `assertions.spec.ts` switches mode with `switchAppearance`                                                                                                                                 |
| `apps/web/tests/unit/brand/fonts.test.ts` (line 185)                     | Its production-build sandbox picks the brand through `fo:brand-preference`, which is retired, and `fo:test-appearance` is ignored in that build. Return a `fo:anon-draw` record for the current brand day naming the brand. The expectation stands: an enabled brand renders, and an unreleased one is ignored and resolves to the draw, which is the default brand while one is enabled |
| `tests/visual/matrix.ts`                                                 | `PRIMARY_MODE` from the catalog; one new `SCREENS` row                                                                                                                                                                                                                                                                                                                                   |
| `tests/visual/assertions/allowlist.ts`                                   | 4.13                                                                                                                                                                                                                                                                                                                                                                                     |
| `tests/e2e/web-smoke.spec.ts`, `two-user-draft.spec.ts`                  | No change expected; they read headings, not toggles                                                                                                                                                                                                                                                                                                                                      |

### 8.3 Build order (one fresh builder per step)

| Step | Content                                                                                                                                                                                                                                                                    | Visual                                      | Done when                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| B0   | Shared catalog, `appearance.ts`, schemas; migration 020; API read and PATCH; integration and unit vectors                                                                                                                                                                  | None                                        | `pnpm run ci`. The old web app still works unchanged                                                                          |
| B1   | Stores, `resolvePrepaintAppearance`, pre-paint, boot sequence, custom colour-scheme manager, test override and visual harness (`selectAppearance`), docs in `brands.md`. The old toggles stay in the code, unused, until B2 removes them; this step is never shipped alone | None expected                               | Unit tests; `-g "specimen"` passes unchanged in refined-gold once mode override works                                         |
| B2   | Appearance section, `deriveAppearanceView`, save queue, toggle removal in every layout, row min-heights, M1–M3 and the other improvements, specimen section, `account-appearance-open`                                                                                     | All shell and draft header regions; account | Layout and specimen re-baselined by group (6.1, 6.2)                                                                          |
| B3   | Wordmark shuffle, `drawShuffle`, `fo:shuffle`, view transition                                                                                                                                                                                                             | None (motion frozen, not exercised)         | Unit tests; manual on Home                                                                                                    |
| B4   | Dogfooding: 4.13.1–4.13.3                                                                                                                                                                                                                                                  | Pills, footer, inputs, admin                | Allowlist as specified; `-g` runs per family                                                                                  |
| B5   | Audit (4.13.0), QA per brand (6.5), flip `ENABLED_BRAND_IDS`, inventory                                                                                                                                                                                                    | None (the visual build already enables all) | `pnpm run ci`, `visual` and `visual-assertions` green; rewrite the two production-build prepaint cases that assumed one brand |

**Must land together:** B1 and B2. Between them a person has either no Mode control or a control with no effect; they must ship as one PR. B0 can land first (no user-visible change, and the old client is unaffected). B3 and B4 are independent of each other and of B2's layout.

**Order that keeps users safe if only part ships:** B0, then B1+B2 with the gate still at refined-gold (everyone keeps one theme and gains the settings), then B4, then B5 with the flip last. Never flip the gate before B1+B2 are live.

**If the build must split (the buffer is the only remaining chunk):** cut, in order: the touch-target families marked In other than inputs and the wordmark (they stay allowlisted); M2, M7; B3 (the shuffle; the daily draw alone still drives discovery, and B3 needs no data change, so it can follow in its own PR). B1+B2, B4's muted pill and the flip stay in the launch.

### 8.4 Risks

- **Default mode shift.** People who never pressed the toggle today see dark (the old default). After launch they get refined-gold's primary mode, light, unless their theme's primary mode is dark. This is the direction ("Theme default"), but it is a visible change for existing users.
- **Pre-paint size.** Target under 8000 characters; check the built number.
- **`SegmentedControl` in `vertical` orientation** relies on the indicator measuring on resize; verify in the specimen at 390.
- **Layout-tier re-baselining.** Nearly every cell changes in the header band; triage by region, and the row min-height should keep other regions identical.
- **Migration ordering.** The new API reads the new columns, so the migration must run before deploy (additive, so old API code is unaffected).
- **Font arrival during shuffle.** Capped at 200 ms; after that the swap uses `font-display: swap`, as today.

## 9. Marginal improvements (all brands, same structure)

| #   | Current state                                                                                        | Change                                                                                                                                                           | Reason (user benefit)                                       | Cells affected                                |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| M1  | The toggle was the visible way to change the look; after this package there is nothing               | An "Appearance" item (`palette` icon) in the account menu and the nav drawer, linking to `/account#appearance`, which scrolls to and focuses the section heading | People can find the setting that moved                      | header menu open states only (none captured)  |
| M2  | The signed-out phone header has no way to log in; the toggle held that space                         | Show a secondary "Log in" button (with `state.from`) in the drawer-mode header, signed out and not loading                                                       | A visible way in from any page on a phone                   | `home-logged-out` and other signed-out phones |
| M3  | With the theme item gone, the phone Settings menu can be empty                                       | Hide the trigger when it would hold nothing, keep the spacing                                                                                                    | No button that opens nothing                                | `draft-completed` phone                       |
| M4  | Account page intro omits appearance                                                                  | "Manage your profile, appearance and security."                                                                                                                  | Sets the expectation for the new section                    | `account`                                     |
| M5  | Long-running "Save" states in section form vary                                                      | One quiet status line ("Saving…", "Saved") with `role="status"`, reserved so nothing moves                                                                       | Saving is visible without a toast or a layout shift         | specimen                                      |
| M6  | `MultiSelect` shows no focus ring                                                                    | `:focus-within` ring matching other inputs, in every use                                                                                                         | Keyboard users can see where they are                       | specimen                                      |
| M7  | `Select` and `MultiSelect` option rows are 36 px on a phone, and disabled options fade to unreadable | Rows 44 px at &lt; 500; a disabled option keeps muted ink                                                                                                        | Easier selection; the disabled option still says what it is | `account-appearance-open`                     |
| M8  | Dropdown group headings are unstyled                                                                 | Group labels use the brand label treatment                                                                                                                       | Clear grouping, consistent with other labels                | specimen, `account-appearance-open`           |
| M9  | Dead `useMantineColorScheme()` in `SiteFooter`, `.theme-toggle` naming on a settings button          | Removed; renamed                                                                                                                                                 | Fewer false leads for future work                           | none                                          |
