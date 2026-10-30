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

`resolveBrand` is pure (`packages/shared/src/brands.ts`).

- The brand day starts at 04:00 in the viewer's local time. Before 04:00 the
  previous calendar date counts. The day number is the count of local calendar
  days since 1970-01-01, so DST changes do not affect it.
- `rotate`: `BRAND_IDS[dayNumber mod 7]`.
- `random`: FNV-1a hash of `identity|dayNumber` mod 7, where identity is the
  user id (signed in) or the anonymous browser id. If that equals the hash for
  the previous day it advances by a hash-derived 1 to 6 steps. The check looks
  one day back only, so an occasional repeat is possible.

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
`css.ts` generates the stylesheet, `index.ts` registers brands. Raw colours,
fonts and radii may appear only in this folder; `pnpm run tokens:check` fails
anywhere else in `apps/web/src`. Everything else reads CSS custom properties.

Per mode (light and dark), the colour slots (`--brand-<slot>`, plus
`--brand-<slot>-rgb` channels for alpha use): `page`, `surface`, `raised`,
`sunken`, `text`, `muted`, `faint`, `rule`, `ruleStrong`, `primary`, `onPrimary`,
`accent`, `link`, `linkHover`, `focusRing`; and two shadows, `shadow-card` and
`shadow-raised`. Every slot is also emitted under an explicit mode name
(`--brand-dark-page`, `--brand-light-text-rgb`, ...) for tokens that mean one
specific mode regardless of the active one.

The same in both modes:

- Type: `font-display`, `font-body`, `font-numeral`, `font-label`, `label-case`,
  `label-letter-spacing`, `h1-size`, `h2-size`, `h3-size`, `body-size`.
- Wordmark: `wordmark-font`, `-weight`, `-case`, `-letter-spacing`, `-two-tone`
  (`colour | italic | weight`).
- Shape: `radius-sm/md/lg`, `button-shape` (`pill | rounded | square`) and the
  derived `button-radius`, `border-width`, `rule-style` (`solid | double`).
- Navigation: `nav-active` (`pill | underline`), `nav-font`, `nav-case`, `nav-size`.
- Decorations (closed list, `1` or `0`): `deco-double-rules`, `deco-offset-shadow`,
  `deco-frame-borders`, `deco-grease-pencil`.
- `home-layout`: one of the brand slugs.

Enums are emitted as plain custom-property values; no component reads them yet.

Provisional slots: `faint`, `ruleStrong`, `link`, `linkHover` and `accent` have no
counterpart in the pre-brand UI. Their refined-gold values were invented to fill the
contract and will be set from the design in the visual phase.

Not per brand (defined once in `shared.ts`, emitted as `--fo-*`, with separate light
and dark values from the design source): win gold (`--fo-win-gold` `#d4af37` light /
`#e2c25a` dark, `--fo-win-gold-on`, `--fo-win-gold-text`), status colours
(`--fo-status-complete`, `-live`, `-drafting`); plus mode-independent
`--fo-danger`, podium metals, the black and white shadow channels, the pill radius
and a system font stack. Nothing renders the win gold or status tokens yet:
`--fo-gold` still resolves to the primary action colour (#d4af37 in both modes),
which differs from the dark win gold. Moving gold consumers onto the shared tokens
is a visual change to resolve in the visual phase.

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
`--fo-gold-primary`, `--fo-gold-rgb` are `primary`; `--fo-text-onGold` is
`onPrimary`; `--fo-gold-wash` is `accent`; `--fo-radius-small/medium/large` are
`radius-sm/md/lg`; `--fo-heading-h1/h2/h3-size` are `h1/h2/h3-size`;
`--fo-shadow-card` and `--fo-shadow-card-hover` are `shadow-card` and
`shadow-raised`; `--fo-gold` follows `primary` for now (see above). `--fo-charcoal-*` and
`--fo-ivory*` are the explicit dark/light slots of the same names (for example
`--fo-charcoal-9` is the dark `page`).

### Adding a brand

1. Copy `refined-gold.ts` to `<slug>.ts` in `theme/brands/` and change the values.
   The compiler rejects a missing slot; the unit tests check both modes, enums and
   colour formats.
2. Add it to `BRAND_DEFINITIONS` in `theme/brands/index.ts`.
3. Run `pnpm --filter @fantasy-oscars/web run test:unit` and
   `pnpm run test:visual`. Add visual coverage for the new brand to the matrix and
   commit its baselines; the other brands' baselines must not change.

Slots are added to the contract only together with a value for every brand.

## Before a second brand changes any pixels

The contract is in place, but refined-gold still reaches a few values through shortcuts that only work while it is the only brand. Fix these before another brand renders:

1. **Win gold versus primary.** `--fo-gold`, `--fo-gold-primary` and `--fo-gold-rgb` follow `--brand-primary`, and they colour both primary actions and "this pick won" (win pills, podium, draft glows and focus rings built from `rgba(var(--fo-gold-rgb), …)`). Sort each consumer into primary or win, and move the win ones to the shared `--fo-win-gold*` tokens. This also brings dark-mode win gold to the design's `#e2c25a`.
2. **Mode-agnostic ink.** `--fo-charcoal-rgb`, `--fo-charcoal-9` and `--fo-ivory` alias the dark `page` and `text` slots but are used as fixed ink, for example in light-mode shadows and Mantine's outline hover. Switch them to `--brand-text-rgb` or add a shadow-tint slot.
3. **Values outside the contract.** These are still hard-coded and invisible to `tokens:check`:
   - Mantine named colours (`color="blue"`, `color="red"`).
   - Raw `font-size`, `letter-spacing` and `text-transform` values.
   - The `theme-color` meta, the web manifest and the icon.
