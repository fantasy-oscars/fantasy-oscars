# Brands

The app supports several visual brands, each with light and dark modes. This
document covers identity and selection only; it says nothing about how a brand
looks. The light/dark color mode is separate and independent of the brand.

## Ids

Brands have stable slug ids, defined in `packages/shared/src/brands.ts`
(`BRAND_IDS`). The array order is the rotation order and must not change once
shipped; append only.

`refined-gold`, `red-carpet`, `ballot`, `noir`, `festival`, `technicolor`,
`lightbox` (legacy labels A to G, in that order).

The resolved brand is exposed to styles as `data-brand="<slug>"` on the root
element. The generated brand stylesheet scopes on it (see Design contract).

## Preference

A preference is one of:

- `rotate` (default): the brand of the day, the same for everyone.
- `random`: a different brand per person per day.
- a brand slug: always that brand.

Any other stored value is treated as `rotate`.

Storage:

- Signed in: `app_user.brand_preference` (nullable; `NULL` means unset, same as
  `rotate`). Returned as `brand_preference` on `GET /auth/me` and the login
  response. Updated with `PATCH /auth/me/preferences`, body
  `{ "brand_preference": <value or null> }`, validated by
  `updatePreferencesBodySchema` in `packages/shared/src/schemas/account.ts`.
- Signed out: `localStorage` key `fo:brand-preference`. A per-browser id for
  `random` lives under `fo:anon-id`.

When both exist, the account value wins. If the account has no value and a
local one exists, the local one is used and copied to the account once, then
removed locally. If that copy fails the local value stays and is retried later.

## Resolution

`resolveBrand` is pure (`packages/shared/src/brands.ts`). The rules below describe
resolution over all seven brands; see Enabled brands for what is released.

- The brand day starts at 04:00 in the viewer's local time. Before 04:00 the
  previous calendar date counts. The day number is the count of local calendar
  days since 1970-01-01, so DST changes do not affect it.
- `rotate`: `BRAND_IDS[dayNumber mod 7]`.
- `random`: FNV-1a hash of `identity|dayNumber` mod 7, where identity is the
  user id (signed in) or the anonymous browser id. If that equals the hash for
  the previous day it advances by a hash-derived 1 to 6 steps. The check looks
  one day back only, so an occasional repeat is possible.

## Enabled brands

Not every defined brand is released. `ENABLED_BRAND_IDS` in
`packages/shared/src/brands.ts` lists the brands users can actually get, in rotation
order. It must be a non-empty subsequence of `BRAND_IDS`; a unit test checks this.
Today it holds `refined-gold` only.

`resolveBrand` takes an optional `enabled` list that defaults to `ENABLED_BRAND_IDS`:

- A brand slug preference that is not enabled behaves like `rotate`. Stored
  preferences are still validated against `BRAND_IDS`, so slugs stay storable.
- `rotate` is `enabled[dayNumber mod enabled.length]`.
- `random` hashes over `enabled`. With fewer than two enabled brands the
  yesterday-avoidance step is skipped.
- With all seven enabled the results are the ones described under Resolution.
- A pin (`fo:brand-session`) or cached brand (`fo:brand-last`) is accepted only when
  its brand is enabled (`isEnabledBrandId`).

To release a brand, append it to `ENABLED_BRAND_IDS` in rotation order.

Test builds can enable every brand with `VITE_FO_ENABLE_ALL_BRANDS=1`. The flag is
read in orchestration (`useBrandOrchestration`) and in `vite/brandInit.ts`, which
bakes it into `/brand-init.js`, and is passed to the pure decisions as the `enabled`
list. It is never on in production: `vite/brandInit.ts` throws when the flag is set
with `mode === "production"`, orchestration ignores it unless `import.meta.env.MODE` is
something other than `production` (`PROD` is true in every `vite build`, so the visual
suite builds with `--mode visual`), and a unit test checks that the production `brand-init.js`
renders only enabled brands whatever is stored.

## Pinning

The web app resolves once per session (`useBrandOrchestration`,
`apps/web/src/orchestration/brand/orchestration.ts`) after the first session
check completes, and stores `{ brand, day, key }` in `sessionStorage`
(`fo:brand-session`). `key` is the identity plus preference the brand came from.

- A pin is reused while the key and brand day match, including after a reload.
- Crossing 04:00 in an open session never changes the brand.
- Login, logout and preference changes change the key and so re-resolve.
- A new tab (new `sessionStorage`) or a reload on a later brand day re-resolves.

## First paint

`data-brand` is set before React renders, by `/brand-init.js` (source
`apps/web/src/brand-init.ts`, built by `vite/brandInit.ts` into one small classic
script and injected first in `<head>`). It calls the same decision code as the
app (`resolvePrepaintBrand` in `apps/web/src/decisions/brand.ts`, storage readers
in `orchestration/brand/storage.ts`, `resolveBrand` from `@fantasy-oscars/shared/brands`),
so there is no second copy of the logic. `apps/web/tests/unit/brand/prepaint.test.ts`
builds the script and checks it against `resolveBrand` for every preference over
two weeks. Order of preference:

1. This tab's pin (`fo:brand-session`) when its brand day is today.
2. `fo:brand-last` (localStorage, `{ brand, day }`), written only while signed in
   and removed on logout, when its day is today. This is what stops a signed-in
   user seeing the default brand flash on a new tab.
3. `resolveBrand` from `fo:brand-preference` and `fo:anon-id` (same identity string
   as the app, `anon:<id>`).

The first two are guesses: they do not know the identity or preference. After the
session check the app resolves properly and corrects `data-brand` if the guess
was wrong (for example the account preference changed on another device).

CSP: the script is a same-origin file, not inline, so `script-src 'self'` needs no
change and no hash. It is not content-hashed (the name `/brand-init.js` is fixed
so `index.html` can reference it), so the host should serve it with revalidating
cache headers like `index.html` rather than the immutable headers used for
`/assets/*`: `infra/Caddyfile` has a dedicated `handle /brand-init.js` with
`Cache-Control: no-cache` (and a plain `file_server`, so a missing file is a 404,
not the SPA shell). It is render-blocking by design and about 3 KB.

## Design contract

Each brand is one typed definition in `apps/web/src/theme/brands/` filling the
same slots, for both modes. `contract.ts` is the type and the slot lists,
`refined-gold.ts` is today's look, `shared.ts` holds values common to all brands,
`css.ts` generates the stylesheet, `index.ts` registers brands. Defined so far:
`refined-gold`, `red-carpet`, `ballot`, `noir` and `festival` (technicolor and
lightbox render as the default until their definitions land). Raw colours,
fonts and radii may appear only in this folder; `pnpm run tokens:check` fails
anywhere else in `apps/web/src`. Everything else reads CSS custom properties.

Per mode (light and dark), the colour slots (`--brand-<slot>`, plus
`--brand-<slot>-rgb` channels for alpha use): `page`, `surface`, `raised`,
`sunken`, `text`, `muted`, `faint`, `rule`, `ruleStrong`, `primary`, `onPrimary`,
`accent`, `link`, `linkHover`, `focusRing`; and three shadows, `shadow-card`,
`shadow-raised` and `shadow-overlay`. Every slot is also emitted under an explicit mode name
(`--brand-dark-page`, `--brand-light-text-rgb`, ...) for tokens that mean one
specific mode regardless of the active one.

The same in both modes:

- Type: `font-display`, `font-body`, `font-numeral`, `font-label`, `label-case`,
  `label-letter-spacing`, `display-weight`, `display-case`, `display-tracking`, `h1-size`, `h2-size`, `h3-size`, `body-size`.
- Wordmark: `wordmark-font`, `-weight`, `-case`, `-letter-spacing`, `-two-tone`
  (`colour | italic | weight`).
- Shape: `radius-sm/md/lg`, `button-shape` (`pill | rounded | square`) and the
  derived `button-radius`, `border-width`, `rule-style` (`solid | double`).
- Navigation: `nav-active` (`pill | underline`), `nav-font`, `nav-case`, `nav-size`.
- Decorations (closed list, `1` or `0`): `deco-double-rules`, `deco-offset-shadow`,
  `deco-frame-borders`, `deco-grease-pencil`.
- `home-layout`: one of the brand slugs.

Enums are emitted as plain custom-property values; no component reads them yet.

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
3. Run `pnpm --filter @fantasy-oscars/web run test:unit` and
   `pnpm run test:visual`. Add visual coverage for the new brand to the matrix and
   commit its baselines; the other brands' baselines must not change.

The visual matrix has a brand dimension (`BRANDS` in `tests/visual/matrix.ts`). The
default brand (`default`, refined-gold) takes every screen and keeps unprefixed file
names; other brands list the screens they capture (`KEY_SCREENS`, ten screens) and
write `<brand>-<mode>-<viewport>.png`. The suite builds the web app with
`--mode visual` and `VITE_FO_ENABLE_ALL_BRANDS=1` so every defined brand can be
selected. Each capture pins its brand through `localStorage`, answers `/auth/me`
with the same `brand_preference` and aborts `/auth/me/preferences`, and the test
asserts that no preference was written (a write would change the shared seed
database under parallel captures).

Slots are added to the contract only together with a value for every brand.

## Fonts

Text fonts are self-hosted from `@fontsource` packages (dependencies of `apps/web`; they are font files, not JS). No text font request leaves the origin. Only Material Symbols (icons) still comes from Google Fonts.

A brand declares what it renders in `fonts` on its definition (`FontSlots` in `theme/brands/contract.ts`):

- `faces`: a list of `{ family, weights, styles }`. Families must exist in `theme/brands/fontCatalog.ts`, which maps each to its package and says whether it is `static` (one file per weight, for example Cinzel, Inter, Barlow Condensed, IBM Plex Mono) or `variable` (one file per style covering the weight axis: Playfair Display, Bodoni Moda, Archivo, Fraunces, DM Sans, Instrument Sans). To add a family, add the package to `apps/web` and one catalog line.
- `preload`: the two faces (`display` and `body`, each `{ family, weight, style }`) that must be ready for first paint. They must be among `faces`.

Build (`vite/fonts.ts`, `vite/brandInit.ts`): the declared faces of all brands are merged into one generated stylesheet (`virtual:fo-fonts.css`, imported in `main.tsx`). Each face is a `@font-face` with `font-display: swap`, woff2 only, and every subset the package ships (latin, latin-ext, cyrillic, greek, vietnamese, ...), each its own rule with the package's `unicode-range`, so user content such as usernames and film titles in those scripts still renders in the brand font. A page only downloads the subset files its text uses; Latin-only pages pay nothing for the rest. All brands' faces are declared, but a browser fetches a face only when text actually uses it, so a session downloads just its own brand's fonts. Add a font by editing the brand's `fonts.faces`; the face must exist in the package or the build fails.

Preload: the build resolves each brand's two preload faces (latin subset) to their hashed asset urls and bakes the map into `/brand-init.js`. After setting `data-brand` the script appends `<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous">` for that brand's two files (`preloadBrandFonts` in `orchestration/brand/prepaint.ts`; unknown brands use the default's). In the dev server the map is empty and nothing is preloaded. If the app later corrects the brand, the preloaded files are simply unused.

Tests (`apps/web/tests/unit/brand/fonts.test.ts`): every declared weight and style has `@font-face` coverage (latin at minimum), preload faces are declared, and a real build's preload links all point at emitted files.

## Before a second brand changes any pixels

The contract is in place, but refined-gold still reached a few values through shortcuts that only worked while it was the only brand. The spec for fixing them is `docs/design/prescriptions/01-structural-prerequisites.md`.

1. **Win gold versus primary. Done.** Each former `--fo-gold*` consumer is now primary (`--brand-primary`), win (`--fo-win-gold*`, shared) or a new non-gold pill treatment. Dark-mode win gold is `#e2c25a`, and the legacy tokens are removed.
2. **Mode-agnostic ink. Done.** `--fo-charcoal-*`, `--fo-ivory*` and `--fo-text-onGold` are removed. Ink reads `--brand-text-rgb`, an explicit-mode slot or a shared token, and fixed shadows read `--fo-black-rgb`.
3. **Values outside the contract. Partly done.**
   - Done: `text-transform` reads `--brand-label-case`; Mantine's `blue` is fully rebound to `--brand-primary` (and commented in `ui/Button.tsx` and `ui/ActionIcon.tsx`); Mantine's focus outline reads `--brand-focus-ring`.
   - Left on purpose (decisions in the prescription, section 4.3): Mantine `red`, `yellow`, `teal`, `gray` and `green`, the label letter-spacing scale, raw font sizes, and the `theme-color` meta, web manifest and icon.
