# 01 Structural prerequisites (refined-gold)

Package: chunk 1 of the brand rollout. Prescribes the fixes listed in `docs/architecture/brands.md`, "Before a second brand changes any pixels", plus the enabled-brands gate and two structural bugs from the inventory. It is the foundation every later brand relies on. Builder: implement this file, not the mockup.

## 1. Scope

**Brands and modes:** `refined-gold`, light and dark. No other brand is defined or enabled by this package.

**In scope**

1. Split the three jobs gold does today into separate roles: primary action (`--brand-primary`), win (`--fo-win-gold*`), and the nominee pill's hover, armed and hover-match states (new non-gold treatments). Every `--fo-gold*` consumer is assigned below (section 4.1).
2. Mode-agnostic ink: retire `--fo-charcoal-*`, `--fo-ivory*` and `--fo-text-onGold`. Each use moves to a contract slot, an explicit-mode slot or a shared token (section 4.2). No new contract slot is needed.
3. Values outside the contract: `text-transform` moves onto `--brand-label-case`. Mantine named colours, raw letter-spacing, `theme-color`, the manifest and the icon are mapped or explicitly left alone with a reason (section 4.3).
4. The pill focus ring and Mantine's focus outline read `--brand-focus-ring`. Refined-gold light `focusRing` is darkened so focus passes 3:1.
5. Enabled-brands gate. This is mechanical and has no visual effect (section 4.6).
6. Admin overflow at 390 px (section 4.7).
7. Draft room landmarks: the header moves out of `main` (section 4.8).
8. A global `prefers-reduced-motion` rule. It is trivial and the visual suite already freezes motion (section 4.9).
9. Visual matrix: three new desktop-only draft cells, plus a horizontal-overflow guard for phone cells (section 6).

**Explicitly not changed**

- Status colours are not rendered yet. Season, seasons-index and landing chips stay neutral. Deferred to chunk 7; see 4.5.
- Countdown urgency stays a colour pulse plus audio. The non-colour cue is deferred to chunk 9.
- The wordmark stays single-colour gold (two-tone comes in chunk 8). Nav case and size slots are still unread (chunk 8).
- Danger stays one mode-independent value. Mantine `red`/`yellow`/`teal`/`gray` are unchanged (4.3).
- The ceremony-detail winner trophy stays text-coloured. The inventory says winners there are gold, but the baseline shows a plain star glyph; chunk 7 decides it.
- No 768 viewport. No layout, spacing or type-size changes outside sections 4.7 and 4.1.4.

## 2. Intent

**Package intent.** "Gold" should mean one thing on screen: _this pick won_. Refined Gold may keep gold as its brand colour for buttons and its own turn, because the design says so. But the board must never rely on hue alone to tell "won" apart from "I'm choosing this" or "this is blake's pick". A drafted winner should look identical in every brand, so win uses the shared pool and not the brand.

**Refined Gold (from the design).** It is a dark, editorial awards look: charcoal and ivory with one warm metal. Gold is the brand's primary action colour. Laurel (#1F6B4A) is shown as a hover tint, but that is incidental (see deviations, D1). Win gold matches primary gold in light mode (#D4AF37). In dark mode win gold is brighter (#E2C25A) so a winner glows a little more than a button.

## 3. Token values

### 3.1 refined-gold contract slots

Only one slot value changes: **light `focusRing` goes from #d4af37 to #8a6d12**. The others are restated for the record. Contrast is against `page` / `surface` / `raised` / `sunken` unless noted. For text, AA needs 4.5 (3.0 for large text). For non-text, it needs 3.0.

| Slot                       | Light                     | Dark       | Notes and contrast                                                                                                                                |
| -------------------------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| page                       | #f7f8fc                   | #0d0d0d    |                                                                                                                                                   |
| surface                    | #f2f3f7                   | #171717    |                                                                                                                                                   |
| raised                     | #eeeff2                   | #222222    |                                                                                                                                                   |
| sunken                     | #e9eaee                   | #222222    |                                                                                                                                                   |
| text                       | #0d0d0d                   | #f7f8fc    | L 18.31 / 17.53 / 16.90 / 16.17. D 18.31 / 16.89 / 14.99 / 14.99                                                                                  |
| muted                      | ink 60 %                  | ivory 60 % | L 5.01 / 4.94 / 4.91 / 4.84. D 6.90 / 6.69 / 6.25 / 6.25                                                                                          |
| faint                      | ink 40 %                  | ivory 40 % | L 2.65, D 3.65. **Decorative only, never text.** Provisional, so chunk 3 sets it                                                                  |
| rule                       | ink 12 %                  | ivory 12 % | decorative                                                                                                                                        |
| ruleStrong                 | ink 24 %                  | ivory 24 % | L 1.71, D 2.03 on page. Used as the pill hover border; hover is transient, so 3:1 is not required                                                 |
| primary                    | #d4af37                   | #d4af37    | fill only. **Never use as text or as a sole 1–2 px indicator in light mode** (1.98 on page)                                                       |
| onPrimary                  | #0d0d0d                   | #0d0d0d    | on primary: 9.24                                                                                                                                  |
| accent                     | #efe6d0                   | #efe6d0    | provisional, unchanged                                                                                                                            |
| link                       | #0d0d0d                   | #f7f8fc    | same as text                                                                                                                                      |
| linkHover                  | #8a6d12                   | #d4af37    | L 4.63 / 4.43 / 4.27 / 4.08 (sunken is below AA; links do not sit on sunken). D 9.24 / 8.53 / 7.57                                                |
| focusRing                  | **#8a6d12** (was #d4af37) | #d4af37    | L 4.63 / 4.43 / 4.27 / 4.08, and 4.35 on the draft card. D 9.24 / 8.53 / 7.57 / 7.57, and 8.76 on the draft card. The old light value scored 1.98 |
| shadow-card, shadow-raised | unchanged                 | unchanged  |                                                                                                                                                   |

Type, wordmark, shape, navigation, decorations and home-layout: unchanged.

### 3.2 Shared tokens (`theme/brands/shared.ts`)

| Token                                          | Light                          | Dark                        | Change              | Contrast                                                                                                                                              |
| ---------------------------------------------- | ------------------------------ | --------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--fo-win-gold`                                | #d4af37                        | #e2c25a                     | none (now rendered) | the fill is not text. Dark fill vs draft card: 10.61                                                                                                  |
| `--fo-win-gold-on`                             | #0d0d0d                        | #0d0d0d                     | none                | on win gold: L 9.24, D 11.20                                                                                                                          |
| `--fo-win-gold-text`                           | #8a6a14                        | **#e2c25a** (was #8a6a14)   | dark value          | L 4.77 / 4.56 / 4.40 / 4.21 (use it on page or surface only). New D 11.20 / 10.33 / 9.17; the old D value was 3.84 and failed. Nothing renders it yet |
| `--fo-status-complete` / `-live` / `-drafting` | #1f6b4a / #c8243b / #0f7b7b    | #4fbf8a / #f0566a / #3fc1be | none                | as text on page: L 6.07 / 5.25 / 4.78, D 8.47 / 5.78 / 8.87                                                                                           |
| `--fo-danger`                                  | #b34b42                        | #b34b42                     | none                | as text: L 4.94, D 3.70 (fails; see 4.3 and escalation)                                                                                               |
| **`--fo-danger-on`** (new constant)            | #f7f8fc                        | #f7f8fc                     | new                 | on danger: 4.94. Replaces `--fo-ivory` on the red countdown pulse                                                                                     |
| podium metals                                  | silver #bcc2cc, bronze #b07a3f | same                        | none                | `--fo-win-gold-on` on silver 10.85, on bronze 5.28                                                                                                    |

### 3.3 `theme/tokens.ts` changes

- **Delete** `--fo-gold`, `--fo-gold-primary`, `--fo-gold-rgb`, `--fo-gold-wash`, `--fo-text-onGold`, `--fo-charcoal-7/8/9`, `--fo-charcoal-rgb`, `--fo-ivory`, `--fo-ivory-neutral`, `--fo-ivory-rgb`, `--fo-ivory-warm`, `--fo-ivory-step-1/2/3`, `--fo-shadow-focusRing-gold`, `--fo-shadow-focusRing-gold-strong`, `--fo-shadow-draft-pillFocus`, `--fo-shadow-draft-pillHover-dark` and `--fo-shadow-draft-pillHover-light`, once their consumers have moved.
- **Add** `--fo-shadow-focusRing`: `0 0 0 var(--fo-focus-ring-width) var(--brand-focus-ring)`.
- **Add** `--fo-shadow-draft-pillHover`: `0 10px 22px rgba(var(--fo-black-rgb), 0.12)` (the lift shadow only, the same in both modes).
- `--fo-db-skipLink-shadow` becomes `rgba(var(--fo-black-rgb), 0.14)`, replacing the charcoal channel. It is never captured, so no baseline moves.
- `--fo-shadow-focusRing-neutral-*-light` and `*-dark` become `rgba(var(--brand-light-text-rgb), …)` and `rgba(var(--brand-dark-text-rgb), …)`, with the same alphas. The rendered values are identical.
- Mantine aliases (`--mantine-color-blue-*`, `--mantine-primary-color-*`) read `--brand-primary` and `--brand-on-primary` directly.

## 4. Component rules

### 4.1 Gold roles, consumer by consumer

Line numbers refer to `apps/web/src/styles.css` at `e58a9c6` (B = `primitives/baseline.css`). "P" = `--brand-primary`, "onP" = `--brand-on-primary`, "W" = `--fo-win-gold`, "Won" = `--fo-win-gold-on`, "F" = `--brand-focus-ring`. For alpha use, apply `color-mix(in srgb, <token> N%, transparent)` to W and Won, and `rgba(var(--brand-primary-rgb), a)` to P.

| Where                                   | Selector (line)                                                                                       | Role after this package                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mantine palette binding                 | 27–57 (`--mantine-color-blue-filled`, `--mantine-primary-color-*`)                                    | P / onP                                                                                                                                                                                                |
| Success text                            | `[data-fo-typo="success"]` 112                                                                        | **`--fo-status-complete`**. No call site uses it today, so nothing changes visually. Gold text failed contrast (1.98)                                                                                  |
| Skip link focus                         | `.skip-link:focus-visible` 152                                                                        | `--fo-shadow-focusRing`                                                                                                                                                                                |
| Mobile bar, my turn                     | `.dr-frame[data-turn=mine] .dr-mobileHeader` 248                                                      | P; text and numbers onP; mini label onP at 72 %                                                                                                                                                        |
| Mobile countdown                        | `.dr-mobileBar.is-countdown` 268; `.pulse-red`                                                        | P; red phase `--fo-danger` with text `--fo-danger-on` (78 % for labels)                                                                                                                                |
| Mobile podium, first place              | `.drm-podiumBar.is-gold` 357–361                                                                      | **W** (gradient mixes W instead of gold); `.drm-podiumText` uses Won on all three metals                                                                                                               |
| Header token, my turn                   | `.drh-token.is-active` 600                                                                            | P                                                                                                                                                                                                      |
| Direction chevron, my turn              | `.drh-chevron` 625                                                                                    | P                                                                                                                                                                                                      |
| Buckle, my turn                         | `.dr-frame[data-turn=mine] .drh-buckle` 716                                                           | P; center and number onP; label onP at 72 %                                                                                                                                                            |
| Buckle, final results                   | `.dr-frame[data-results=final] .drh-buckle` 721                                                       | **W**; center and number Won; label Won at 72 %; silver and bronze keep their metals with Won text                                                                                                     |
| Countdown buckle                        | `.drh-buckle.is-countdown`, `.pulse-gold` 740/748                                                     | P; `.pulse-red` → `--fo-danger` with `--fo-danger-on`                                                                                                                                                  |
| Board pill, hover-match                 | `.dr-pill.is-hoverMatch` 1688–1702                                                                    | new treatment, 4.1.2                                                                                                                                                                                   |
| Board pill, winner                      | `.dr-pill.is-winner` 1704–1712                                                                        | **W** fill, border W at 65 %, text Won, weight medium                                                                                                                                                  |
| Board pill, my-turn hover/active        | 1725–1756                                                                                             | new treatment, 4.1.2                                                                                                                                                                                   |
| Board pill focus                        | 1758–1761 and the neutral rings 1624–1643                                                             | F ring, 4.1.2                                                                                                                                                                                          |
| Filled button                           | `.mantine-Button-root[data-variant=filled]` 1810–1817                                                 | P / onP (and `--fo-button-primary-*` as today)                                                                                                                                                         |
| Checkbox                                | 1854–1855                                                                                             | P / onP                                                                                                                                                                                                |
| Wordmark                                | `.brand` 2013                                                                                         | P (two-tone is chunk 8)                                                                                                                                                                                |
| Admin inline check                      | `.wizard-inline-check` 2106                                                                           | P                                                                                                                                                                                                      |
| Admin drop target                       | `.nomination-row.is-drop-target` 2201                                                                 | P                                                                                                                                                                                                      |
| Admin winner check                      | `.results-winner-check` 2269–2270                                                                     | **W** fill, glyph **Won** (it was ivory, 1.98 on gold)                                                                                                                                                 |
| Tooltip "Drafted by" chip               | `.fo-tip-draftedChip` 2324–2327, `…Name`, `…Pick` 2345/2353                                           | P border and fill; name and pick text **onP**; they read the undefined `--fo-charcoal` today and fall back to inherited colour. Shadow `rgba(var(--fo-black-rgb), 0.25)`. This is ownership, not a win |
| Nav active underline                    | `.nav-link.active` 2540                                                                               | P                                                                                                                                                                                                      |
| Wizard stepper                          | `.wizard-step.is-active::before` 3449, `.connector-gold` 3470, `.is-incomplete.is-progress` 3489–3490 | P. Note: P as a 2 px ring on a light page is 1.98:1; that is legacy and chunk 7 owns it                                                                                                                |
| Wizard stepper, complete or locked icon | 3474–3478                                                                                             | P fill, glyph **onP** (it was `--fo-ivory`, 1.98:1). Visible change V2                                                                                                                                 |
| Legacy draft CSS                        | `.draft-shell …` 3782–3786, `.draft-header[data-my-turn] .turn-timer*` 3820–3826, `.dr-icon-dot` 1565 | **Delete** if `grep` finds no TSX or TS reference (none at `e58a9c6`). Otherwise use P / onP                                                                                                           |
| Admin preview pill                      | `.nominee-pill[data-state=active]` 4213–4217                                                          | P (`--accent` is already P) / onP                                                                                                                                                                      |
| Landing "Draft Live" chip               | `.baseline-statusPill.isUrgent` B 138–141                                                             | P / onP (status colours come in chunk 7)                                                                                                                                                               |
| Hero card                               | B 170–193                                                                                             | P in the spotlight mix; `--fo-gold-wash` → `--brand-accent`                                                                                                                                            |

The `--accent`, `--text`, `--muted`, `--border` and `--panel` short aliases in `styles.css` 5–9 stay as they are.

After this package, `grep -rE -- '--fo-(gold|charcoal|ivory|text-onGold)' apps/web/src` returns nothing.

#### 4.1.2 Nominee pill states (`.dr-pill`, board and rails, desktop and mobile)

Fill rules: a **solid fill is reserved for win**. Primary appears only as a translucent tint. Ink (`--brand-text`) carries the shape cues. Every ring is an inset `box-shadow` so the 22 px pill never changes size. Transitions stay at 120 ms.

| State                                                              | Background                             | Border / ring                                                                   | Text                                    | Other cues                                                                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default                                                            | transparent                            | 1 px `--fo-border`                                                              | muted, regular                          |                                                                                                                                                                                                  |
| Hover (my turn, enabled, not muted)                                | `rgba(var(--brand-primary-rgb), 0.10)` | 1 px `--brand-rule-strong`                                                      | `--brand-text`, medium                  | `translateY(-1px)`, `--fo-shadow-draft-pillHover`, pointer cursor. `:active` is the same without the lift                                                                                        |
| Hover on a muted or `aria-disabled` pill                           | none                                   | none                                                                            | none                                    | default cursor, no lift. This is the current not-my-turn behaviour, now also applied to drafted pills on my turn (clicks on them are already ignored)                                            |
| **Armed** (`.is-armed`, `aria-pressed=true`)                       | `rgba(var(--brand-primary-rgb), 0.22)` | `inset 0 0 0 2px var(--brand-text)`                                             | `--brand-text`, semibold                | **leading check mark**: `<span class="mi-icon-tiny dr-pill-armedMark" aria-hidden="true">check</span>` before the label, 12 px, 4 px gap, colour `currentColor`. Tooltip forced open (unchanged) |
| Armed + hover                                                      | as armed                               | as armed                                                                        | as armed                                | lift and shadow as hover                                                                                                                                                                         |
| **Hover-match** (`.is-hoverMatch`)                                 | `rgba(var(--brand-text-rgb), 0.10)`    | 1 px solid `--brand-text` (border-color, not a ring)                            | `--brand-text`, medium                  | `opacity: 1` even when muted (existing rule)                                                                                                                                                     |
| Hover-match + armed                                                | as armed                               | armed ring (2 px)                                                               | as armed                                | check mark                                                                                                                                                                                       |
| Hover-match + pending (rails)                                      | as hover-match                         | **dashed** 1 px `--brand-text`                                                  | as hover-match                          | opacity 0.65 kept (pending wins on opacity)                                                                                                                                                      |
| **Winner** (`.is-winner`)                                          | `--fo-win-gold`                        | 1 px W at 65 %                                                                  | Won, medium; `.dr-pill-points` also Won |                                                                                                                                                                                                  |
| Winner + muted                                                     | as winner                              | as winner                                                                       | as winner                               | `opacity: 1`: a drafted winner never dims                                                                                                                                                        |
| Winner + hover-match                                               | as winner                              | add `inset 0 0 0 2px var(--fo-win-gold-on)`                                     | Won                                     |                                                                                                                                                                                                  |
| Winner + armed (edge: results entered mid-draft)                   | as winner                              | `inset 0 0 0 2px var(--fo-win-gold-on)`                                         | Won, semibold                           | check mark in Won                                                                                                                                                                                |
| Muted (drafted)                                                    | default                                | default                                                                         | default                                 | opacity 0.5 (unchanged)                                                                                                                                                                          |
| Pending                                                            | default                                | dashed                                                                          | default                                 | opacity 0.65 (unchanged)                                                                                                                                                                         |
| Focus-visible, any pill incl. `aria-disabled` and `dr-pill-static` | unchanged                              | add **outer** `0 0 0 2px var(--brand-focus-ring)`, layered after any inset ring | unchanged                               | one rule replaces the neutral, light, dark and gold variants. Focus on an armed pill shows both rings                                                                                            |
| Rail panes and the board region (`.dr-railPaneBody`, `.dr-middle`) |                                        | the soft neutral ring stays (not a pill)                                        |                                         |                                                                                                                                                                                                  |

Contrast (text on the resulting background, on the draft card `rgba(ink, .03)` over page):

- Armed text: L 15.03, D 11.31.
- Armed ring against the card: L 17.2, D 17.4.
- Hover text: L 16.17, D 14.64.
- Hover-match text: L 13.91, D 13.34.
- Winner text: L 9.24, D 11.20.
- Focus ring against the card: L 4.35, D 8.76.
- Muted label text on the default pill: L 4.93, D 6.79. This is unchanged.

The distinction never relies on hue alone. Each state has its own cue:

| State       | Cue                             |
| ----------- | ------------------------------- |
| Win         | solid fill                      |
| Armed       | 2 px ring and a check glyph     |
| Hover-match | 1 px ink border and a grey tint |
| Hover       | lift                            |
| Focus       | an outer ring                   |
| Pending     | a dashed border                 |
| Muted       | half opacity                    |

### 4.2 Ink and shadow tints

Rules for the builder, applied mechanically. All of them are pixel-identical for refined-gold except where flagged.

1. **Paired light and dark tints**: a rule with `rgba(var(--fo-charcoal-rgb), a)` plus a dark override with `rgba(var(--fo-ivory-rgb), b)`. The base rule becomes `rgba(var(--brand-text-rgb), a)`. If a = b, delete the dark override (both `:root[…]` and `body[…]` copies). If a ≠ b, keep the override with `--brand-text-rgb` and alpha b. Selectors:
   - lines 469/474, 539/544: back and pause separators, 18/18
   - 577/586: `.drh-token`, 25/24
   - 591/596: 55/55
   - 1021/1027: stowaways, 18/18
   - 1036/1041: user badge, 18/20
   - 1190/1197: rail toggle focus, 24/20
   - 1479/1484: archived ceremony card, 2/2
   - 1533/1543: `.dr-card`, 3/3
   - 2096/2101: `.wizard-panel.is-primary`, 18/18
   - 2141/2148: group header focus, 24/18
   - 2167/2172, 2177/2186, 2190/2196: nomination rows
   - 2246–2254: results sticky header
2. **Light-scoped Mantine bindings** (42–56): use `rgba(var(--brand-text-rgb), 0.06)`.
3. **Unscoped ink without a dark pair**: `.draft-plan-row` border, hover and dragging (885–899) become `rgba(var(--brand-text-rgb), …)`. **This is visible change V3**: in dark mode the separators were invisible (charcoal on charcoal) and now show at ivory 14 %.
4. **Shadows**: every remaining `--fo-charcoal-rgb` inside a `box-shadow` becomes `--fo-black-rgb`. None of these are captured in the suite.
5. **Fixed inks on gold or red**: these are the buckle, mobile bar, podium and pulse rows in 4.1. Text on a fill reads that fill's "on" token (onP, Won, `--fo-danger-on`), never charcoal or ivory.
6. **Intentionally inverted surfaces** use explicit-mode slots, which are still per brand:
   - Light-mode hero: `--brand-dark-surface` and `--brand-dark-page`, text `--brand-dark-text`, muted `rgba(var(--brand-dark-text-rgb), .75)`.
   - Dark-mode hero: `--brand-light-page`, text `--brand-light-text`, muted `rgba(var(--brand-light-text-rgb), .75)`.
   - `.mi-icon-inverted`: background `--brand-dark-page`, glyph `--brand-dark-text`.

### 4.3 Values outside the contract

| Value                                                                                                                                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text-transform: uppercase` (13 rules in `styles.css`: lines 120, 304, 779, 827, 1232, 1273, 1342, 2116, 2375, 2615, 2751, 3220, 3945) | `text-transform: var(--brand-label-case)`. All 13 are labels (eyebrows, rail labels, buckle labels, footer column titles, group titles). The two `text-transform: none` resets stay                                                                                                                                                                                                                                               |
| Label letter-spacing (`--fo-letterSpacing-*` scale) and raw `0.01em` / `0` in B 93/101                                                 | B 93 becomes `var(--fo-letterSpacing-tight)`, and `0` stays. The tracking scale stays brand-free for now. Moving labels to `--brand-label-letter-spacing` would change pixels (refined-gold is 0.04em against the existing 0.06–0.09em), so chunk 7 decides it per label family                                                                                                                                                   |
| Raw font sizes                                                                                                                         | None in CSS: all go through `--fo-font-size-*` or `--fo-db-*`. These are brand-free on purpose because the draft header measures itself. Left alone                                                                                                                                                                                                                                                                               |
| Mantine `blue` (ui wrappers)                                                                                                           | Leave. It is Mantine's `primaryColor` and is fully rebound to `--brand-primary` in 3.3. Add a comment in `ui/Button.tsx` and `ui/ActionIcon.tsx` saying so                                                                                                                                                                                                                                                                        |
| Mantine `red` (18 call sites), `yellow` (Indicator, warning banners, one Alert), `teal` (success banners), `gray`, `green`             | **Leave in this package.** They are Mantine's own mode-aware palette, pass AA in both modes and do not vary by brand, so a brand swap cannot break them. Mapping them to `--fo-danger` today would _lower_ dark-mode contrast (3.70). Chunk 7 maps them with a per-mode danger value; target mapping: red → danger, yellow → primary (Indicator) or a new shared warning, teal and green → `--fo-status-complete`, gray → neutral |
| `<meta name="theme-color" content="#d4af37">`, `manifest.webmanifest` (`theme_color` #d4af37, `background_color` #0d0d0d), `icon.svg`  | **Leave.** The owner decided on one icon and app identity until there is a real logo. These are static files read before CSS, and #d4af37 equals the shared light win gold. Chunk 12 can revisit a per-brand `theme-color` set by `brand-init.js`                                                                                                                                                                                 |

### 4.4 Focus ring

- Mantine's own outline: add `.mantine-focus-auto:focus-visible, .mantine-focus-always:focus { outline-color: var(--brand-focus-ring); }` once, in `styles.css`. Everything else about it stays the same.
- Cards (`--fo-shadow-card-focus`) already read F.
- Draft pills: see 4.1.2.

### 4.5 Status colours: deferred

There is no rendering change. Reason: the six lifecycle labels (Pre-draft, Drafting, Paused, Draft complete, Complete, Closed, plus the landing chip's "Draft Live") have to be mapped onto three hues. That is a semantic decision (escalation A2). It also touches season, seasons-index, league and home baselines, which belong to chunk 7's component treatments. Low risk, but not "clearly right" without the mapping.

### 4.6 Enabled-brands gate (no visual change)

- `packages/shared/src/brands.ts`: `export const ENABLED_BRAND_IDS: readonly BrandId[] = ["refined-gold"]`. It must be a non-empty subsequence of `BRAND_IDS`, in rotation order; a unit test checks this.
- `resolveBrand` gets an optional `enabled` argument, defaulting to `ENABLED_BRAND_IDS`. Behaviour:
  - A slug preference that is not enabled behaves like `rotate`.
  - `rotate` resolves to `enabled[day mod enabled.length]`.
  - `random` hashes over `enabled`; with fewer than two enabled brands the yesterday-step logic is skipped.
  - With all seven enabled, the results equal today's spec.
- Pins from `fo:brand-session` and `fo:brand-last` are accepted only when the brand is enabled (`isEnabledBrandId` in `decisions/brand.ts`). Validation of stored preferences is unchanged: slugs stay storable.
- A test build can enable every defined brand with `VITE_FO_ENABLE_ALL_BRANDS=1`. The flag is read in orchestration and passed down; decisions stay pure. It must reach `/brand-init.js` too. It is off in production builds. Chunk 4 needs it for visual tests of unreleased brands.
- `brands.md`: add an "Enabled brands" section. Mark items 1 and 2 of "Before a second brand…" as done and item 3 as partly done, pointing at this file.
- Acceptance:
  - Unit tests: every preference over 14 days resolves to `refined-gold`.
  - With an injected `enabled` of three brands, rotation cycles through exactly those three.
  - With all seven, the result matches `BRAND_IDS[day mod 7]`.
  - The prepaint test still passes.
  - A stored `noir` preference, or a `fo:brand-session` pin of `noir`, renders refined-gold.

### 4.7 Admin overflow at 390 px

Cause (from code): `.nav-links { flex-wrap: nowrap }` overrides the Group's `wrap="wrap"`. Also, `.wizard-shell` is a Mantine `Group align="start"`: below 500 px it turns into a column whose children are sized to their content, not stretched.

1. `.admin-header .nav-links { flex-wrap: wrap; row-gap: var(--fo-space-4); }` and `.admin-header .nav-link { white-space: nowrap; }`. "Game Content" stays on one line and the items wrap to a second row. The dropdown still opens below its trigger.
2. `AdminCeremonyWizardScreen`: replace `<Group … className="wizard-shell">` with `<Box className="wizard-shell">`. CSS: `display:flex; align-items:flex-start; flex-wrap:nowrap; gap` as now. At `max-width: 500px`: `flex-direction: column; align-items: stretch`, with `.wizard-content { width: 100%; }`.
3. Nomination rows and form cards inside `.wizard-content`: `min-width: 0` on flex children, and long titles wrap (`overflow-wrap: anywhere`) instead of pushing the row wider.
4. Desktop layout must not change (verified by the zero-diff rule on the desktop admin cells, except V2).
5. Out of scope: the tall empty block under "Category" in Create nominations. It is a select or dropdown rendering issue to be investigated separately. If step 2 incidentally fixes it, accept that.

### 4.8 Draft room landmarks

- `DraftLayout`: the inner `Box component="main"` becomes a plain `Box` with the same classes. The skip link stays.
- Desktop (`DraftRoomScreen`/`DraftBoardHeader`): `.dr-header` is rendered as `<header>`, `.dr-body` as `<main id="main-content" tabIndex={-1}>`, and `.dr-footer` as `<footer>`. The runtime banners stay between header and main.
- Mobile (`MobileDraftHeader`/`MobileDraftRoom`): `.dr-mobileHeader` is rendered as `<header>`, and `role="banner"` is removed from `.dr-mobileBar`. `.dr-body` becomes `main#main-content`. The bottom `nav` ("Draft rails") stays outside `main`.
- Loading and error returns get their own `main#main-content` wrapper.
- `main#main-content` must appear exactly once per render.
- Classes are unchanged, and `header`/`main`/`footer` are `display:block` like the divs they replace, so **no pixel may change**. The visual `ready: main` selector still matches.

### 4.9 Reduced motion

At the end of `styles.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Keep the 1 px pill lift; it is a transform, not an animation. The countdown class toggles still swap colours; chunk 9 adds the non-colour urgency cue. `freeze.css` already neutralises motion, so no baseline changes.

## 5. Deviations from the mockup

| #   | Deviation                                                                                                                                                                          | Reason                                                                                                                    | the designer?                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| D1  | Laurel #1F6B4A is **not** used as Refined Gold's hover tint. The primary hover stays darkened gold (`--fo-button-primary-hover`), and the pill hover is a translucent primary tint | Laurel is the shared "complete" status colour, so a laurel hover would read as a status                                   | Yes (B1)                              |
| D2  | Light-mode focus ring is #8a6d12, not gold                                                                                                                                         | Gold scores 1.98:1 on the light page, below the 3:1 non-text minimum                                                      | Yes, to confirm (B3)                  |
| D3  | Dark `--fo-win-gold-text` is #e2c25a; the design gives #8A6A14 for "text on light" only                                                                                            | #8A6A14 on the dark page is 3.84:1                                                                                        | No; this fills a gap                  |
| D4  | Armed, hover-match and hover use tints, rings and a glyph rather than gold fills                                                                                                   | The mockup shows only default and won pills; fills would collide with won                                                 | Yes (B2), for per-brand flavour later |
| D5  | Primary gold stays the "my turn" buckle colour in Refined Gold even though it equals light win gold                                                                                | It is the design's brand choice, and turn and win never share an element: the final results frame replaces the turn frame | No                                    |

## 6. Acceptance per screenshot

Brand `refined-gold` × light/dark × 1280/390, plus new cells. **Zero-diff rule:** any cell not listed under "changes" must match its baseline byte-for-byte (`maxDiffPixels: 0`). An unexpected diff is a defect, not a re-baseline.

### 6.1 Cells that change (intended)

| ID  | Cells                                                                                                            | What the reviewer sees                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | `draft-completed` dark-desktop, dark-mobile                                                                      | The centre podium buckle (desktop) or first-place bar (phone) and every winning roster pill are the brighter **#e2c25a**. Text on them stays near-black. Silver, bronze, non-winning pills, header and layout are unchanged. Light cells stay identical (light win gold = old gold)                                                                                                                                                             |
| V2  | `admin-ceremony-nominees` all four cells                                                                         | The stepper's complete (check) and locked (padlock) glyphs are near-black on gold instead of white. Nothing else changes in the desktop cells                                                                                                                                                                                                                                                                                                   |
| V3  | `draft-plans` dark-desktop, dark-mobile                                                                          | Plan rows show faint ivory separators (14 %) where there were none. Row content is identical. Light cells are unchanged                                                                                                                                                                                                                                                                                                                         |
| V4  | `admin-ceremony-nominees` light-mobile, dark-mobile; `admin-home` and `admin-films` light-mobile and dark-mobile | The admin nav wraps onto two rows, with "Game Content" on one line and "Users" fully visible. The stepper and the content below are full width within the 390 viewport. The right edges of "Candidate pool", "Create nominations" and "Review nominations" cards are visible, with padding. Nothing is cut off, and there is no horizontal scroll (`documentElement.scrollWidth <= 390`). In `admin-ceremony-nominees` this is combined with V2 |

### 6.2 New cells (desktop only, light and dark)

Add an optional `viewports` field to `ScreenDef` (default: both).

| New screen                  | Setup                                                                                                                                   | Expectation                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `draft-live-armed`          | avery on the live draft. Click the first undrafted pill in Best Picture and wait for the tooltip card. The confirm toast is visible too | Armed pill: primary tint, 2 px ink ring, leading check, label in full ink. Tooltip card open. Other pills unchanged. No gold-filled pill anywhere on the board     |
| `draft-live-hover-match`    | avery. Hover blake's token in the participant strip                                                                                     | blake's picks in the board and rails have a grey tint, a 1 px ink border and full-ink text, including pills that would otherwise be muted. Clearly not gold-filled |
| `draft-live-focus-disabled` | blake (not his turn). Tab to the Best Picture title, press Enter (the first pill receives focus)                                        | The focused `aria-disabled` pill shows a 2 px outer focus ring: #8a6d12 in light, #d4af37 in dark. No hover tint                                                   |

### 6.3 Cells that must not change (grouped)

- **Every light cell** of all 23 screens, except V2 and V4. Light win gold equals the old gold, ink swaps are value-identical, and `text-transform` reads `uppercase` through the slot.
- **Every dark cell**, except V1, V2, V3 and V4. Dark primary is still #d4af37, so the "my turn" buckle and mobile bar in `draft-live-your-turn` dark look exactly as before.
- **All draft cells** (`draft-live-your-turn`, `draft-live-not-your-turn`) in both modes and viewports. The landmark change (4.8) is element-type only, and pill state rules affect only states not captured there.
- **Home, auth, leagues, league, seasons, ceremonies, account, 404**: unchanged in all four cells each.
- **Overflow guard:** every 390 cell asserts `scrollWidth <= 390`. If a non-admin screen fails it today, list it in a `KNOWN_PHONE_OVERFLOW` array in `matrix.ts` with a comment, and report it. Do not fix it in this package.

## 7. Escalations

### (a) Taste questions for the owner

1. **Armed check glyph.** It costs about 16 px of an already-truncated label; the tooltip card shows the full name. _Recommendation: keep it._ It is the only non-colour cue that survives every brand palette.
2. **Status colour mapping (for chunk 7, decided now so it can be planned).** _Recommendation:_
   - Drafting, Draft Live and Paused → drafting teal (Paused adds a pause icon).
   - Draft complete and Complete → laurel.
   - Cherry "live" → reserved for ceremony night (results arriving).
   - Pre-draft and Closed → neutral grey.

### (b) Requests for the designer

1. Refined Gold shows laurel #1F6B4A as a hover tint, but laurel is the shared "complete" status colour. Please give Refined Gold a primary hover that is not a status hue, or confirm that the darkened-gold hover used here is acceptable.
2. The boards show default and won nominee pills only. For each brand, please show the armed (selected, awaiting confirm), hover-match (another player's picks highlighted) and keyboard-focus states on a 22 px pill at 10 px type. They must stay distinct from won without relying on hue. This package's neutral treatment (tint, ink ring, check) is the baseline the design may restyle.
3. Please confirm a dark-gold focus ring (#8a6d12) for Refined Gold light mode. Gold #d4af37 on the ivory page is 1.98:1. Every light brand will need a focus-ring colour with at least 3:1 against its page.

## 8. Build notes

**Files likely touched**

- `apps/web/src/theme/tokens.ts`, `theme/brands/shared.ts` (`--fo-danger-on`, dark win-gold-text), `theme/brands/refined-gold.ts` (light `focusRing`)
- `styles.css`, `primitives/baseline.css`
- `features/draft/ui/CategoryCard.tsx` (armed mark only)
- `app/layouts/DraftLayout.tsx`, `features/draft/screens/{DraftRoomScreen,DraftBoardHeader}.tsx`, `features/draft/screens/mobile/{MobileDraftHeader,MobileDraftRoom}.tsx`
- `features/admin/screens/ceremonies/AdminCeremonyWizardScreen.tsx`
- `packages/shared/src/brands.ts` (+ tests), `apps/web/src/decisions/brand.ts`, `orchestration/brand/*`, `vite/brandInit.ts` (flag passthrough)
- `tests/visual/matrix.ts`, `tests/visual/screens.spec.ts`, new baselines
- `docs/architecture/brands.md`
- Afterwards, `docs/design/app-inventory.md` is updated by the cartographer, not the builder. Corrections for it:
  - ceremony winners are not gold;
  - `.is-armed` had no styling before this package;
  - `.fo-tip-draftedChip` text read an undefined token.

**Order of work**

1. Enabled gate and tests. This is isolated, so run `test:unit` before moving on.
2. Add tokens (`--fo-shadow-focusRing`, `--fo-shadow-draft-pillHover`, `--fo-danger-on`).
3. Migrate the consumers in 4.1 and 4.2 file by file. Run `pnpm run test:visual` and expect only V1–V3.
4. Delete the legacy tokens, and grep to confirm none remain.
5. Pill states (4.1.2), focus (4.4), reduced motion (4.9).
6. Landmarks (4.8). Run the visual suite and expect zero diff.
7. Admin overflow (4.7) and the overflow guard. Expect V4.
8. New cells (6.2).
9. `brands.md`.
10. `pnpm run ci`.

**Risks**

- **Doubled selectors.** Many dark rules exist twice (`:root[…]` and `body[…]`). Deleting only one copy leaves the other overriding the light rule's new value. Delete both.
- **Specificity of the new pill rules.** The existing my-turn hover selectors are long (`.dr-frame[data-turn=mine] .dr-card-pills .dr-pill-btn:hover`). Winner, armed and focus rules must be at least as specific or come later, or hover will repaint a winner. Order the pill block as: base → muted/pending → hover → hover-match → armed → winner → winner combos → focus.
- **`color-mix` with transparent** (used for W at 65 % and Won at 72 %). This must render identically to the previous `rgba()` in the captured cells, so check V1's text pixels. If it differs by rounding, add `-rgb` channels for `--fo-win-gold` and `--fo-win-gold-on` in `shared.ts` instead.
- **Mantine Group to Box swap** in the admin wizard. Check that the desktop gap and sticky stepper are unchanged; the zero-diff rule on `admin-ceremony-nominees` desktop, apart from V2, catches regressions.
- **Landmark swap.** If any CSS selects `main` or `.draftLayoutMain > *`, the change could reflow; `grep` found none. Keep the `.draftLayoutMain` class on the outer box.
- **The gate flag.** It must not leak into production builds. Add a unit test that the production `brand-init.js` contains only refined-gold in its preload map _or_ treats other brands as unenabled; either is acceptable.
