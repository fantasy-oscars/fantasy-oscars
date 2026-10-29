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
element. Nothing consumes it yet.

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

## Before brands change any styling

Today `data-brand` is set in an effect after the first session check, so it is absent on the first paint. That is harmless while no CSS reads it. The first PR that styles by brand must also set the attribute before the app renders: a small inline script in `index.html` that reuses the pinned value (`fo:brand-session`) or resolves from `fo:brand-preference` and `fo:anon-id`, plus a locally cached last-resolved brand for signed-in users, so there is no flash of the default brand. The script has to share logic with `packages/shared/src/brands.ts` and fit the CSP.
