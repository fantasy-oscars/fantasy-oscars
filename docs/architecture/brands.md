# Brands

The app supports several visual brands, shown to people as themes. Each theme
declares its modes, usually light and dark. This document covers identity,
selection and the stores behind it; it says nothing about how a brand looks. The
rules here are prescription 05 (`docs/design/prescriptions/05-picker-and-launch.md`),
which has the worked examples and the reasoning.

## Ids

Brands have stable slug ids, defined in `packages/shared/src/brands.ts`
(`BRAND_IDS`). The array is append only, because stored values and draw rounds
name the ids.

`refined-gold`, `red-carpet`, `ballot`, `noir`, `festival`, `technicolor`,
`lightbox` (legacy labels A to G, in that order).

The same file holds the catalog: `BRAND_CATALOG` gives every brand a collection
(`ceremony` or `cinema`) and its modes. The first mode is the theme's primary
mode ("Theme default"), and there is at most one mode per base (`light` or
`dark`). A mode that is neither names its nearest base, and a single-mode theme
fills both slots of its `BrandDefinition` with the same palette, so nothing
downstream needs an optional slot. `BRAND_LABELS` (labels shown to people) and
`STARTING_BRAND` (`refined-gold`, counted as discovered for everyone and never
stored) sit beside it. `tests/visual/matrix.ts` takes `PRIMARY_MODE` from the
catalog.

The resolved theme is exposed to styles as `data-brand="<slug>"` on the root
element, and its mode as `data-mantine-color-scheme`, always the mode's base
(`light` or `dark`). The generated brand stylesheet scopes on both (see Design
contract). Nothing else reads a mode.

## Preference

Each person has these settings (shared `parseAppearance` turns the stored
values into one object):

- Selection: Random (default) or Fixed on one theme.
- Mode: `light`, `dark` or `theme` (the theme's own primary mode, default).
- Random exclusions, Undiscovered themes, single-mode policy, discovered themes
  and the day's draw. See prescription 05, 4.1.

Storage:

- Signed in: `app_user.brand_preference` (nullable) and the appearance columns of
  migration 020, returned as `brand_preference` and `appearance` on
  `GET /auth/me` and the login response. `brand_preference` keeps its meaning:
  `random`, `rotate` or `NULL` mean Random (the value is returned as stored and
  never rewritten); a released slug means Fixed; a slug that is not released
  means Random until it is released again. Everything is written with
  `PATCH /auth/me/preferences`, a partial update validated by
  `updatePreferencesBodySchema`
  (`packages/shared/src/schemas/account.ts`).
- Signed out: no menu and no settings. Random across the released themes, each
  theme's primary mode, with the draw in `fo:anon-draw` and discoveries in
  `fo:discovered`. A per-browser id lives under `fo:anon-id`.

The web stores, all in `localStorage` (`orchestration/brand/storage.ts`):

| Key                          | Content                                           | Lifetime                                                            |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `fo:account-appearance`      | `{ identity, brandPreference, appearance }`       | Written at every session resolve; removed on logout or expiry       |
| `fo:anon-draw`               | `{ day, brand, rounds }`                          | The logged-out daily draw                                           |
| `fo:discovered`              | array of ids                                      | Logged-out discoveries and signed-in ones until their save succeeds |
| `fo:shuffle`                 | `{ identity, day, brand, rounds, seq }`           | Written by the shuffle; removed once `day` is not today             |
| `fo:anon-id`                 | per-browser id                                    |                                                                     |
| `mantine-color-scheme-value` | legacy light or dark, from the old toggle         | Read once at first login, then removed                              |

`fo:brand-session`, `fo:brand-last` and `fo:brand-preference` are retired and
deleted at every boot.

## Resolution

Resolution is pure (`resolveAppearance` in `packages/shared/src/appearance.ts`;
every input is an argument). Precedence: the test override (test builds only),
today's shuffle, the Fixed theme, today's saved draw, then a new draw. The mode
is then `resolveMode` for the resulting theme: `theme` gives the primary mode;
`light` or `dark` give the first mode on that base, or the primary mode when the
theme has none (so a single-mode theme uses its only mode).

- The brand day starts at 04:00 in the viewer's local time (`brandDayNumber`).
  Before 04:00 the previous calendar date counts. The day number is the count of
  local calendar days since 1970-01-01, so DST changes do not affect it.
- The draw (`drawDaily`) is seeded by `seedHash` of identity (`user:<id>` or
  `anon:<id>`), day and group. Themes fall into three groups (Cinema new, Cinema
  seen, Ceremony) with 5, 5 and the remainder per cent; each collection keeps a
  round so nothing repeats until every theme in the pool has been shown, and the
  first theme of a new round is never yesterday's. Prescription 05, 4.2 and 4.3
  have the rules and the worked vectors.
- A draw happens once per brand day and identity. After that the saved record
  is the theme: signed in it is `app_user.daily_draw`, written with a
  compare-and-set (it applies only when the stored record is older or its theme
  is not released), signed out it is `fo:anon-draw`. A record whose day is ahead
  of the device is followed, not redrawn.
- Fixed never draws and writes no record. A shuffle never writes the account
  except to record a discovery (`add_discovered_brands`), and never changes Mode.
- Wordmark shuffle: a plain primary click on the wordmark while on `/` calls
  `drawShuffle` (shared; same groups and odds as the daily draw, never the current
  theme; under Fixed, every discovered theme). `fo:shuffle` is read at click time,
  so open tabs share the rounds and `seq`. The swap is a 150 ms view-transition
  cross-fade, instant under reduced motion; clicks during it are ignored.
- A theme shown by a completed draw counts as discovered. It is saved in the
  same PATCH as the draw, or queued in `fo:discovered`. A guess painted before the
  session check never counts.

## Enabled brands

Not every defined brand is released. `ENABLED_BRAND_IDS` in
`packages/shared/src/brands.ts` lists the brands users can actually get. It must
be a non-empty subsequence of `BRAND_IDS`; a unit test checks this. Today it
holds `refined-gold` only.

Everything in Resolution takes an optional `enabled` list that defaults to
`ENABLED_BRAND_IDS`:

- Stored lists (discoveries, exclusions, draw rounds) are filtered to released
  ids when read and never rewritten. A stored Fixed theme that is not released
  behaves like Random, and a saved draw naming one is ignored (today draws again
  and overwrites it).
- With one theme released there is nothing undiscovered and nothing to shuffle.
- Stored preferences are still validated against `BRAND_IDS`, so slugs stay
  storable.

To release a brand, append it to `ENABLED_BRAND_IDS`. That is the last step of
the launch; reverting the line is the rollback.

Test builds can enable every brand with `VITE_FO_ENABLE_ALL_BRANDS=1`. The flag is
read in `orchestration/brand/buildFlags.ts` and in `vite/brandInit.ts`, which
bakes it into `/brand-init.js`, and is passed to the pure decisions as the `enabled`
list. It is never on in production: `vite/brandInit.ts` throws when the flag is set
with `mode === "production"`, orchestration ignores it unless `import.meta.env.MODE` is
something other than `production` (`PROD` is true in every `vite build`, so the visual
suite builds with `--mode visual`), and a unit test checks that the production `brand-init.js`
renders only enabled brands whatever is stored.

The same flag turns on the test override: in those builds `fo:test-appearance`
(`{ brand, mode }`) is honoured first by the pre-paint script and by
`useBrandOrchestration`, which then draws nothing, saves nothing and records no
discovery. The colour scheme manager listens for `storage` events on that key so
the assertion tier can repaint a loaded page in place. Production builds ignore
the key (the pre-paint and fonts unit tests check it).

## Pinning

There is no per-tab pin. The saved day record gives the same theme in every tab
and after every reload, so `fo:brand-session` is gone.

The boot sequence (`useBrandOrchestration`,
`apps/web/src/orchestration/brand/orchestration.ts`) runs when the session check
finishes and whenever the identity changes, never on a background refetch:

1. If the session check failed (the API could not answer), keep the painted theme,
   write nothing anywhere and retry on the next load.
2. Retire the old keys and drop a stale shuffle.
3. Build the effective state. Signed in: the account's values plus
   `pendingAccountMerge` (browser discoveries the account lacks, and the legacy
   `mantine-color-scheme-value` when `mode_preference` is `NULL`). Signed out:
   the Random defaults plus `fo:discovered` and `fo:anon-draw`.
4. A newer draw in the snapshot than on the server (an earlier save failed) is
   kept and sent again instead of redrawing.
5. Resolve.
6. Apply `data-brand` and the mode's base (`setColorScheme`).
7. Persist the snapshot, or the anonymous keys.
8. Signed in: one PATCH with whatever changed. On success the auth query is
   updated from the response; if the compare-and-set was lost, the returned theme
   is applied once; consumed local keys are cleared. On failure the local state
   stays and the next load retries.

No user after a normal answer (an expired session, or a logout) takes the
signed-out path: one instant swap to the logged-out theme, the snapshot is
removed, and nothing is written against the account. This is different from step
1, where "no answer" means "change nothing".

Tabs do not sync. Production code has no `storage` listener for these keys; a tab
keeps what it painted until it reloads or its identity changes.

## First paint

`data-brand` and `data-mantine-color-scheme` are set before React renders, by
`/brand-init.js` (source `apps/web/src/brand-init.ts`, built by
`vite/brandInit.ts` into one small classic script and injected first in `<head>`).
It calls the same decision code as the app
(`resolvePrepaintAppearance` in `apps/web/src/decisions/brand.ts`, storage readers
in `orchestration/brand/storage.ts`, `resolveAppearance` from
`@fantasy-oscars/shared/appearance`), so there is no second copy of the logic.
`apps/web/tests/unit/brand/prepaint.test.ts` builds the script and checks it
against `resolveAppearance` for each situation below over two weeks, and fails
when the production script, built with a font map shaped like the real build's,
passes 8000 characters (about 7.7 KB today). The script only
reads; it never writes except the anonymous id.

| Situation                              | What the script reads                               | Paints                                         |
| -------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Signed in, same brand day              | `fo:account-appearance`                             | The saved theme and its resolved mode          |
| Signed in, new brand day               | the snapshot's settings and previous draw           | Runs `drawDaily` itself, so the same result    |
| Signed in, shuffled today              | plus `fo:shuffle` (same identity)                   | The shuffled theme                             |
| Logged out, returning                  | `fo:anon-draw`, `fo:discovered`                     | The saved theme, or the day's draw             |
| First visit, or a fresh device         | nothing (it cannot tell a session exists)           | The anon draw; the app corrects it once        |
| Session expired                        | the snapshot (it cannot tell the cookie ended)      | The account's theme, as a guess                |
| Script throws                          | nothing                                             | Unset attributes; the app corrects them        |

The snapshot, fresh-device and expired cases are guesses: after the session check
the app resolves properly and corrects the attributes if the guess was wrong. A
guess is never recorded as a draw or a discovery.

Mantine's colour scheme manager (`orchestration/brand/colorSchemeManager.ts`, handed
in from `main.tsx` through `AppProviders` because `ui/` does not import
orchestration) reads the attribute and persists nothing, so Mantine no longer
writes `mantine-color-scheme-value`.

CSP: the script is a same-origin file, not inline, so `script-src 'self'` needs no
change and no hash. It is not content-hashed (the name `/brand-init.js` is fixed
so `index.html` can reference it), so the host should serve it with revalidating
cache headers like `index.html` rather than the immutable headers used for
`/assets/*`: `infra/Caddyfile` has a dedicated `handle /brand-init.js` with
`Cache-Control: no-cache` (and a plain `file_server`, so a missing file is a 404,
not the SPA shell). It is render-blocking by design and about 8 KB.

## Design contract

Each brand is one typed definition in `apps/web/src/theme/brands/` filling the
same slots, for both modes. `contract.ts` is the type and the slot lists,
`refined-gold.ts` is today's look, `shared.ts` holds values common to all brands,
`css.ts` generates the stylesheet, `index.ts` registers brands. Defined so far:
`refined-gold`, `red-carpet`, `ballot`, `noir`, `festival`, `technicolor` and
`lightbox`. Raw colours,
fonts and radii may appear only in this folder; `pnpm run tokens:check` fails
anywhere else in `apps/web/src`. Everything else reads CSS custom properties.

Per mode (light and dark), the colour slots (`--brand-<slot>`, plus
`--brand-<slot>-rgb` channels for alpha use): `page`, `surface`, `raised`,
`sunken`, `text`, `muted`, `faint`, `rule`, `ruleStrong`, `primary`, `onPrimary`,
`accent`, `link`, `linkHover`, `focusRing`; and four shadows, `shadow-card`,
`shadow-raised`, `shadow-overlay` and `shadow-hero` (the Home hero's edge and depth). Every slot is also emitted under an explicit mode name
(`--brand-dark-page`, `--brand-light-text-rgb`, ...) for tokens that mean one
specific mode regardless of the active one.

The same in both modes:

- Type: `font-display`, `font-body`, `font-numeral`, `font-label`, `label-case`,
  `label-letter-spacing`, `display-weight`, `display-case`, `display-tracking`, `h1-size`, `h2-size`, `h3-size`, `body-size`, `font-accent` and
  `accent-style` (`normal | italic`; the face of the Home hero tagline).
- Wordmark: `wordmark-font`, `-weight`, `-case`, `-letter-spacing`, `-two-tone`
  (`colour | italic | weight | stop`; `stop` keeps both words alike and adds a
  trailing full stop). The contract slot `toneColor` (`primary | accent | gold`) is the
  colour of the second word (`colour`) or the full stop (`stop`). It is required for
  every brand, even where the method does not use it.
- Shape: `radius-sm/md/lg`, `button-shape` (`pill | rounded | square`) and the
  derived `button-radius`, `border-width`, `rule-style` (`solid | double`).
- Navigation: `nav-active` (`pill | underline`), `nav-font`, `nav-case`, `nav-size`.
  The contract slot `activeColor` (`primary | accent | text | gold`) is the colour of
  the active underline, or the fill of the active pill. `gold` is the shared
  `--fo-win-gold-text`, never the fill. A pill brand must use `text`, `primary` or
  `accent`, because each has an on-colour that passes 4.5:1 (enforced by a unit test).
- Decorations (closed list, `1` or `0`): `deco-double-rules`, `deco-offset-shadow`,
  `deco-frame-borders`, `deco-grease-pencil`.
- Home, the `home` slot group: `placement` (`column | masthead`), `heroSurface`
  (`darkPanel | accentPanel | open`), `heroAlign` (`start | center`), `heroMax` (px,
  the largest hero title size), `heroFit` (a number from 8 to 30: the hero title's
  size as a percentage of the hero's inner width), `regions` (`cards | open`) and
  `ctaSurface` (`card | primary`). Every brand fills all seven.

Enums are emitted as plain custom-property values for reference. Components read the
derived properties below, never the enums. `css.ts` computes them per brand, in the
brand's common block. "Colour of X" is the string `var(--brand-accent)`,
`var(--brand-primary)`, `var(--brand-text)` or `var(--fo-win-gold-text)`, so it
resolves per mode.

- `nav-pill` (`1` or `0`), `nav-indicator` (colour of `activeColor`).
- `nav-active-bg` (pill: the indicator; underline: `transparent`), `nav-active-fg`
  (pill: the on-colour; underline: `text`), `nav-active-border` (pill: `text`;
  underline: the indicator), `nav-border-width` (pill: `border-width`; underline:
  `0 0 2px`).
- `nav-letter-spacing`: `label-letter-spacing` when `nav-case` is uppercase, else
  `normal`.
- `section-rule` (`3px double` ink for double rules; ink frame for frame borders;
  otherwise a hairline in `rule`) and `nav-rule` (underline brands: the section
  rule; pill brands: `0 solid transparent`).
- `wordmark-tone-color` (`colour`: colour of `toneColor`; else `inherit`),
  `wordmark-tone-style` (`italic` or `normal`), `wordmark-tone-weight` (`400` for
  `italic` and `weight`; else `inherit`), `wordmark-stop-display` (`inline` for
  `stop`, else `none`), `wordmark-stop-color` (colour of `toneColor`).

- Home (`home-*`): `home-areas` (the grid areas for `placement`, quotes included),
  `home-hero-panel` (`1` for the two panel surfaces, `0` for `open`; a padding
  multiplier), `home-hero-bg`, `-fg`, `-fg-rgb`, `-muted` (the dark-mode `surface`,
  `text` and `muted` for `darkPanel`; the light-mode `accent`, light `page` and its 0.9
  tint for `accentPanel`; transparent and the page's own ink for `open`),
  `home-hero-radius` (`radius-lg` for panels, `0` for `open`), `home-hero-rule` (`open`
  only: `3px double` ink for double rules, else `2px solid` ink),
  `home-hero-align`, `home-hero-tagline-inline` (`0` or `auto`), `home-hero-max`,
  `home-hero-fit`, `home-open` (`1` for open regions), `home-updates-bg`,
  `home-updates-shadow`, `home-aside-rule`, `home-align`, and the create-league
  card's `home-cta-bg`, `-fg`, `-shadow`, `-ring` and the button's `-button-bg`, `-fg`,
  `-hover`, `-active`, `-bd` and `-bd-hover` (the 03 primary skin's values unless the tile
  is `primary`, when the button inverts).
  `darkPanel` and `accentPanel` take their colours from existing slots, whose
  contrast the contract test already guarantees; the hero never uses a gradient and
  is dark in dark mode in every brand.

Decoration values are unitless `1` or `0`; use them as multipliers inside `calc()`,
never as conditions.

Slot roles and rules (values and contrast checks are in
`docs/design/prescriptions/02-brand-tokens.md`):

- `faint` is decorative only, never text. `rule` is a decorative hairline.
- `ruleStrong` is a boundary that must be seen (input borders, pill hover border, card
  hover ring, overlay rings): at least 3:1 on `page`, `surface`, `raised` and `sunken`.
- `sunken` is the chip and hover-well colour and must differ from both `raised` and
  `page` by at least 1.07:1. It never carries a state alone.
- `primary` is a fill first. Where a rule paints it as text, an icon or a thin line it
  must reach 4.5 (text) or 3.0 (non-text) on its background; the readers that cannot
  use `text` instead (the admin done check and drop line).
- `accent` and `link` pass 4.5 on every background, except an accent marked fill-only.
- `focusRing` is `text`: a 2 px ink ring with a 2 px gap.
- `displayWeight` and `displayCase` style Mantine titles and the baseline titles; the
  draft room overrides the case to `none` because it renders titles in the body font.
- `displayTracking` and `displayWordSpacing` are the letter- and word-spacing of display
  titles (hero, page, section and card titles, Mantine titles other than the wordmark; the
  draft room resets both to `normal`). `heroTracking` is the hero title only (refined gold and noir keep their 0.01em there).
  `normal` for Cinzel, Barlow Condensed, Bodoni Moda and
  Archivo; Playfair Display at small sizes closes its word spaces, so red carpet adds a little
  positive tracking and word spacing.

Shadow rings: baseline cards have no border, so a flat brand writes its card edge as a
ring (`0 0 0 1px <colour>`) in `shadow-card`. "No shadow" is always written
`0 0 0 0 transparent`, never `none`, because the slot is concatenated into lists.

Floating layers (modals including the phone nominee card, the nav drawer, toasts, menus,
dropdowns, Mantine tooltips and the nominee card) share one skin: the `raised` fill and
`shadow-overlay`, with no border. The overlay value is a ring that reaches 3:1 on
`page`, `raised` and `sunken`, plus the brand's own depth. Mantine's own rules are
single-class selectors, so the skin wins by load order (`styles.css` loads after
Mantine's CSS); a visual check on `draft-live-armed` catches a reorder.

Not per brand (defined once in `shared.ts`, emitted as `--fo-*`, with separate light
and dark values from the design source): win gold (`--fo-win-gold` `#d4af37` light /
`#e2c25a` dark, `--fo-win-gold-on`, `--fo-win-gold-text`), status colours
(`--fo-status-complete`, `-live`, `-drafting`); the per-mode danger text colour
`--fo-danger-text` (error text; the fill `--fo-danger` misses 4.5 as text); plus
mode-independent `--fo-danger` with its `--fo-danger-on` text colour, podium metals, the black and
white shadow channels, the pill radius and a system font stack. Win gold is rendered
by winning pills, the final-results buckle and podium first place; status colours are
not rendered yet.

Generated CSS (`virtual:fo-brand.css`, imported in `main.tsx` before
`styles.css`): the unscoped `:root` blocks carry the default brand (refined-gold),
so the first paint and any unknown `data-brand` render it. Each defined brand then
adds `:root[data-brand="<slug>"]` (common slots) and, per mode,
`...:not([data-mantine-color-scheme="light"])` (dark, also the no-attribute case)
and `...[data-mantine-color-scheme="light"]`. The generator is pure and
deterministic.

Existing `--fo-*` tokens (in `theme/tokens.ts`) stay as aliases of these slots, so
call sites did not change. Mapping, for reference: `--fo-surface-page` is `page`;
`--fo-surface-card-hero` is `surface`; `--fo-surface-card-primary` is `raised`;
`--fo-surface-pill` is `sunken`; `--fo-text-primary` is `text`;
`--fo-text-deemphasized` is `muted`; `--fo-border` is `rule`;
`--fo-radius-small/medium/large` are `radius-sm/md/lg`;
`--fo-heading-h1/h2/h3-size` are `h1/h2/h3-size`; `--fo-shadow-card` and
`--fo-shadow-card-hover` are `shadow-card` and `shadow-raised`. The old `--fo-gold*`,
`--fo-charcoal-*`, `--fo-ivory*` and `--fo-text-onGold` aliases are gone: styles read
`--brand-primary`, `--brand-on-primary`, `--brand-text-rgb` and the explicit
`--brand-dark-*` / `--brand-light-*` slots directly, and "this pick won" reads the
shared `--fo-win-gold*` tokens.

### Adding a brand

1. Copy `refined-gold.ts` to `<slug>.ts` in `theme/brands/` and change the values.
   The compiler rejects a missing slot; the unit tests check both modes, enums and
   colour formats.
2. Put its font stacks in `stacks.ts` if new, fill in `fonts` (see Fonts) and add it to `BRAND_DEFINITIONS` in `theme/brands/index.ts`.
3. Append its id to `BRAND_IDS` and add its entry to `BRAND_CATALOG` and `BRAND_LABELS`
   in `packages/shared/src/brands.ts` (collection, and modes with the primary mode
   first). A single-mode theme fills `light` and `dark` of its definition with the
   same palette; `brandContract.test.ts` checks the catalog against the definitions.
4. Run `pnpm --filter @fantasy-oscars/web run test:unit` and
   `pnpm run test:visual`. Add visual coverage for the new brand to the matrix and
   commit its baselines; the other brands' baselines must not change.

The visual matrix has a brand dimension (`BRANDS` in `tests/visual/matrix.ts`). The
default brand (`default`, refined-gold) takes every screen and keeps unprefixed file
names; other brands list the screens they capture (`KEY_SCREENS`, ten screens) and
write `<brand>-<mode>-<viewport>.png`. The suite builds the web app with
`--mode visual` and `VITE_FO_ENABLE_ALL_BRANDS=1` so every defined brand can be
selected. Each capture pins its theme and mode with `selectAppearance`
(`tests/visual/support/page.ts`), which writes `fo:test-appearance` before the page
loads, answers `/auth/me` with fixed appearance settings and aborts
`/auth/me/preferences`; the test asserts that no preference was written (a write would
change the shared seed database under parallel captures). The assertion tier changes
theme and mode on a loaded page with `switchAppearance`, which updates the key and
dispatches the `storage` event the colour scheme manager listens for.

Slots are added to the contract only together with a value for every brand.

## Fonts

Text fonts are self-hosted from `@fontsource` packages (dependencies of `apps/web`; they are font files, not JS). No text font request leaves the origin. Only Material Symbols (icons) still comes from Google Fonts.

A brand declares what it renders in `fonts` on its definition (`FontSlots` in `theme/brands/contract.ts`):

- `faces`: a list of `{ family, weights, styles }`. Families must exist in `theme/brands/fontCatalog.ts`, which maps each to its package and says whether it is `static` (one file per weight, for example Cinzel, Inter, Barlow Condensed, IBM Plex Mono) or `variable` (one file per style covering the weight axis: Playfair Display, Bodoni Moda, Archivo, Fraunces, DM Sans, Instrument Sans). To add a family, add the package to `apps/web` and one catalog line.
- `preload`: the two faces (`display` and `body`, each `{ family, weight, style }`) that must be ready for first paint. They must be among `faces`.

Build (`vite/fonts.ts`, `vite/brandInit.ts`): the declared faces of all brands are merged into one generated stylesheet (`virtual:fo-fonts.css`, imported in `main.tsx`). Each face is a `@font-face` with `font-display: swap`, woff2 only, and every subset the package ships (latin, latin-ext, cyrillic, greek, vietnamese, ...), each its own rule with the package's `unicode-range`, so user content such as usernames and film titles in those scripts still renders in the brand font. A page only downloads the subset files its text uses; Latin-only pages pay nothing for the rest. All brands' faces are declared, but a browser fetches a face only when text actually uses it, so a session downloads just its own brand's fonts. Add a font by editing the brand's `fonts.faces`; the face must exist in the package or the build fails.

Preload: the build resolves each brand's two preload faces (latin subset) to their hashed asset urls and bakes the map into `/brand-init.js` (each font file once, the shared directory once, and per-brand indexes, to keep the script small). After setting `data-brand` the script appends `<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous">` for that brand's two files (`preloadBrandFonts` in `orchestration/brand/prepaint.ts`; unknown brands use the default's). In the dev server the map is empty and nothing is preloaded. If the app later corrects the brand, the preloaded files are simply unused.

Tests (`apps/web/tests/unit/brand/fonts.test.ts`): every declared weight and style has `@font-face` coverage (latin at minimum), preload faces are declared, and a real build's preload links all point at emitted files.

## Before a second brand changes any pixels

The contract is in place, but refined-gold still reached a few values through shortcuts that only worked while it was the only brand. The spec for fixing them is `docs/design/prescriptions/01-structural-prerequisites.md`.

1. **Win gold versus primary. Done.** Each former `--fo-gold*` consumer is now primary (`--brand-primary`), win (`--fo-win-gold*`, shared) or a new non-gold pill treatment. Dark-mode win gold is `#e2c25a`, and the legacy tokens are removed.
2. **Mode-agnostic ink. Done.** `--fo-charcoal-*`, `--fo-ivory*` and `--fo-text-onGold` are removed. Ink reads `--brand-text-rgb`, an explicit-mode slot or a shared token, and fixed shadows read `--fo-black-rgb`.
3. **Values outside the contract. Partly done.**
   - Done: `text-transform` reads `--brand-label-case`; Mantine's `blue` is fully rebound to `--brand-primary` (and commented in `ui/Button.tsx` and `ui/ActionIcon.tsx`); Mantine's focus outline reads `--brand-focus-ring`.
   - Left on purpose (decisions in the prescription, section 4.3): Mantine `red`, `yellow`, `teal`, `gray` and `green`, the label letter-spacing scale, raw font sizes, and the `theme-color` meta, web manifest and icon.
