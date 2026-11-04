# 03 Component treatments (seven brands, light and dark)

Package: how components render the brand slots. It covers the header, navigation, wordmark, buttons and menus (**chunk 8**), then cards, chips, decorations and the draft room (**chunk 9**). Builder: implement this file, not the mockups. Section 8 splits the work into steps (8A–8C, 9A–9C). Each step can be built from its own handoff and verified on its own.

Brand letters: A refined-gold, B red-carpet, C ballot, D noir, E festival, F technicolor, G lightbox. "L / D" means light / dark. Token values are those on `main` (`apps/web/src/theme/brands/*`, after #401), unless this file changes them explicitly.

## 1. Scope

**Brands and modes:** all seven, light and dark. `ENABLED_BRAND_IDS` stays `["refined-gold"]`. Releasing the others is chunk 12.

### 1.1 Chunk 8: header, nav, buttons, wordmark

1. Contract additions that drive the chrome. They are proposals P1 and P2 from 02 §3.2, plus one enum value (§3.1). `css.ts` also gets derived custom properties, so components never read an enum (§3.2).
2. Shell header (`ShellHeader`) and auth header (`AuthLayout`): wordmark, header controls (theme, invites, account menu, logged-out actions), their grouping, labels, tooltips and touch targets (§4.1).
3. Primary navigation, inline and in the phone drawer: face, case, size and tracking from the `navigation.*` slots. The active indicator uses P1 and leaves `primary`. Hover, focus, the current page, and the nav rule (§4.2).
4. The two-tone wordmark in every brand (§4.3).
5. Buttons: primary, secondary, ghost, danger and a new destructive variant; icon buttons; disabled, loading and pressed states; phone heights; reasons for disabled buttons (§4.4). Menus (§4.5).
6. Type scale: the page title moves to `h1Size`, and section titles take the section size. This fixes noir, where section headings outrank the page title (§4.6).
7. The hidden skip link no longer bleeds its shadow into the top-left corner (§4.7).

### 1.2 Chunk 9: cards, decorations, draft board

1. Mantine palette mapping (red, yellow, teal, green, gray), the default border, Divider, Skeleton, Alerts, banners, toast stripes, and the modal backdrop (§4.8).
2. Cards and surfaces: radius, the legacy `.card` and Mantine Card, empty states (§4.9).
3. Decorations: section rules (double rules, frame borders) on the footer and the draft header. The offset shadow on the buckle (§4.10). The nav rule is chunk 8.
4. Label families: which ones read `--brand-font-label` and `--brand-label-letter-spacing`, and which keep the fixed scale (§4.11).
5. Status chips, with the owner's colour mapping, on the season, seasons index, league, landing and Home screens. The role chip and the ceremony winner chip (§4.12).
6. Draft room: board pills beyond 02 §4.1, category and roster cards, the buckle and its states, rails and rail titles, the my-turn bar, draft header controls, SegmentedControl and Switch. Also the **non-colour countdown cue**, which gates enabling E and F in chunk 12 (§4.13).
7. Admin wizard stepper contrast (01 §4.1 table, 1.98:1) (§4.14). Overflow at 390 on `draft-plans` and `account` (§4.15).
8. Two new visual cells: `draft-live-countdown` and `draft-paused` (§6.4).

### 1.3 Not changed

- Token values from 02 (§3.4–3.11), except for these additions: P1, P2, the `stop` enum value, and one font weight for C (§3.1). Shared tokens keep their values. No new shared colour is added (§4.8 explains why warning is neutral).
- Home layouts and compositions, including the hero card composition, the grease-pencil ring (G) and the hero gradients: chunk 10. Pages change only through the shared rules here (header, titles, buttons, cards, chips).
- The picker and enabling brands: chunk 12.
- Draft board geometry (`--fo-db-*`, unit maths, the 22 px pill, the 665 px compact threshold) and the keyboard model.
- Information architecture. The phone keeps the nav drawer and does not get a scrolling nav row (D1).
- No 768 viewport in the matrix. Functional QA checks 768 by hand (R3).

## 2. Intent

**Package.** Each brand's character reaches the chrome and the board through the existing slots. The nav, wordmark and buttons take on each brand's face, case, shape and highlight. Cards, rules and the buckle take on its edges and decorations. Meanings stay fixed across brands:

- solid gold means a pick won;
- teal, laurel and cherry mean draft status, and always come with a text label;
- red means destructive;
- ink means focus and selection.

Everything is one construction with seven skins, so a builder never writes a brand check.

| Brand          | What the chrome should say (from the boards)                                                                                                  | Incidental in the boards, not carried over                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A Refined Gold | A quiet editorial masthead: Cinzel wordmark with a gold second word, soft boxed controls, a calm underline. Warm cards with soft depth.       | The beige active-nav pill (fails 3:1; 02 D7).                     |
| B Red Carpet   | Premiere signage: a tracked uppercase nav, a gold underline and a gold second word, tight 4 px corners and hairlines. Gold carries the night. | Display-face buckle on velvet.                                    |
| C Ballot       | A printed ballot: Bodoni wordmark with an italic second word, mono uppercase nav, double ink rules, square edges and outlined controls.       | Gold underline on links (C links are teal).                       |
| D Noir         | A title card: condensed uppercase everywhere, an ink underline, a gold second word as the only colour.                                        | 2 px white rules under section titles.                            |
| E Festival     | A festival programme: heavy black Archivo, pill navigation filled in ink, round controls, a gold full stop as the signature.                  | Borderless pills on tinted columns.                               |
| F Technicolor  | A poster: chunky 2 px ink outlines with offset shadows, a cherry pill for the current page, a teal second word.                               | A cherry first word (02 D15); controls without an offset.         |
| G Lightbox     | A contact sheet: mono wordmark and nav, black frames, a cherry underline like a grease-pencil mark.                                           | No visible wordmark split (the split is required; G uses weight). |

## 3. Token values

### 3.1 Contract changes (chunk 8, step 8A)

Each slot is added to `contract.ts` with a value for every brand. They are read in chunk 8. The tables use the gold-in-chrome values (escalation a1, recommended). The branch for a "no" answer is in §3.1.3.

| Change                          | Type                                                             | A      | B      | C      | D      | E        | F       | G      |
| ------------------------------- | ---------------------------------------------------------------- | ------ | ------ | ------ | ------ | -------- | ------- | ------ |
| **P1** `navigation.activeColor` | `"primary" \| "accent" \| "text" \| "gold"`                      | accent | gold   | gold   | text   | text     | primary | accent |
| **P2** `wordmark.toneColor`     | `"primary" \| "accent" \| "gold"`                                | accent | gold   | accent | gold   | gold     | accent  | accent |
| `TWO_TONE_METHODS` gains `stop` | `"colour" \| "italic" \| "weight" \| "stop"`                     | colour | colour | italic | colour | **stop** | colour  | weight |
| C `fonts.faces`                 | add `IBM Plex Mono` weight **600** (nav and labels, §4.2, §4.11) | –      | –      | +600   | –      | –        | –       | –      |

- `gold` means the shared `--fo-win-gold-text` (#8a6a14 / #e2c25a). It is never the fill `--fo-win-gold`.
- The `stop` method (E, escalation a2) keeps both words in `text` and adds a trailing full stop in the tone colour. If the owner declines, E keeps `colour`, and its second word takes the tone colour like B and D.
- Contract test: when `activeTab` is `pill`, `activeColor` must be `text`, `primary` or `accent`. Each of those has an on-colour that passes 4.5 (§3.3.2).
- P2 is required for every brand, even where `twoTone` is not `colour` or `stop` (C, G). It is then unused, and the value is still required so a later switch needs no new value.

#### 3.1.3 Branch if the owner declines gold in chrome (a1 = no)

Only these values change: B `activeColor` → `text`, C `activeColor` → `text`, B `toneColor` → `primary`, D `toneColor` → `accent`, E `toneColor` → `accent`. Their contrast is in §3.3.

### 3.2 Derived custom properties (`css.ts`, no contract change)

`css.ts` already derives `--brand-button-radius` from `buttonShape`. It now derives the values below in the same way, in the common block of each brand. Components read only these, never `--brand-nav-active`, `--brand-wordmark-two-tone` or `--brand-rule-style` (those stay emitted for reference). "Colour of X" means the string `var(--brand-accent)`, `var(--brand-primary)`, `var(--brand-text)` or `var(--fo-win-gold-text)`, so it resolves per mode.

| Property                        | Rule                                                                                                                                                                                     | A              | B              | C               | D              | E              | F              | G              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------- | --------------- | -------------- | -------------- | -------------- | -------------- |
| `--brand-nav-pill`              | `1` if `activeTab = pill`, else `0`                                                                                                                                                      | 0              | 0              | 0               | 0              | 1              | 1              | 0              |
| `--brand-nav-indicator`         | colour of `activeColor`                                                                                                                                                                  | accent         | gold           | gold            | text           | text           | primary        | accent         |
| `--brand-nav-active-bg`         | pill: indicator; underline: `transparent`                                                                                                                                                | transparent    | transparent    | transparent     | transparent    | text           | primary        | transparent    |
| `--brand-nav-active-fg`         | pill: `text`→`var(--brand-page)`, `primary`→`var(--brand-on-primary)`, `accent`→`var(--brand-page)`; underline: `var(--brand-text)`                                                      | text           | text           | text            | text           | page           | onPrimary      | text           |
| `--brand-nav-active-border`     | pill: `var(--brand-text)`; underline: indicator                                                                                                                                          | accent         | gold           | gold            | text           | text           | text           | accent         |
| `--brand-nav-border-width`      | pill: `var(--brand-border-width)`; underline: `0 0 2px`                                                                                                                                  | 0 0 2px        | 0 0 2px        | 0 0 2px         | 0 0 2px        | 1px            | 2px            | 0 0 2px        |
| `--brand-nav-letter-spacing`    | `navigation.case = uppercase` ? `type.labelLetterSpacing` : `normal` (02 D13)                                                                                                            | normal         | 0.12em         | 0.08em          | 0.12em         | normal         | normal         | normal         |
| `--brand-section-rule`          | `ruleStyle = double`: `3px double var(--brand-text)`; else `frameBorders`: `var(--brand-border-width) solid var(--brand-text)`; else `var(--brand-border-width) solid var(--brand-rule)` | 1px solid rule | 1px solid rule | 3px double text | 1px solid rule | 1px solid rule | 2px solid rule | 1px solid text |
| `--brand-nav-rule`              | pill: `0 solid transparent`; underline: `var(--brand-section-rule)`                                                                                                                      | = section rule | = section rule | = section rule  | = section rule | none           | none           | = section rule |
| `--brand-wordmark-tone-color`   | `colour`: colour of `toneColor`; other methods: `inherit`                                                                                                                                | accent         | gold           | inherit         | gold           | inherit        | accent         | inherit        |
| `--brand-wordmark-tone-style`   | `italic`: `italic`; else `normal`                                                                                                                                                        | normal         | normal         | italic          | normal         | normal         | normal         | normal         |
| `--brand-wordmark-tone-weight`  | `italic` or `weight`: `400`; else `inherit`                                                                                                                                              | inherit        | inherit        | 400             | inherit        | inherit        | inherit        | 400            |
| `--brand-wordmark-stop-display` | `stop`: `inline`; else `none`                                                                                                                                                            | none           | none           | none            | none           | inline         | none           | none           |
| `--brand-wordmark-stop-color`   | colour of `toneColor`                                                                                                                                                                    | accent         | gold           | accent          | gold           | gold           | accent         | accent         |

Decorations are already emitted as `1` or `0` (`--brand-deco-offset-shadow` and so on). Use them as multipliers inside `calc()`, for example `0 calc(3px * var(--brand-deco-offset-shadow)) 0 var(--brand-text)`. They are never used as conditions.

Unit tests: snapshot the generated CSS, and assert the table above for all seven brands.

### 3.3 Contrast of every new pair (14 palettes)

Notation as in 02: text needs 4.5 (3.0 for 24 px or larger, or 18.66 px bold); non-text needs 3.0. "p / r" means page / raised. The drawer is `raised`. Chips and wells are `sunken`.

#### 3.3.1 Navigation (inline nav sits on `page`; drawer on `raised`)

| Brand · mode | Inactive label (`muted`) p / r | Active label (`text`) p / r | Underline indicator p / r (colour) | No-gold branch indicator (`text`) p / r |
| ------------ | ------------------------------ | --------------------------- | ---------------------------------- | --------------------------------------- |
| A L          | 5.69 / 6.03                    | 16.38 / 17.37               | 5.47 / 5.80 (#7f6111)              | –                                       |
| A D          | 7.20 / 6.63                    | 16.31 / 15.01               | 10.87 / 10.00 (#e2c25a)            | –                                       |
| B L          | 5.70 / 6.43                    | 15.95 / 18.00               | 4.48 / 5.06 (#8a6a14)              | 15.95 / 18.00                           |
| B D          | 8.52 / 8.02                    | 16.90 / 15.90               | 11.27 / 10.61 (#e2c25a)            | 16.90 / 15.90                           |
| C L          | 6.53 / 6.99                    | 15.41 / 16.51               | 4.49 / 4.81 (#8a6a14)              | 15.41 / 16.51                           |
| C D          | 6.71 / 6.23                    | 15.04 / 13.97               | 10.77 / 10.01 (#e2c25a)            | 15.04 / 13.97                           |
| D L          | 6.27 / 6.90                    | 17.17 / 18.88               | 17.17 / 18.88 (#111111)            | –                                       |
| D D          | 7.80 / 7.17                    | 17.58 / 16.16               | 17.58 / 16.16 (#f2f2f2)            | –                                       |
| G L          | 6.17 / 7.25                    | 15.68 / 18.42               | 5.39 / 6.33 (#b8213a)              | –                                       |
| G D          | 7.21 / 6.66                    | 15.48 / 14.30               | 5.61 / 5.19 (#f0566a)              | –                                       |

Pill brands (the active pill fill is the indicator; the label sits on it):

| Brand · mode | Inactive (`muted`) p / r | Pill fill vs p / r | Label on fill | Pill edge (`text`) vs p / r |
| ------------ | ------------------------ | ------------------ | ------------- | --------------------------- |
| E L          | 6.50 / 5.95              | 19.30 / 17.67      | 19.30         | = fill (same colour)        |
| E D          | 7.81 / 7.19              | 17.67 / 16.28      | 17.67         | = fill                      |
| F L          | 6.50 / 6.85              | 5.19 / 5.47        | 5.19          | 15.59 / 16.45               |
| F D          | 9.54 / 8.72              | 3.28 / 3.00        | 5.19          | 16.42 / 15.00               |

The hover underline is `ruleStrong`: 3.38–4.89 on `page` and 3.33–4.47 on `raised` in every palette (02 §3.4–3.10). All pairs pass. B light and C light gold (4.48, 4.49) is an indicator (3:1), never text.

#### 3.3.2 Wordmark (logotype, exempt under 1.4.3, given for the record)

| Brand | Base word (`text`) on page L / D | Tone L / D                              | No-gold branch tone L / D |
| ----- | -------------------------------- | --------------------------------------- | ------------------------- |
| A     | 16.38 / 16.31                    | accent 5.47 / 10.87                     | –                         |
| B     | 15.95 / 16.90                    | gold 4.48 / 11.27                       | primary **1.86** / 11.27  |
| C     | 15.41 / 15.04                    | italic, `text`: 15.41 / 15.04           | –                         |
| D     | 17.17 / 17.58                    | gold 4.60 / 11.34                       | accent 5.24 / 12.22       |
| E     | 19.30 / 17.67                    | stop in gold 5.06 / 11.12 (base `text`) | accent 6.44 / 8.41        |
| F     | 15.59 / 16.42                    | accent 5.64 / 8.34                      | –                         |
| G     | 15.68 / 15.48                    | weight 400, `text`: 15.68 / 15.48       | –                         |

The festival dark wordmark carried from 02 (primary #1f6b4a on #0e0e0e, 3.00) is resolved, because the base word is now `text` (17.67). Under the no-gold branch, B light would set its second word at 1.86:1. That is legal for a logotype but faint, and it is one reason a1 recommends gold.

#### 3.3.3 Buttons, header controls and the badge

| Brand · mode | Primary label on fill (rest / hover / active) | Primary fill vs p / r | Secondary label `text` on `raised` / hover `sunken` | Secondary border `ruleStrong` vs p / r | Ghost label `muted` p / r | Disabled `muted` on `sunken` | Danger text and border (`--fo-danger-text`) p / s / r / sunken | Danger hover (10 % tint on raised) |
| ------------ | --------------------------------------------- | --------------------- | --------------------------------------------------- | -------------------------------------- | ------------------------- | ---------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| A L          | 8.26 / 7.00 / 5.88                            | 1.98 / 2.10 (fill)    | 17.37 / 15.01                                       | 3.39 / 3.59                            | 5.69 / 6.03               | 5.21                         | 5.57 / 5.10 / 5.90 / 5.10                                      | 5.14                               |
| A D          | 10.87 / 9.14 / 7.67                           | 10.87 / 10.00         | 15.01 / 13.52                                       | 3.71 / 3.42                            | 7.20 / 6.63               | 5.97                         | 6.51 / 5.39 / 5.99 / 5.39                                      | 5.51                               |
| B L          | 8.76 / 7.42 / 6.23                            | 1.86 / 2.10 (fill)    | 18.00 / 14.40                                       | 3.42 / 3.86                            | 5.70 / 6.43               | 5.14                         | 5.23 / 5.90 / 5.90 / 4.72                                      | 5.14                               |
| B D          | 10.61 / 8.92 / 7.48                           | 11.27 / 10.61         | 15.90 / 14.63                                       | 3.56 / 3.35                            | 8.52 / 8.02               | 7.38                         | 6.74 / 6.35 / 6.35 / 5.84                                      | 5.84                               |
| C L          | 15.41 / 15.73 / 16.03                         | 15.41 / 16.51         | 16.51 / 13.96                                       | 3.45 / 3.69                            | 6.53 / 6.99               | 5.91                         | 5.24 / 5.61 / 5.61 / 4.74                                      | 4.92                               |
| C D          | 15.04 / 12.65 / 10.43                         | 15.04 / 13.97         | 13.97 / 12.90                                       | 3.63 / 3.37                            | 6.71 / 6.23               | 5.75                         | 6.45 / 5.99 / 5.99 / 5.53                                      | 5.51                               |
| D L          | 17.17 / 17.30 / 17.55                         | 17.17 / 18.88         | 18.88 / 15.55                                       | 3.49 / 3.84                            | 6.27 / 6.90               | 5.68                         | 5.37 / 5.90 / 5.90 / 4.86                                      | 5.14                               |
| D D          | 17.58 / 14.77 / 12.13                         | 17.58 / 16.16         | 16.16 / 14.55                                       | 3.75 / 3.45                            | 7.80 / 7.17               | 6.46                         | 6.78 / 6.24 / 6.24 / 5.62                                      | 5.77                               |
| E L          | 6.44 / 7.28 / 8.15                            | 6.44 / 5.90           | 17.67 / 16.17                                       | 3.64 / 3.33                            | 6.50 / 5.95               | 5.45                         | 5.90 / 5.40 / 5.40 / 4.95                                      | 4.73                               |
| E D          | 6.44 / 7.28 / 8.15                            | 3.00 / 2.76 (fill)    | 16.28 / 14.60                                       | 3.72 / 3.43                            | 7.81 / 7.19               | 6.45                         | 6.65 / 6.13 / 6.13 / 5.50                                      | 5.65                               |
| F L          | 5.19 / 5.91 / 6.75                            | 5.19 / 5.47           | 16.45 / 14.03                                       | 3.40 / 3.59                            | 6.50 / 6.85               | 5.84                         | 5.50 / 4.95 / 5.80 / 4.95                                      | 5.05                               |
| F D          | 5.19 / 5.91 / 6.75                            | 3.28 / 3.00           | 15.00 / 12.89                                       | 4.89 / 4.47                            | 9.54 / 8.72               | 7.49                         | 6.30 / 4.95 / 5.76 / 4.95                                      | 5.25                               |
| G L          | 18.42 / 18.73 / 18.88                         | 15.68 / 18.42         | 18.42 / 14.56                                       | 3.38 / 3.97                            | 6.17 / 7.25               | 5.73                         | 5.02 / 5.90 / 5.90 / 4.67                                      | 5.14                               |
| G D          | 15.48 / 13.02 / 10.72                         | 15.48 / 14.30         | 14.30 / 13.00                                       | 3.66 / 3.38                            | 7.21 / 6.66               | 6.05                         | 6.51 / 6.01 / 6.01 / 5.47                                      | 5.53                               |

- **Destructive** (filled danger, mode-independent): label `--fo-danger-on` on `--fo-danger` gives 4.94, 5.81 on hover and 6.63 when active. The fill against page and raised is at least 3.18 in every dark palette (F dark raised) and at least 4.47 in light (G page). The fill #b34b42 is never used as a thin line or icon: as a 3 px border on F dark `surface` it drops to 2.55. Every non-text danger mark therefore uses `--fo-danger-text`.
- Primary fills marked "(fill)" are below 3:1 against their background (A and B light, E dark). That was accepted in 02 §4.6: the label identifies the button at 6.44 or more.
- **Header icon buttons** use the secondary numbers (icon `text` on `raised`, hover on `sunken`). Their edge is `--brand-shadow-card`, a decorative ring. The icon identifies the control.
- **Invite badge** (`Indicator`): count `onPrimary` on `primary` = the primary label column (5.19 or more).
- **Focus ring** (`focusRing` = `text`): at least 12.89 against every background (02).

#### 3.3.4 Status chips, alerts and draft cues (chunk 9)

| Brand · mode | Drafting teal vs p / s / r / sunken | Complete laurel vs p / s / r / sunken | Live cherry vs p / s / r / sunken | Chip label `text` / `muted` on `sunken` |
| ------------ | ----------------------------------- | ------------------------------------- | --------------------------------- | --------------------------------------- |
| A L          | 4.78 / 4.38 / 5.07 / 4.38           | 6.07 / 5.56 / 6.44 / 5.56             | 5.25 / 4.81 / 5.57 / 4.81         | 15.01 / 5.21                            |
| A D          | 8.61 / 7.14 / 7.92 / 7.14           | 8.22 / 6.82 / 7.57 / 6.82             | 5.61 / 4.65 / 5.16 / 4.65         | 13.52 / 5.97                            |
| B L          | 4.49 / 5.07 / 5.07 / 4.06           | 5.71 / 6.44 / 6.44 / 5.15             | 4.93 / 5.57 / 5.57 / 4.45         | 14.40 / 5.14                            |
| B D          | 8.93 / 8.40 / 8.40 / 7.73           | 8.53 / 8.02 / 8.02 / 7.38             | 5.82 / 5.47 / 5.47 / 5.04         | 14.63 / 7.38                            |
| C L          | 4.50 / 4.82 / 4.82 / 4.08           | 5.71 / 6.12 / 6.12 / 5.18             | 4.94 / 5.29 / 5.29 / 4.47         | 13.96 / 5.91                            |
| C D          | 8.53 / 7.93 / 7.93 / 7.32           | 8.15 / 7.57 / 7.57 / 6.99             | 5.56 / 5.17 / 5.17 / 4.77         | 12.90 / 5.75                            |
| D L          | 4.61 / 5.07 / 5.07 / 4.18           | 5.86 / 6.44 / 6.44 / 5.31             | 5.06 / 5.57 / 5.57 / 4.59         | 15.55 / 5.68                            |
| D D          | 8.98 / 8.26 / 8.26 / 7.44           | 8.58 / 7.89 / 7.89 / 7.10             | 5.85 / 5.38 / 5.38 / 4.84         | 14.55 / 6.46                            |
| E L          | 5.07 / 4.64 / 4.64 / 4.25           | 6.44 / 5.90 / 5.90 / 5.40             | 5.57 / 5.10 / 5.10 / 4.66         | 16.17 / 5.45                            |
| E D          | 8.81 / 8.11 / 8.11 / 7.28           | 8.41 / 7.75 / 7.75 / 6.95             | 5.74 / 5.29 / 5.29 / 4.74         | 14.60 / 6.45                            |
| F L          | 4.73 / 4.25 / 4.99 / 4.25           | 6.00 / 5.40 / 6.33 / 5.40             | 5.19 / 4.67 / 5.47 / 4.67         | 14.03 / 5.84                            |
| F D          | 8.34 / 6.55 / 7.62 / 6.55           | 7.96 / 6.25 / 7.28 / 6.25             | 5.43 / 4.27 / 4.96 / 4.27         | 12.89 / 7.49                            |
| G L          | 4.32 / 5.07 / 5.07 / 4.01           | 5.48 / 6.44 / 6.44 / 5.09             | 4.74 / 5.57 / 5.57 / 4.40         | 14.56 / 5.73                            |
| G D          | 8.62 / 7.96 / 7.96 / 7.24           | 8.23 / 7.60 / 7.60 / 6.91             | 5.61 / 5.19 / 5.19 / 4.72         | 13.00 / 6.05                            |

The status hues are used only as non-text marks: a dot, an icon or a 1 px chip border. All pass 3.0, the lowest being 4.01 (G light, teal on `sunken`). Chip labels are always `text` (toned) or `muted` (neutral). The neutral chip border is `ruleStrong` (at least 3.05 on `sunken`, 02).

- **Alerts, banners and toasts** (§4.8): the tone colour appears only as the 3 px inline-start border and the icon, on a tint of 8 % tone over the container. Minimum results:
  - `--fo-danger-text` 4.46 (F light, `surface`);
  - laurel 4.84;
  - teal 3.84.

  All message text is `text`, at least 11.36 on any tint. Tone-coloured text would fail on several light tints (danger on B, C and G pages 4.31–4.47), so tone text is not used.

- **Winner chip** (§4.12.4): `--fo-win-gold-on` on `--fo-win-gold` gives 9.24 / 11.20 in every brand.
- **Countdown cue** (§4.13.6): the 2 px inner ring and the timer glyph use the fill's own ink.
  - Primary phase: `onPrimary` on `primary` = 5.19–18.42.
  - Danger phase: `--fo-danger-on` on `--fo-danger` = 4.94.

  These pass in both phases in every brand, independent of the luminance step between phases (1.06 in F, 1.23 in E; 02 §4.4).

- **Stepper** (§4.14): `text` on `page` = 15.41–19.30.
- **Switch** (§4.13.8): the checked track is `text` (at least 12.89 on any background), the thumb `page` on `text` is 15.41 or more, and the unchecked track edge is `ruleStrong`.
- **Board pill** default label (§4.13.1): `text` on `raised` 13.97–18.88 (was `muted`). Drafted pills at 50 % opacity measure 3.25–4.87; disabled content is exempt, but this is a gain over the previous `muted` at 50 %.
- **Skeleton blocks** use `rule` on `raised` and are decorative. They carry `role=status` text.

## 4. Component rules

Selectors refer to `apps/web/src/styles.css` (S), `primitives/baseline.css` (B) and the named TSX files. Every rule reads slots or the derived properties in §3.2. No rule names a brand.

### 4.1 Shell and auth header (chunk 8, step 8B)

**Composition (unchanged layout, new construction).**

| Width                                                                    | Left                              | Right, in this order, 8 px gap                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline nav mode, signed in                                               | Wordmark                          | Theme toggle · Invites · Account menu trigger                                                                                                      |
| Inline nav mode, signed out                                              | Wordmark                          | Theme toggle · "Create account" (ghost) · "Log in" (secondary). While the session check runs, a muted "Checking…" sits in place of the two buttons |
| Drawer nav mode (below 500, or 500–900 when links do not fit), signed in | Open-navigation button · wordmark | Theme toggle · Invites                                                                                                                             |
| Drawer nav mode, signed out                                              | Open-navigation button · wordmark | Theme toggle                                                                                                                                       |
| Auth layout (`/login`, `/register`)                                      | Wordmark                          | Theme toggle                                                                                                                                       |

**Header icon button** (new class `.fo-headerIconBtn`; replaces `.theme-toggle` in `ShellHeader` and `AuthLayout` only; the draft room keeps `.theme-toggle` until 9C):

| State           | Treatment                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rest            | 40 × 40 px at 500 px and wider, 44 × 44 px below 500. Padding 0. Icon 20 px (`.mi-icon` or `.gicon`), colour `--brand-text`. Background `--brand-raised`. Edge `box-shadow: var(--brand-shadow-card)`. Radius `--brand-button-radius` (A 10, B 4, C 0, D 0, E pill so a circle, F 12, G 0) |
| Hover           | Background `--brand-sunken`; `box-shadow: var(--brand-shadow-raised)`                                                                                                                                                                                                                      |
| Active, pressed | `transform: translateY(var(--fo-press-offset))`                                                                                                                                                                                                                                            |
| Focus-visible   | Mantine outline: 2 px `--brand-focus-ring`, 2 px offset (unchanged rule)                                                                                                                                                                                                                   |
| Tooltip         | Mantine `Tooltip`, `openDelay={400}`, label equal to the accessible name; it also opens on keyboard focus. Floating-layer skin from 02 §4.5                                                                                                                                                |
| Disabled        | Not used in the header                                                                                                                                                                                                                                                                     |

| Control              | Accessible name                                                                         | Icon                             | Notes                                                                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme toggle         | "Switch to dark mode" / "Switch to light mode" (unchanged)                              | as today (codepoint glyph)       | Header icon button                                                                                                                                                                                                                                                                                                          |
| Invites              | "Invites" with no pending; "Invites, N pending" otherwise (N capped as the badge: "9+") | `notifications` → **`mail`**     | A `Link` to `/invites`. Badge: Mantine `Indicator`, `color` bound to primary (§4.4.6), offset 4, 16 px, label "9+" cap unchanged, hidden at 0. Tooltip "Invites"                                                                                                                                                            |
| Open navigation      | "Open navigation"; `aria-expanded` mirrors the drawer; `aria-controls` the drawer id    | `menu`                           | Header icon button, left of the wordmark                                                                                                                                                                                                                                                                                    |
| Account menu trigger | Visible text is the username; `aria-label` "Account menu"                               | avatar left, `expand_more` right | Same skin as the icon button but auto width: height 40, padding `0 10px 0 6px`, gap 8, avatar 28 px, username 14 px weight 600 in the body face, `max-width: 160px`, one line with ellipsis, `title` = full username. `expand_more` (18 px) rotates 180° while open (`[aria-expanded="true"]`). Replaces the "▾" text glyph |
| Log in               | "Log in"                                                                                | none                             | `variant="secondary"`, keeps `state.from`                                                                                                                                                                                                                                                                                   |
| Create account       | "Create account"                                                                        | none                             | `variant="ghost"`, links to `/register`, same label as the drawer                                                                                                                                                                                                                                                           |
| "Checking…"          | –                                                                                       | –                                | `muted`, 12 px, reserves the width of the two buttons (`min-width`), so the header does not jump when they arrive                                                                                                                                                                                                           |

Header row: `.site-header-row` stays one row (`nowrap`). Its height is set by the 40 px controls (44 px on phone) and the wordmark.

### 4.2 Primary navigation (chunk 8, step 8B)

`ShellPrimaryNav` (`.site-nav`, `.nav-link`) and the admin sub-nav (`.admin-header .nav-link` shares the class; it inherits everything below).

| Property                                                       | Value                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Face                                                           | `font-family: var(--brand-nav-font)`. This fixes ballot, which rendered its nav in the body face; C now gets Plex Mono                                                                                                                                                                                                                               |
| Size, case, tracking                                           | `font-size: var(--brand-nav-size)`; `text-transform: var(--brand-nav-case)`; `letter-spacing: var(--brand-nav-letter-spacing)`                                                                                                                                                                                                                       |
| Weight                                                         | 600 in every brand (C needs the Plex 600 face, §3.1)                                                                                                                                                                                                                                                                                                 |
| Spacing                                                        | `.nav-links { column-gap: calc(24px - 18px * var(--brand-nav-pill)); }` (24 px for underline, 6 px for pill). `.nav-link { padding-block: 8px; padding-inline: calc(14px * var(--brand-nav-pill)); }`                                                                                                                                                |
| Shape                                                          | `border-style: solid; border-color: transparent; border-width: var(--brand-nav-border-width); border-radius: var(--brand-button-radius)`. The transparent border reserves the indicator's space, so states never move text                                                                                                                           |
| Nav rule                                                       | `.site-nav { border-bottom: var(--brand-nav-rule); padding-bottom: 4px; }`. A, B, D: 1 px `rule`. C: 3 px double ink. G: 1 px ink. E, F: none. The underline sits 4 px above the rule, not on it                                                                                                                                                     |
| Inactive                                                       | colour `--brand-muted`; background transparent                                                                                                                                                                                                                                                                                                       |
| Hover (inactive)                                               | colour `--brand-text`; underline brands: `border-bottom-color: var(--brand-rule-strong)`; pill brands: `background: var(--brand-sunken)`                                                                                                                                                                                                             |
| Current page (`.active`, `aria-current="page"` from `NavLink`) | `color: var(--brand-nav-active-fg); background: var(--brand-nav-active-bg); border-color: var(--brand-nav-active-border)`. Underline brands: 2 px underline in the P1 colour. E: ink pill with page-coloured label. F: cherry pill with a 2 px ink edge and cream label. **Never `--brand-primary` for an underline**, so P1's 3:1 problem is closed |
| Current + hover                                                | as current                                                                                                                                                                                                                                                                                                                                           |
| Focus-visible                                                  | `outline: var(--fo-focus-ring-width) solid var(--brand-focus-ring); outline-offset: 2px` (Mantine Anchor focus); visible on the cherry and ink pills because of the gap                                                                                                                                                                              |
| Disabled, loading, error, empty                                | not applicable (links only). The Admin link stays hidden for non-operators                                                                                                                                                                                                                                                                           |
| Collapsed (`.is-collapsed`)                                    | unchanged: kept for measurement, zero height                                                                                                                                                                                                                                                                                                         |

Measurement: `useShellNavMode` measures the rendered links, so the new faces and sizes are picked up automatically (R3).

**Drawer** (`ShellNavDrawer`, `.fo-navDrawerLink`): left, `size="xs"`, title "Menu".

| Piece            | Treatment                                                                                                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface          | `raised` with the overlay edge (02 §4.5; unchanged)                                                                                                                                                                                                                                |
| Close button     | 44 × 44, ghost icon button, label "Close navigation"                                                                                                                                                                                                                               |
| Links            | `display: flex; align-items: center; min-height: 44px; padding-inline: 12px; width: 100%`. Same face, case, size, tracking and weight as the inline nav. Radius `--brand-button-radius`                                                                                            |
| Inactive / hover | `muted` / `text` on `sunken`                                                                                                                                                                                                                                                       |
| Current page     | `color: var(--brand-nav-active-fg); background: var(--brand-nav-active-bg); box-shadow: inset calc(3px * (1 - var(--brand-nav-pill))) 0 0 var(--brand-nav-indicator)`. Underline brands get a 3 px inline-start bar in the P1 colour. Pill brands get the same pill fill as inline |
| Focus-visible    | 2 px `focusRing`, offset −2 px (inset, so the drawer padding never clips it)                                                                                                                                                                                                       |
| Divider          | Mantine `Divider` in `--brand-rule` (§4.8.3 lands in 9A; until then it keeps Mantine's grey)                                                                                                                                                                                       |
| Account          | a drawer link (current when on `/account`)                                                                                                                                                                                                                                         |
| Log out          | `Button variant="ghost"`, **neutral** (not red), `leftSection` icon `logout`, label "Log out", left-aligned, `min-height: 44px; padding-inline: 12px`                                                                                                                              |
| Signed out       | "Log in" and "Create account" links                                                                                                                                                                                                                                                |
| Behaviour        | closes on route change (unchanged); focus returns to the open-navigation button on close (Mantine default; QA checks)                                                                                                                                                              |

### 4.3 Wordmark (chunk 8, step 8B)

Markup in `ShellHeader` and `AuthLayout` (the text stays one accessible string, "Fantasy Oscars"):

```tsx
<Title className="site-title" order={1}>
  <span className="site-title-word">Fantasy</span>{" "}
  <span className="site-title-tone">
    Oscars
    <span className="site-title-stop" aria-hidden="true">
      .
    </span>
  </span>
</Title>
```

| Selector           | Rule                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.brand`           | `color: inherit` (no longer `--brand-primary`); no underline; no colour change on hover; focus-visible 2 px ring with 2 px offset                                                                                                                                                                                                                                    |
| `.site-title`      | `font-family: var(--brand-wordmark-font); font-weight: var(--brand-wordmark-weight); text-transform: var(--brand-wordmark-case); letter-spacing: var(--brand-wordmark-letter-spacing); color: var(--brand-text); font-size: var(--fo-font-size-xl)` (32 px); `line-height: 1.1`. Below 500 px: `font-size: var(--fo-font-size-lg)` (24 px); it may wrap to two lines |
| `.site-title-tone` | `color: var(--brand-wordmark-tone-color); font-style: var(--brand-wordmark-tone-style); font-weight: var(--brand-wordmark-tone-weight); white-space: nowrap`                                                                                                                                                                                                         |
| `.site-title-stop` | `display: var(--brand-wordmark-stop-display); color: var(--brand-wordmark-stop-color)`                                                                                                                                                                                                                                                                               |

Per brand: A Cinzel 700, "Oscars" in gold ink (#7f6111 / #e2c25a). B Cinzel 700 at 0.04em, "Oscars" in gold. C Bodoni 600, "Oscars" in Bodoni italic 400. D Barlow Condensed 700 uppercase, "OSCARS" in gold. E Archivo 900, both words ink, then a gold full stop. F Fraunces 900, "Oscars" in teal (#0c6e6e / #3fc1be). G Plex Mono, "Fantasy" at 600 and "Oscars" at 400.

Size decision: the wordmark does **not** read `h1Size`. The boards set it at 24–32 px on desktop and 19–26 px on phone, below every brand's `h1Size` (32–40). A fixed 32 / 24 keeps the header row stable across brands (D8).

### 4.4 Buttons and icon buttons (chunk 8, step 8C)

#### 4.4.1 Vocabulary (`ui/Button.tsx`)

`ui/Button` sets `data-fo-variant={variant}` on the root, so CSS can tell the semantic variants apart. Mantine's `color` prop is not readable in CSS, and the `!important` skin discards it today: every `color="red"` button renders as secondary.

| Variant                 | Mantine mapping | Use                                                                                                                       |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `primary`               | filled          | The one main action in a region                                                                                           |
| `secondary` (default)   | default         | Other actions                                                                                                             |
| `ghost`                 | subtle          | Low-emphasis actions next to a primary, toolbar actions                                                                   |
| `danger`                | outline         | Opens a destructive flow (Delete season, Delete league, Delete account, Remove participant, admin delete triggers)        |
| **`destructive`** (new) | filled          | Executes an irreversible action, inside the confirmation (`DestructiveActionModal` confirm, `DeleteAccountModal` confirm) |

Transitional Mantine variants keep rendering as today: `filled` → primary, `default`, `outline` and `light` → secondary, `subtle` and `transparent` → ghost. **Call-site migration** in 8C: every `<Button color="red" …>` becomes `variant="danger"`, or `variant="destructive"` when it confirms. Files:

- `SeasonManagementColumn`, `SeasonParticipantsColumn`, `LeagueManagementSection`, `AccountScreen`;
- `DestructiveActionModal` (destructive);
- `DynamicContentEditorHeader`, `AdminCeremonyHomeScreen`, `AdminFilmDuplicatesScreen`, `AdminSafeguardsScreen` (×6), `AdminUsersSearchScreen`;
- the AccountScreen "Logout" `outline` becomes `secondary` "Log out" with a `logout` icon.

`grep -rn 'color="red"' apps/web/src` must then return only Alerts and `ActionIcon` (both are handled by the palette, §4.8).

#### 4.4.2 Skins (S ~1840–1915; one block, `!important` kept where Mantine sets the variable inline)

All variants:

- `--button-radius: var(--brand-button-radius)`;
- body face, weight 600, 14 px;
- height Mantine `sm` (36 px) at 500 px and wider. Below 500 px, scoped to `.page, .auth-page`: `--button-height-xs: 44px; --button-height-sm: 44px; --button-height-md: 44px`, padding unchanged.

| Variant     | Rest                                                                                                                                                                                                                                                 | Hover                                                                     | Active (pressed)                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| primary     | bg `--brand-primary`; label `--brand-on-primary`; border `var(--fo-border-width) solid var(--fo-button-primary-border)`; `box-shadow: 0 calc(3px * var(--brand-deco-offset-shadow)) 0 var(--brand-text)` (a 3 px ink offset in F, nothing elsewhere) | bg `--fo-button-primary-hover`; border `--fo-button-primary-border-hover` | bg `--fo-button-primary-active`; `transform: translateY(calc(var(--fo-press-offset) + 3px * var(--brand-deco-offset-shadow)))`; offset shadow `0 0 0 transparent` (F presses into its shadow) |
| secondary   | bg `--brand-raised`; label `--brand-text`; border `var(--fo-border-width) solid var(--brand-rule-strong)` (was `rule`, 1.2–1.5:1)                                                                                                                    | bg `--brand-sunken`                                                       | `translateY(var(--fo-press-offset))`                                                                                                                                                          |
| ghost       | transparent, transparent border; label `--brand-muted` (unchanged)                                                                                                                                                                                   | bg `--brand-sunken`; label `--brand-text`                                 | press offset                                                                                                                                                                                  |
| danger      | transparent; label and border `--fo-danger-text`                                                                                                                                                                                                     | bg `color-mix(in srgb, var(--fo-danger) 10%, transparent)`                | press offset                                                                                                                                                                                  |
| destructive | bg `--fo-danger`; label `--fo-danger-on`; border `color-mix(in oklab, var(--fo-danger) 80%, black)`                                                                                                                                                  | bg `color-mix(in oklab, var(--fo-danger) 90%, black)`                     | bg `color-mix(in oklab, var(--fo-danger) 82%, black)`; press offset                                                                                                                           |

| State                    | Treatment (every variant)                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus-visible            | Mantine outline, 2 px `--brand-focus-ring`, 2 px offset (unchanged). F's offset shadow sits inside the ring's gap                                                                                                                                                     |
| Disabled                 | 02 M4 (sunken well, `muted` label, `rule` border, no shadow, `not-allowed`). The selector becomes `.mantine-Button-root:disabled:not([data-loading]), .mantine-Button-root[data-disabled]:not([data-loading])`                                                        |
| Disabled with a reason   | The reason is visible text, not a `title` (M9): a `Text variant="helper"` (12 px, `muted`) directly under the button or button group, with an `id`. The button gets `aria-describedby` pointing at it                                                                 |
| Loading (`loading` prop) | The button keeps its variant's fill and border (it is not the disabled well). Mantine's loader is drawn in `--button-color` (the variant's label colour). The label is hidden, width preserved, `cursor: progress`. `ui/Button` adds `aria-busy="true"` while loading |
| Selected or current      | Not a button state. Toggles use `aria-pressed` and the toggle rule in §4.13.7                                                                                                                                                                                         |
| Error                    | Not a button state. A failed action shows its error next to the form (Alert or field error, §4.8)                                                                                                                                                                     |

#### 4.4.3 Icon buttons (`ui/ActionIcon.tsx`)

| Variant         | Rest                                                                                                | Hover                                                      | Disabled                                              |
| --------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| ghost (default) | transparent; icon `--brand-muted`                                                                   | bg `--brand-sunken`; icon `--brand-text`                   | icon `muted` at 50 % opacity, no hover, `not-allowed` |
| secondary       | as the secondary button (raised, `ruleStrong` border)                                               | sunken                                                     | as the disabled button                                |
| danger          | icon `--fo-danger-text` (the red palette mapping, §4.8, makes Mantine's subtle red resolve to this) | bg `color-mix(in srgb, var(--fo-danger) 10%, transparent)` | as ghost disabled                                     |

Size: hit area at least `--fo-control-height` (32 px) on desktop and 44 px below 500 px (scoped to `.page, .auth-page`). The glyph keeps its size; the padding grows. Radius `--brand-button-radius`. Focus-visible: Mantine outline. Every icon button keeps an `aria-label`. Where an icon button's meaning is not obvious, it also gets a Tooltip with the same text.

#### 4.4.4 Phone

Below 500 px, every Button and ActionIcon in the shell and auth layouts is at least 44 px tall. Header icon buttons are 44 × 44 (§4.1) and drawer rows 44 px (§4.2). Groups of buttons in cards keep `wrap="wrap"`, so two 44 px buttons may stack.

#### 4.4.5 Links

Unchanged from 02 M2: Anchors in `link`, underline on hover in `currentColor`, prose always underlined. One addition: `.footer-col-links a:hover { text-decoration-color: currentColor; }` (was `--border`, invisible) (9A).

#### 4.4.6 Indicator (invite count)

`theme/index.ts` sets `Indicator.defaultProps.color` to `"blue"` (rebound to primary) instead of `"yellow"`. S adds `.mantine-Indicator-indicator { color: var(--brand-on-primary); font-weight: 600; font-size: 11px; }`.

### 4.5 Menus (chunk 8, step 8C)

Account menu (`ShellHeader`) and every `ui/Menu` (admin film filter, admin nav dropdowns). The floating-layer skin is unchanged (02 §4.5).

| Piece                                           | Treatment                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account menu content                            | `Menu.Label` with the full username (12 px, `muted`, wraps with `overflow-wrap: anywhere`), then Account (`leftSection` icon `person`), `Menu.Divider`, Log out (icon `logout`, **neutral**). `withinPortal={false}` is unchanged |
| Item                                            | `min-height: 36px`, padding `0 12px`, body face 14 px, colour `text`, radius `--fo-radius-small` (as today), icon 18 px in `muted`                                                                                                |
| Hover and keyboard highlight (`[data-hovered]`) | bg `--brand-sunken`; icon `text`                                                                                                                                                                                                  |
| Focus-visible                                   | Mantine moves `data-hovered` with the arrow keys; no outline inside the menu (the highlight is the cue, as in native menus). The trigger keeps its ring                                                                           |
| Disabled item                                   | colour `muted`, `not-allowed`, no highlight                                                                                                                                                                                       |
| Danger item                                     | colour `--fo-danger-text` (red palette mapping). No current menu has one after this package                                                                                                                                       |
| Divider                                         | `border-color: var(--brand-rule)` (9A rule; harmless in 8C)                                                                                                                                                                       |
| Open trigger                                    | `aria-expanded="true"`; `expand_more` rotates (§4.1)                                                                                                                                                                              |

### 4.6 Type scale: page titles and section titles (chunk 8, step 8C)

| Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Result                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B `.baseline-textHeroTitle` and S `.mantine-Title-root[data-fo-typo="hero"]`: `font-size: var(--fo-heading-h1-size)` (was the fixed 30 px `--fo-font-size-hero-title`)                                                                                                                                                                                                                                                                                                                                      | Page titles: A 32, B 36, C 40, D 40, E 38, F 38, G 32 px on every viewport. This answers 02 §3.1: the hero title wires to `h1Size`; the wordmark does not (§4.3) |
| Section titles take `variant="section"` (h3 size). Today `<Title order={3}>` and `order={4}` without a variant fall back to `page` (h2 size), which is why noir's section headings (32 px) outrank its 30 px page title. Known files: `LeagueSeasonsSection`, `LeagueMembersSection`, `LeagueManagementSection`, `SeasonRulesColumn`, `SeasonParticipantsColumn`, `SeasonDraftRoomColumn`. Also every other `<Title order={3}>` or `order={4}` that has no `variant` or `className` (find them with `grep`) | h1 > h2 > h3 in every brand: A 32/24/18, B 36/28/20, C 40/30/20, D 40/32/22, E 38/28/20, F 38/28/20, G 32/24/16                                                  |
| `--fo-font-size-hero-title` stays (Skeleton heights use it)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | no change                                                                                                                                                        |

Long names: titles wrap. E's Archivo 800 at 38 px and C and D at 40 px wrap "Golden Reel Awards 2035" to two lines at 390. That is expected and causes no overflow (names break at spaces).

### 4.7 Skip link (chunk 8, step 8B)

S `.skip-link`: `box-shadow: none` at rest. `.skip-link:focus { box-shadow: var(--fo-db-skipLink-shadow); }` and `.skip-link:focus-visible { box-shadow: var(--fo-shadow-focusRing), var(--fo-db-skipLink-shadow); }`. Position, transform and colours are unchanged. The hidden link (translated −160 %) no longer paints a 22 px blur into the top-left corner of every page.

### 4.8 Mantine palette, borders, Divider, Skeleton, Alerts, toasts, modal backdrop (chunk 9, step 9A)

#### 4.8.1 Palette mapping

Rebind only Mantine's semantic variant variables, in both mode blocks at the top of S, next to the existing `blue` block. Numbered shades (`--mantine-color-red-6` and so on) are not touched.

| Mantine colour  | `-filled`              | `-filled-hover`                                         | `-light`                                                        | `-light-hover`   | `-light-color`         | `-outline`             | `-outline-hover`                                        | `-text`                | Meaning                                                       |
| --------------- | ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------- | ---------------- | ---------------------- | ---------------------- | ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| `red`           | `--fo-danger-text`     | `color-mix(in oklab, var(--fo-danger-text) 88%, black)` | `color-mix(in srgb, var(--fo-danger) 8%, transparent)`          | same at 14 %     | `--fo-danger-text`     | `--fo-danger-text`     | `color-mix(in srgb, var(--fo-danger) 10%, transparent)` | `--fo-danger-text`     | danger (marks only; destructive buttons use the `ui` variant) |
| `teal`, `green` | `--fo-status-complete` | 88 % black mix                                          | `color-mix(in srgb, var(--fo-status-complete) 8%, transparent)` | 14 %             | `--fo-status-complete` | `--fo-status-complete` | 10 % tint                                               | `--fo-status-complete` | success, complete                                             |
| `yellow`        | `--brand-text`         | `--brand-text`                                          | `--brand-sunken`                                                | `--brand-sunken` | `--brand-text`         | `--brand-text`         | `--brand-sunken`                                        | `--brand-text`         | warning (neutral; §4.8.4)                                     |
| `gray`          | `--brand-rule-strong`  | `--brand-muted`                                         | `--brand-sunken`                                                | `--brand-sunken` | `--brand-text`         | `--brand-rule-strong`  | `--brand-sunken`                                        | `--brand-muted`        | neutral, info                                                 |

Also `--mantine-color-error: var(--fo-danger-text)` in both modes. It drives input error borders and error text (at least 4.67 on `sunken`, the input fill). `--mantine-color-red-filled` is the danger _text_ colour on purpose: the only Mantine reds that remain are marks (toast stripe, Alert border and icon, ActionIcon danger).

#### 4.8.2 Indicator

Mapped to primary (§4.4.6, chunk 8).

#### 4.8.3 Default border and Divider

In both mode blocks, `--mantine-color-default-border: var(--brand-rule)`. Also `.mantine-Divider-root { --divider-color: var(--brand-rule); }` and `.mantine-Menu-divider { border-color: var(--brand-rule); }`. Every Mantine Divider then follows the brand. This replaces Mantine's #dee2e6 and #424242: the season columns, ceremony categories and the drawer.

#### 4.8.4 Alerts and banners (`Alert`, `BannerStackScreen`, `RuntimeBannerStack`, `PageError`)

| Piece                    | Treatment                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root (light variant)     | `background: var(--alert-bg)` (the 8 % tint); `border: 0; border-inline-start: 3px solid var(--alert-color)`; radius `--fo-radius-small`                                                                                                                                                                                                                           |
| Title and message        | `color: var(--brand-text)` (never the tone)                                                                                                                                                                                                                                                                                                                        |
| Icon                     | `--alert-color`. Every alert and banner gets an icon by variant, passed as the `icon` prop: info `info`, warning `warning`, success `check_circle`, error `error`. Banner variants map through `decisions/chrome/bannerColor.ts`: warning → `yellow` (neutral; the comment "closest to our brand gold" is removed), success → `teal`, error → `red`, info → `gray` |
| Close button             | ghost icon button, label "Dismiss announcement" (unchanged), 44 px below 500                                                                                                                                                                                                                                                                                       |
| Request id (`PageError`) | `muted`, monospace not required                                                                                                                                                                                                                                                                                                                                    |

Warning is neutral: an ink border and a `warning` icon, with no new hue. Every free warm hue is already taken: gold means won, cherry means live, `#b34b42` means danger, and E and F use laurel and cherry as primaries. The icon and the words carry the warning.

#### 4.8.5 Toasts

Stripe colours follow §4.8.1:

- error: `--fo-danger-text`;
- success: laurel;
- warning: ink.

Info toasts get `color="gray"` in `notifications/notify.ts` (today they are undefined and fall back to the brand primary, which is cherry in F). The confirm-draft-pick toast keeps the primary stripe, because it is a call to action. The title is `text`, the description `muted` (02 M8).

#### 4.8.6 Skeleton

`.mantine-Skeleton-root::after { background-color: var(--brand-rule); }` in both modes (was Mantine gray-3 / dark-4). The fade animation is unchanged and clamped by reduced motion.

#### 4.8.7 Modal backdrop

Remove the blur in every brand:

- `theme/index.ts`: `Modal.defaultProps.overlayProps = { opacity: FO_MODAL_OVERLAY_OPACITY }`;
- delete `FO_MODAL_OVERLAY_BLUR_PX`;
- the opacity stays 0.3.

Reasons:

- The blur is ornamental and costs a `backdrop-filter` repaint on low-end phones.
- In the flat and ring brands (C, D, F, G) it reads as a soft-focus effect foreign to their look.
- The modal's overlay ring (02 §4.5) already separates the layer in dark mode.
- A per-brand value would need a slot for no functional gain.

### 4.9 Cards and surfaces (chunk 9, step 9A)

| Element                                                                             | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.baseline-card` (StandardCard, ActionCard, HeroCard, updates card)                 | `border-radius: var(--fo-radius-medium)` (was small): A 12, B 6, C 0, D 0, E 16, F 18, G 0. Controls keep `radius-sm`, so containers are a step rounder than the buttons and inputs inside them, as on every board                                                                                                                                                                                                                                                                             |
| Card states                                                                         | Rest: `--brand-shadow-card`. Hover (interactive): the 8 % ink mix and `--brand-shadow-raised` (unchanged). Focus-visible: 2 px ring with 4 px offset (02 §4.2). Active: press offset. Non-navigable cards are not interactive (unchanged)                                                                                                                                                                                                                                                      |
| `.card` and Mantine `Card` (guard error cards)                                      | `background: var(--brand-raised); border: 0; box-shadow: var(--brand-shadow-card); border-radius: var(--fo-radius-medium)`. They now look like the baseline cards in every brand (C, F and G get their ink edge)                                                                                                                                                                                                                                                                               |
| Nested cards (`tone="nested"`)                                                      | unchanged (`sunken`). 02 §3.0c's E rule stands                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Admin panels (`.wizard-panel`, `.admin-next-step`)                                  | unchanged in this package                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Empty states** (new `EmptyState` primitive in `primitives/`, one prop `children`) | `border: var(--fo-border-width) dashed var(--brand-faint); border-radius: var(--fo-radius-medium); padding: var(--fo-space-sm); color: var(--brand-muted); font-size: 14px`. `faint` is decorative, which is its contract role. Replaces the plain `Text` in: "No leagues yet.", "No seasons yet.", "No pending invites.", "No active seasons yet.", "No updates have been published yet.", "No past ceremonies yet.", and "No nominees." (ceremony detail and draft plans). Wording unchanged |
| Loading                                                                             | Skeleton tone, §4.8.6. Layout unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### 4.10 Decorations (chunk 9, step 9A, plus the nav rule in 8B)

| Decoration (slot)                                                                    | Where it renders                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section rule (`ruleStyle`, `doubleRules`, `frameBorders` via `--brand-section-rule`) | `.site-nav` bottom (8B). `.site-footer { border-top: var(--brand-section-rule); }` (9A). `.dr-header { border-bottom: var(--brand-section-rule); }` (9C). C: 3 px double ink. G: 1 px ink. The others are unchanged (1 px `rule`; F 2 px) |
| Offset shadow (`offsetShadow`, F)                                                    | Primary buttons (8C), the buckle (9C). Cards already carry it through `shadow-card`                                                                                                                                                       |
| Frame borders (`frameBorders`, G)                                                    | The ink section rule (above). Cards carry the black frame through `shadow-card`                                                                                                                                                           |
| Grease pencil (`greasePencil`, G)                                                    | Not here: it is a Home ornament (chunk 10)                                                                                                                                                                                                |

`rule-style: double` is not applied to Mantine Dividers inside cards. Dividers stay 1 px `rule`, so C does not stack double rules inside columns.

### 4.11 Label families and letter-spacing (chunk 9, step 9A)

01 §4.3 left this per family. The decision:

| Family                                                                                                                                                                   | Face                      | Case                 | Tracking                                 | Weight    | Why                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------- | ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1 Shell eyebrows: `.footer-col-title`, `[data-fo-typo="chromeHeading"]`, `.eyebrow`, `.nav-section`, `.nomination-group-title`, `.category-count`                       | `var(--brand-font-label)` | `--brand-label-case` | `var(--brand-label-letter-spacing)`      | 600       | These are the labels the boards style per brand (B tracked, C and G mono, E and F sentence case)                                                                                                                                                                                                                                     |
| L2 Chips: status, role, winner (§4.12)                                                                                                                                   | same as L1                | same                 | same                                     | 600       | Same family on the boards                                                                                                                                                                                                                                                                                                            |
| L3 Draft room labels: buckle Round/Pick (`.drh-buckleLabel`), kicker (`.drh-buckleCenterType`), `.drm-miniLabel`, `.dr-railPaneTitle`, `.dr-railMeta`, `.fo-tip-barText` | body face (unchanged)     | `--brand-label-case` | fixed `--fo-letterSpacing-*` (unchanged) | unchanged | The draft header measures itself, and these are 9–12 px. Plex Mono widens them by about 25 %, so "Draft history" in the rail header and "Round" in the buckle would clip in C and G. 02 §3.12 keeps display faces off the board for the same reason. This answers the "lightbox rail labels" item: the mono face does not reach them |
| L4 Form labels                                                                                                                                                           | body                      | none                 | normal                                   | 400       | unchanged                                                                                                                                                                                                                                                                                                                            |
| L5 Navigation                                                                                                                                                            | nav slots (§4.2)          | nav case             | `--brand-nav-letter-spacing`             | 600       | –                                                                                                                                                                                                                                                                                                                                    |

Resulting L1 and L2 values:

| Brand | Face          | Case      | Tracking |
| ----- | ------------- | --------- | -------- |
| A     | Inter         | uppercase | 0.1em    |
| B     | DM Sans       | uppercase | 0.12em   |
| C     | IBM Plex Mono | uppercase | 0.08em   |
| D     | Inter         | uppercase | 0.12em   |
| E     | Archivo       | none      | 0em      |
| F     | Fraunces      | none      | 0em      |
| G     | IBM Plex Mono | uppercase | 0em      |

The `--fo-letterSpacing-*` scale remains for L3 only.

### 4.12 Status, role and winner chips (chunk 9, step 9B)

#### 4.12.1 Tone decision (new, pure: `decisions/statusTone.ts`, with unit tests)

`statusTone(label) → { tone: "drafting" | "complete" | "live" | "neutral"; mark: "dot" | "pause" | "check" | null }`. It is keyed on the label unions the existing decisions return. The owner's mapping (2026-10-30) is applied.

| Source decision (screen)                                         | Label                    | Tone     | Mark  |
| ---------------------------------------------------------------- | ------------------------ | -------- | ----- |
| `computeSeasonProgression` (season page header)                  | Pre-draft                | neutral  | –     |
|                                                                  | Drafting                 | drafting | dot   |
|                                                                  | Paused                   | drafting | pause |
|                                                                  | Draft complete           | complete | check |
|                                                                  | Closed                   | neutral  | –     |
| `computeSeasonLifecycleLabelFromRow` (league detail rows)        | Pre-draft, Closed        | neutral  | –     |
|                                                                  | Drafting                 | drafting | dot   |
|                                                                  | **Paused** (new, M17)    | drafting | pause |
|                                                                  | Draft complete, Complete | complete | check |
|                                                                  | In progress              | live     | dot   |
| `buildSeasonIndexCards` (seasons index)                          | Open, Closed             | neutral  | –     |
|                                                                  | Drafting                 | drafting | dot   |
|                                                                  | **Paused** (new, M17)    | drafting | pause |
|                                                                  | Complete                 | complete | check |
| `computeLandingSeasonStatus` (landing and Home "Active seasons") | Draft Live               | drafting | dot   |
|                                                                  | Draft Paused             | drafting | pause |
|                                                                  | Draft Complete           | complete | check |
|                                                                  | Draft Not Started        | neutral  | –     |

Cherry `live` is reserved for ceremony night. Its only mapped label is "In progress", which no current data produces (`season.status` is `EXTANT` or `CANCELLED`). No captured cell renders cherry. The tone is defined so a later ceremony-night label needs no new design.

#### 4.12.2 Chip construction (`shared/pills.tsx` `StatusPill`, `.fo-chip`; replaces `.pill`, `.status-pill` and `.baseline-statusPill` styling)

`<StatusPill tone mark>{label}</StatusPill>`. Glue computes `statusTone(label)` and passes it. `LandingScreen` and `SeasonsIndexScreen` switch from the bare `baseline-statusPill` span to `StatusPill`.

| Property                                       | Value                                                                                                                                                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Box                                            | `display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; white-space: nowrap; max-width: 100%`. Radius `var(--fo-radius-small)`: A 10 and E/F 12 read as pills, B 4, C, D and G square, matching the boards |
| Fill                                           | `--brand-sunken`                                                                                                                                                                                                                       |
| Border                                         | `var(--fo-border-width) solid` + tone colour (`--fo-status-drafting`, `-complete`, `-live`), or `--brand-rule-strong` for neutral                                                                                                      |
| Label                                          | L2 family (§4.11), 12 px, weight 600; colour `--brand-text` (toned) or `--brand-muted` (neutral). Overflow: ellipsis                                                                                                                   |
| Mark                                           | `dot`: an 8 px circle (`::before`, `background: currentColor` of a tone-coloured wrapper; not an icon font). `pause` and `check`: Material glyph at 14 px (`mi-icon-tiny`), `aria-hidden`. Colour = tone                               |
| States                                         | Static: no hover, focus or disabled. The landing chip loses its focusable `tabIndex` and its Tooltip (M16)                                                                                                                             |
| Role chip ("Commissioner", `CommissionerPill`) | neutral tone, no mark, same construction                                                                                                                                                                                               |
| Admin `.status-pill`, `.pill`, `.pill.muted`   | neutral construction (no tone). Admin ceremony statuses are outside the owner's mapping                                                                                                                                                |

Every chip carries its text label (02 a2 guard). Tone is never the only cue: the mark shape differs (dot, pause bars, check, none) and the word says the state.

#### 4.12.3 Where chips appear

- Season page header (`SeasonDashboardHeader`): `season-live` "Drafting" in teal, `season-completed` "Draft complete" in laurel with a check, `season-pending` "Pre-draft" neutral.
- League detail season rows.
- Seasons index cards.
- Landing / Home "Active seasons" (`home-logged-in`: "Draft live" in teal with a dot, "Draft not started" neutral).
- Season participants: the role chip.

#### 4.12.4 Ceremony winner chip (`CeremonyDetailScreen`; 01 deferred it)

The icon-only star (codepoint 0xe838 is `star`, not the trophy its comment names) is replaced with a chip: `<span class="fo-chip fo-chip--winner"><span class="mi-icon mi-icon-tiny" aria-hidden="true">emoji_events</span>Winner</span>`. It uses the §4.12.2 box and label family, with:

- fill `--fo-win-gold`;
- border `color-mix(in srgb, var(--fo-win-gold) 65%, transparent)` (as the won pill);
- label and glyph `--fo-win-gold-on`.

The nominee name stays bold. The chip sits at the end of the row, where the star was, and wraps under long names (`wrap="wrap"`, unchanged). "Gold means won" now holds on the results page too.

#### 4.12.5 Account details (M17)

`AccountScreen` renders username and email as `Text className="baseline-textBody"` with `overflow-wrap: anywhere`, not as chips (`baseline-statusPill`). That fixes the 390 px overflow from the 61-character username. Remove `"account"` from `KNOWN_PHONE_OVERFLOW`.

### 4.13 Draft room (chunk 9, step 9C)

#### 4.13.1 Board pills (beyond 02 §4.1)

| State                                           | Change                                                                                                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default (`.dr-pill`)                            | `background: var(--brand-raised)` (was transparent); border `var(--fo-border-width) solid var(--fo-border)` (unchanged); label `--brand-text`, weight **500** (was `muted`, 400). This is the boards' default pill: ink on a chip |
| Hover (my turn)                                 | 02 rule (`ruleStrong` border, lift); the label is already 500, so hover changes border and lift only                                                                                                                              |
| Armed, hover-match, winner, combinations, focus | 02 §4.1, unchanged. Hover-match's 10 % ink tint now sits over `raised`                                                                                                                                                            |
| Muted (drafted)                                 | opacity 0.5 (unchanged). Ink at 50 % measures 3.25–4.87 against `raised`                                                                                                                                                          |
| Pending                                         | dashed (unchanged)                                                                                                                                                                                                                |
| Static (`dr-pill-static`, rails and roster)     | same default                                                                                                                                                                                                                      |

#### 4.13.2 Category and roster cards (`.dr-card`)

- `background: var(--brand-raised)` (was a 3 % ink tint).
- `border: var(--fo-border-width) solid transparent`: the geometry is kept exactly, so masonry height estimates do not move.
- `box-shadow: var(--brand-shadow-card)`.
- `border-radius: var(--fo-radius-medium)`.
- A: white card with a beige ring and soft shadow. C and G: ink frame. F: 2 px ink outline with a 5 px offset. E: flat tile.
- Title rows are unchanged.
- **Roster win count** (`.dr-rosterWinCount`): `font-family: var(--brand-font-numeral); font-size: 16px; font-weight: 700; line-height: 1; color: var(--brand-text)` (was 12 px `muted`). The boards show the win count as the brand's numeral.

#### 4.13.3 Buckle (`.drh-buckle`, `CenterBuckle`)

| Aspect             | Rule                                                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fill               | Flat `var(--drh-buckle-base)`. Delete the top-to-bottom gradient and the `::before` highlight                                                                                                                                                                                                                              |
| Shape              | `border-radius: var(--brand-button-radius)` (A 10, B 4, C/D/G 0, E pill, F 12)                                                                                                                                                                                                                                             |
| Edge and depth     | `box-shadow: var(--brand-shadow-raised), 0 calc(4px * var(--brand-deco-offset-shadow)) 0 var(--brand-text)`. Replaces the black contact shadow and the inset highlights. A gets its warm ring and soft shadow, B and D a `ruleStrong` ring, C and G a 2 px ink ring, F a 2 px ink ring with the 4 px poster offset, E none |
| Neutral states     | Not started, others' turn, paused and draft complete: base `--brand-sunken` (was `raised`, or `sunken` for pre)                                                                                                                                                                                                            |
| My turn            | base `--brand-primary`, ink `--brand-on-primary` (unchanged)                                                                                                                                                                                                                                                               |
| Final results      | win gold, silver, bronze with `--fo-win-gold-on` (unchanged)                                                                                                                                                                                                                                                               |
| Paused             | Centre "Paused" preceded by a 14 px `pause` glyph (`aria-hidden`) in `currentColor`. Commissioner's Resume control unchanged                                                                                                                                                                                               |
| Countdown          | §4.13.6                                                                                                                                                                                                                                                                                                                    |
| Ties, rolling      | unchanged                                                                                                                                                                                                                                                                                                                  |
| Typography, widths | unchanged: body face, `--fo-db-*` sizes, the fixed 140 px timer width, measured wings                                                                                                                                                                                                                                      |

#### 4.13.4 Draft header

- `.dr-header` bottom border: `--brand-section-rule` (C double ink, G ink).
- Draft header icon buttons (`.theme-toggle`, `.drh-pause`, the stowaway settings trigger, `.dr-railClose`, `.dr-railToggle`):
  - radius `--brand-button-radius`;
  - hover background `--brand-sunken`;
  - focus-visible 2 px `--brand-focus-ring` with 2 px offset. For `.dr-railToggle`, which fills its rail, the ring is inset with −2 px offset; this replaces the neutral 24 % ring.
- Box sizes are unchanged. The draft header stays borderless (D12) because its wings measure themselves.

#### 4.13.5 Rails

Geometry, colours and the stub icons are unchanged.

- Pane titles use one wording on desktop and phone: "Draft history", "My roster", "Auto-draft" (`MobileRail` has "Draft History", "My Roster", "Auto-Draft"). The label case still uppercases them in A–D and G.
- Rail meta (round-pick) stays in the L3 family.
- The collapsed stub shows an icon, not text, so no label measures inside it.

#### 4.13.6 Countdown urgency: the non-colour cue (gate for E and F)

Today the last 5 seconds are signalled by a colour pulse (primary ↔ `#b34b42`) and beeps. That is hue-only in E and F (1.23 and 1.06:1). Three cues are added that never change between phases and survive reduced motion:

1. **Text.** In countdown, the buckle centre (desktop) and `.drm-clockText` (phone) show `"{n}s left"` (n = 5…1), from a new pure `formatCountdownText(remainingMs)` in `decisions/draft/countdown.ts` (`Math.ceil(ms / 1000)`). This replaces `"{N}s • {n}s left"`. The buckle keeps its fixed 140 px timer width, so nothing resizes.
2. **Glyph.** A 16 px `timer` Material glyph (`aria-hidden`) before the text, in the current ink (`onPrimary` in the primary phase, `--fo-danger-on` in the danger phase).
3. **Ring.** An inner 2 px ring in the same ink: `inset 0 0 0 2px var(--drh-urgent-ink)` layered first on `.drh-buckle.is-countdown` and `.dr-mobileBar.is-countdown`. `--drh-urgent-ink` is `--brand-on-primary` in `pulse-gold` and `--fo-danger-on` in `pulse-red`. It contrasts with the fill (≥ 4.94, §3.3.4), and its shape is the cue whatever the hues.

Screen readers: on the false-to-true transition of `countdownActive` (my turn only), `DraftLiveRegion` announces "5 seconds left to pick." once (`decisions/draft/announcements.ts`). The beep and pulse are unchanged. Optional and recommended: move the duplicated phase logic of `DraftBoardHeader` and `MobileDraftHeader` into one `useCountdownPhase` hook in `orchestration/draft/`.

#### 4.13.7 Toggles in the draft header (`DraftHeaderRightWing`)

- Sound and cursor-spy become toggle buttons with stable names and `aria-pressed`:
  - "Draft sounds" (`volume_up` when on, `volume_off` when off);
  - "Cursor spy" (`visibility` / `visibility_off`).

  Tooltips show "Draft sounds: on" / "off".

- Pressed state: background `--brand-sunken` with a 1 px `ruleStrong` inner ring. Not pressed: transparent.
- "Show drafted" `Switch` gets its text as its `label` prop. The adjacent `Text` is removed, so the switch has an accessible name.
- In the compact settings menu: "Toggle theme" → "Switch to light mode" / "Switch to dark mode", and the sound and cursor-spy items read "Draft sounds: on/off" and "Cursor spy: on/off".
- Start, pause and resume stay an icon button. It gets a Tooltip with its existing `aria-label` ("Start draft", "Pause draft", "Resume draft").

#### 4.13.8 SegmentedControl and Switch (all screens; the draft header is their only captured reader)

- **SegmentedControl:**
  - root `--brand-sunken`, radius `--brand-button-radius`;
  - indicator `--brand-raised` with `box-shadow: 0 0 0 var(--fo-border-width) var(--brand-rule-strong)`;
  - active label `text` 600; inactive `muted`; hover label `text`;
  - focus-visible: 2 px ring on the label of the focused input;
  - disabled: labels `muted` at 50 %, `not-allowed`.
- **Switch:**
  - unchecked: track `--brand-sunken` with a 1 px `ruleStrong` border; thumb `--brand-raised` with a `ruleStrong` ring;
  - checked: track `--brand-text`; thumb `--brand-page`;
  - focus-visible: 2 px ring;
  - disabled: 50 % opacity.

  Checked and unchecked differ by position and by an ink versus a light track, never by brand hue. This matches the checkbox (ink check on a neutral box).

#### 4.13.9 Phone draft room

- My-turn bar: full-width `primary` (unchanged).
- Countdown: the ring, glyph and text of §4.13.6 on the bar.
- Paused: "Paused" with the pause glyph.
- Category cards and pills follow §4.13.1–2.
- The bottom nav buttons are unchanged (already 52 × 40, inside a 52 px bar).
- The nominee card modal is unchanged apart from the backdrop blur (§4.8.7).

### 4.14 Admin wizard stepper contrast (chunk 9, step 9B)

The thin primary marks become ink, as 02 M9 did for the done check:

- `.wizard-step.is-active::before`, `.wizard-step.connector-gold` (renamed `.connector-progress`) and `.is-incomplete.is-progress` (ring and glyph) read `--brand-text`.
- Complete and locked steps keep the primary fill with the `onPrimary` glyph. The glyph carries the state, as accepted for the checkbox.
- This removes the 1.98:1 ring in A light (and 1.86 in B light).

### 4.15 Overflow at 390 (chunk 9, step 9B)

- `draft-plans`. Below 500 px:
  - `.draft-plans-controls { flex-direction: column; align-items: stretch; }`;
  - `.draft-plans-selectWrap { width: 100%; min-width: 0; }`;
  - `.draft-plans-actions { margin-left: 0; }`, with the group set to `wrap="wrap"` and each button `flex: 1 1 auto`;
  - `.draft-plan-row` and its direct children get `min-width: 0`, so the label truncates instead of widening the row.

  "Download" and "Upload" sit side by side under the plan field, full width. Remove `"draft-plans"` from `KNOWN_PHONE_OVERFLOW`; the existing phone guard then protects it.

- `account`: §4.12.5.

## 5. Deviations from the mockups

| #   | Deviation                                                                                                                                                                      | Reason                                                                                                                                                  | Designer?          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| D1  | Phone keeps the nav drawer; the boards show a horizontally scrolling nav row                                                                                                   | The drawer also holds Account and Log out and the conditional Admin link; scrolling rows hide links off-screen; changing it is information architecture | Yes (b3)           |
| D2  | Header controls take the brand card edge (`shadow-card`), so F's controls carry its 5 px offset; the F board shows them without                                                | One construction for every brand without a new "control edge" slot; F's primary buttons have an offset on the board too                                 | No                 |
| D3  | A keeps the underline (accent ink) rather than the beige active pill                                                                                                           | The pill is 1.07:1 against the page (02 D7)                                                                                                             | No                 |
| D4  | The underline is 2 px in every underline brand (D and G boards: 3 px)                                                                                                          | One rule; 2 px already passes                                                                                                                           | No                 |
| D5  | D's nav tracking is 0.12em (its label tracking; board 0.04em)                                                                                                                  | 02 D13 reuses `labelLetterSpacing` for uppercase nav instead of a new slot                                                                              | No                 |
| D6  | The first word of the wordmark is `text` in every brand, including F (board: cherry)                                                                                           | 02 D15; also resolves E dark (3.00)                                                                                                                     | No                 |
| D7  | E's gold full stop is the gold ink #8a6a14 in light (board #D4AF37, 2.10:1)                                                                                                    | A 6 px dot at 2:1 nearly disappears on white                                                                                                            | No                 |
| D8  | The wordmark is a fixed 32 / 24 px, not `h1Size`                                                                                                                               | Boards show it below `h1Size` in every brand; a fixed size keeps the header stable                                                                      | No                 |
| D9  | Buttons use the body face in sentence case (boards: Archivo, Fraunces, Plex Mono for E, F, G; uppercase tracked Inter for D)                                                   | Labels such as "View draft results" must fit 390; a per-brand button face would need a new `type.buttonFont` slot                                       | Yes (b2)           |
| D10 | Status chips in colour (boards show only the neutral "Closed")                                                                                                                 | Owner mapping (2026-10-30); construction keeps text and a mark                                                                                          | Yes (b4)           |
| D11 | The buckle keeps the body face and small type; its shape and edge come from the brand (boards show "Draft complete" in the display face at 22–28 px)                           | The header measures itself and carries about ten states; display faces would break the measurement (02 §3.12)                                           | Yes (b1)           |
| D12 | Draft header icon buttons stay borderless (boards: bounded 40 px boxes)                                                                                                        | The measured wings have no room for a 1–2 px edge on every control                                                                                      | No                 |
| D13 | The roster win count is `text` in the numeral face (boards: gold, laurel or cherry)                                                                                            | Laurel and cherry are status hues; gold on a count next to gold winning pills would blur "won"                                                          | No                 |
| D14 | E's default pills have a raised fill and a `rule` border (board: white, borderless)                                                                                            | One pill construction; E's hover-match keeps its border cue                                                                                             | No                 |
| D15 | Page titles are 32–40 px (`h1Size`), not 44–60 px                                                                                                                              | App titles hold user content and must fit 390 (02 D11)                                                                                                  | No                 |
| D16 | Draft room labels keep the body face and fixed tracking                                                                                                                        | §4.11 L3                                                                                                                                                | No                 |
| D17 | D's 2 px white rules under section titles and G's grease-pencil ring are not rendered                                                                                          | No slot for the first; the second is a Home ornament (chunk 10)                                                                                         | No                 |
| D18 | The modal backdrop has no blur in any brand                                                                                                                                    | §4.8.7                                                                                                                                                  | No                 |
| D19 | Warning is neutral (ink border and icon), not amber                                                                                                                            | §4.8.4: every warm hue already means something                                                                                                          | No                 |
| D20 | The owner decision "the wordmark stays primary and two-tone" is read as "it stays the primary identity mark and is always two-tone", not "it is coloured in `--brand-primary`" | The boards colour the tone from gold, accent or italic, and primary is ink in C, D and G; P2 implements the boards                                      | No (owner sees a1) |

## 6. Acceptance per screenshot

**Rules for both chunks:**

- Every cell not listed for a chunk must match its baseline (`maxDiffPixels: 0`).
- Triage compares regions. When the header changes height, everything below shifts. The triage script should first search for a pure vertical offset of the region below the header band (cropped compare, offset −20…+20 px). A cell whose lower region matches after the offset counts as **expected (shifted)**, not **unexpected**.
- Contrast is measured numerically, never by eye.

Region names used below:

- **header band**: the skip-link corner, wordmark row and nav row, including the nav rule;
- **title band**: page title, subtitle and status chip;
- **content**: cards, columns and buttons;
- **footer band**;
- for the draft room: **draft header**, **board** and **rails**.

### 6.1 Chunk 8 (steps 8A–8C)

8A changes no pixels. The visual suite must be green with zero diff after it.

| Group | Cells                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Regions                               | What the reviewer sees                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1    | Every shell cell. Refined-gold: `home-logged-out`, `home-logged-in`, `home-new-user`, `leagues-list`, `leagues-empty`, `league-detail`, `season-live`, `season-completed`, `season-pending`, `draft-plans`, `ceremonies-index`, `ceremony-detail`, `ceremony-detail-results`, `account`, `admin-home`, `admin-films`, `admin-ceremony-nominees`, `not-found` (all four cells each). New brands: `home-logged-out`, `home-logged-in`, `league-detail`, `season-live`, `ceremony-detail-results`, `account` (four each) | header band; everything below shifted | Wordmark in the brand's wordmark face, first word in ink and the second word per §4.3 (A and B gold ink, C italic, D gold uppercase, E ink with a gold full stop, F teal, G lighter weight). Header controls are bounded boxes in the brand's card edge and button radius (E circles, C, D and G squares): 40 px on desktop, 44 px on phone. Invites shows a mail glyph. The account trigger shows avatar, username and an `expand_more` chevron. Desktop nav in the nav face and size (C mono uppercase, B tracked uppercase, D condensed uppercase 20 px), muted inactive labels, the current page in ink with a 2 px underline in the P1 colour (A gold ink, B and C gold, D ink, G cherry) or a filled pill (E ink, F cherry with an ink edge). Nav rule under the row (C double ink, G ink, none in E and F). Phone: open-navigation, wordmark at 24 px (may wrap), theme and invites as 44 px boxes. No grey smudge in the top-left corner. Nothing else in the page changes apart from the vertical offset |
| H2    | `login`, `register` (refined-gold, four each); `login` (new brands, four each)                                                                                                                                                                                                                                                                                                                                                                                                                                        | auth header; form shifted             | Auth wordmark per §4.3; theme toggle as a header icon box; the submit button with the brand button radius, 44 px tall on phone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| H3    | `home-logged-out` (all brands, desktop only: inline nav mode)                                                                                                                                                                                                                                                                                                                                                                                                                                                         | header band                           | Signed out: theme box, "Create account" (ghost) and "Log in" (secondary, `ruleStrong` border) on the right                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| T1    | Every cell with a page title (all H1 and H2 cells except `home-*`, whose hero title is in the hero card)                                                                                                                                                                                                                                                                                                                                                                                                              | title band (and shift)                | Page title at `h1Size`: A 32, B 36, C 40, D 40, E 38, F 38, G 32 px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| T2    | `home-logged-out`, `home-logged-in`, `home-new-user` (refined-gold four each, new brands for the first two)                                                                                                                                                                                                                                                                                                                                                                                                           | hero card                             | Hero title at `h1Size` instead of 30 px; the rest of the hero composition unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| T3    | `league-detail`, `season-live`, `season-completed`, `season-pending` (refined-gold four each; new brands `league-detail`, `season-live`)                                                                                                                                                                                                                                                                                                                                                                              | content                               | Section titles ("Seasons", "Members", "Management", "Rules", "Participants", "Draft room") at the h3 size, clearly smaller than the page title. **Noir:** "SEASONS" (22 px) below "FRIDAY NIGHT FILM CLUB" (40 px)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B1    | Cells with buttons: `home-logged-in`, `home-new-user` (New league), `league-detail`, `season-*`, `draft-plans`, `account`, `admin-*`, `login`, `register` (refined-gold); `home-logged-in`, `league-detail`, `season-live`, `account`, `login` (new brands)                                                                                                                                                                                                                                                           | content                               | Buttons in `--brand-button-radius` (A 10, B 4, C, D and G 0, E pill, F 12). Secondary buttons have a visible `ruleStrong` border. F's primary buttons sit on a 3 px ink offset. On phone, buttons are 44 px tall                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B2    | `season-live` (avery, commissioner, drafting) all its brands                                                                                                                                                                                                                                                                                                                                                                                                                                                          | content                               | "Manage participants" and "Adjust draft settings" are disabled wells with one helper line beneath: "Participants and draft settings are locked once drafting starts." "Delete season" is a red outline (danger) button. "Draft plans" is ghost                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B3    | `league-detail` (avery is commissioner) all its brands; `account` all its brands                                                                                                                                                                                                                                                                                                                                                                                                                                      | content                               | "Delete league" and "Delete account" are red outline buttons. Account "Log out" is a secondary button with a `logout` glyph                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B4    | `season-completed` (blake), `season-pending` (avery)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | content                               | `season-pending`: management buttons enabled (secondary); no helper line. `season-completed`: CTA "View results" or "View draft results" primary; any locked control carries its visible reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S1    | Every draft cell: `draft-live-your-turn`, `draft-live-not-your-turn`, `draft-live-armed`, `draft-live-hover-match`, `draft-live-focus-disabled`, `draft-completed` (refined-gold), and `draft-live-your-turn`, `draft-completed`, `draft-live-armed` (new brands)                                                                                                                                                                                                                                                     | top-left corner only                  | The skip link's grey smudge is gone. **Nothing else in any draft cell changes in chunk 8**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Brand-specific header checks (H1, desktop and phone, both modes):

| Brand | Light                                                                                                                                             | Dark                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A     | Cinzel "Fantasy" ink, "Oscars" #7f6111; underline #7f6111; 10 px boxes, white with a beige ring                                                   | "Oscars" #e2c25a; underline #e2c25a                                                         |
| B     | Cinzel, "Oscars" #8a6a14; DM Sans 13 px uppercase tracked nav; 4 px boxes                                                                         | "Oscars" and underline #e2c25a on near-black                                                |
| C     | Bodoni, "Oscars" italic and lighter; Plex Mono 12 px uppercase nav; underline #8a6a14; 3 px double ink rule under the nav; square ink-edged boxes | ivory ink, double ivory rule, underline #e2c25a                                             |
| D     | Barlow uppercase "FANTASY OSCARS", "OSCARS" #8a6a14; Barlow 20 px uppercase nav with an ink underline; square boxes                               | "OSCARS" #e2c25a; white underline                                                           |
| E     | Archivo 900 "Fantasy Oscars" in ink with a #8a6a14 full stop; Archivo pill nav, current page an ink pill with white text; round boxes, flat       | ivory wordmark (no longer laurel), #e2c25a stop; current page an ivory pill with black text |
| F     | Fraunces 900, "Oscars" teal #0c6e6e; current page a cherry pill with a 2 px ink edge; 12 px boxes with an ink outline and offset                  | "Oscars" #3fc1be; cream outlines                                                            |
| G     | Plex Mono "Fantasy" 600 / "Oscars" 400; Plex nav, cherry #b8213a underline; 1 px ink rule; square black-framed boxes                              | underline #f0566a                                                                           |

### 6.2 Chunk 9 (steps 9A–9C)

| Group | Cells                                                                                                                                                                                                               | Regions                                                     | What the reviewer sees                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1    | Every full-page shell cell whose capture reaches the footer (all H1 cells where the footer is inside the 2400 px cap)                                                                                               | footer band                                                 | Footer column titles in the label family: A Inter 0.1em, B DM Sans 0.12em, C Plex Mono, D Inter 0.12em, E Archivo and F Fraunces in sentence case, G Plex Mono. C: 3 px double ink rule above the footer. G: 1 px ink rule. Others: rule unchanged                                                                                                                                                                                  |
| K1    | Cells with baseline cards: `home-*`, `leagues-list`, `league-detail`, `season-*`, `ceremonies-index`, `ceremony-detail*`, `draft-plans`, `account`, `admin-*` (refined-gold); key screens for new brands            | content (card corners only)                                 | Card corners at `radius-md`: A 12 (was 10), B 6 (was 4), E 16 (was 12), F 18 (was 12). C, D and G stay square, with no change in those brands                                                                                                                                                                                                                                                                                       |
| K2    | `leagues-empty`, `home-new-user` (refined-gold four each), and any cell showing an empty line                                                                                                                       | content                                                     | The empty message sits in a dashed `faint` box with muted text; wording unchanged                                                                                                                                                                                                                                                                                                                                                   |
| K3    | `season-*`, `ceremony-detail`, `ceremony-detail-results` (all their brands)                                                                                                                                         | content (dividers)                                          | Divider lines in the brand `rule` colour (no Mantine grey)                                                                                                                                                                                                                                                                                                                                                                          |
| C1    | `season-live` (all brands)                                                                                                                                                                                          | title band                                                  | Status chip "Drafting" (uppercase except E and F) with a teal dot and teal border on the `sunken` fill, label in ink; chip shape from `radius-sm`                                                                                                                                                                                                                                                                                   |
| C2    | `season-completed`, `season-pending` (refined-gold four each)                                                                                                                                                       | title band                                                  | "Draft complete" with a laurel check and border; "Pre-draft" neutral (`ruleStrong` border, muted label, no mark)                                                                                                                                                                                                                                                                                                                    |
| C3    | `league-detail` (all brands)                                                                                                                                                                                        | content                                                     | Season rows carry toned chips per §4.12.1                                                                                                                                                                                                                                                                                                                                                                                           |
| C4    | `home-logged-in` (all brands)                                                                                                                                                                                       | content (Active seasons)                                    | "Draft live" teal with a dot (no longer a filled primary chip); "Draft not started" neutral                                                                                                                                                                                                                                                                                                                                         |
| C5    | `season-live`, `season-pending` (participants column)                                                                                                                                                               | content                                                     | "Commissioner" role chip in the neutral construction and label family                                                                                                                                                                                                                                                                                                                                                               |
| C6    | `ceremony-detail-results` (all brands)                                                                                                                                                                              | content                                                     | Each winning nominee has a gold "Winner" chip with a trophy glyph (`emoji_events`), black text, identical hue in every brand; no star glyph remains                                                                                                                                                                                                                                                                                 |
| C7    | `account` (all brands); phone cells                                                                                                                                                                                 | content                                                     | Username and email as plain text; the 61-character name wraps inside the card; `scrollWidth <= 390` (guard now active)                                                                                                                                                                                                                                                                                                              |
| C8    | `draft-plans` light-mobile, dark-mobile                                                                                                                                                                             | content                                                     | Plan field full width; "Download" and "Upload" side by side below it, both fully visible; rows truncate; `scrollWidth <= 390` (guard now active)                                                                                                                                                                                                                                                                                    |
| W1    | `admin-ceremony-nominees` (four cells)                                                                                                                                                                              | stepper                                                     | The active-step bar, the progress connector and the in-progress ring are ink, not gold. Complete and locked icons stay gold with a dark glyph                                                                                                                                                                                                                                                                                       |
| W2    | `admin-home`, `admin-films`, `admin-ceremony-nominees`                                                                                                                                                              | eyebrows                                                    | Admin eyebrow labels (group titles, counts) in the label family                                                                                                                                                                                                                                                                                                                                                                     |
| D1    | All draft cells (refined-gold: `draft-live-your-turn`, `-not-your-turn`, `-armed`, `-hover-match`, `-focus-disabled`, `draft-completed`; new brands: `draft-live-your-turn`, `draft-live-armed`, `draft-completed`) | board, rails                                                | Category and roster cards on `raised` with the brand card edge (A beige ring and soft shadow, B and D grey ring, C and G ink frame, F 2 px ink and 5 px offset, E flat), `radius-md` corners. Default pills are ink text at medium weight on a `raised` chip (previously grey text on transparent); armed, hover-match and winner as in 02. Roster win counts in the numeral face, 16 px, ink. Rail titles in sentence-case wording |
| D2    | Same cells                                                                                                                                                                                                          | draft header (masked in `hover-match` and `focus-disabled`) | Buckle flat (no gradient or highlight), shaped by the button radius (square in C, D and G, pill in E, rounded in A, B and F), edged by the raised shadow (F with a 4 px ink offset). Neutral buckles on `sunken`. Header bottom rule: C double ink, G ink. Header icon buttons unchanged at rest                                                                                                                                    |
| D3    | `draft-live-not-your-turn` desktop (refined-gold), if the full controls are shown                                                                                                                                   | draft header                                                | View SegmentedControl: sunken track, raised indicator with a `ruleStrong` ring. "Show drafted" switch: ink track when on. Sound and cursor-spy toggles show their pressed state                                                                                                                                                                                                                                                     |
| D4    | `draft-completed` (all brands)                                                                                                                                                                                      | draft header                                                | Podium buckles flat, in win gold, silver and bronze with the brand shape and edge; WINNER kicker unchanged                                                                                                                                                                                                                                                                                                                          |

### 6.3 Cells that must not change in chunk 9

- Any `login` and `register` cell, except the footer band if the auth layout has one.
- `not-found`, except the footer band and card corners.
- Draft cells, except the regions in D1–D4.
- Win gold must be pixel-identical in hue across brands in D4 and C6.

### 6.4 New cells (chunk 9, step 9C)

`ScreenDef` gains an optional `beforeNavigate?: (page: Page, seed: VisualSeed) => Promise<void>`, run in `screens.spec.ts` before `page.goto`. Both new cells use it to rewrite the draft snapshot. `freezeClock` already stops `setInterval`, and the countdown's first tick sets the red phase synchronously, so the capture is deterministic.

| New screen             | Persona, path                   | Viewports          | Brands                                  | `beforeNavigate`                                                                                                                                              | What the reviewer sees                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------- | ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft-live-countdown` | avery, `/drafts/${drafts.live}` | desktop and mobile | **all seven** (append to `KEY_SCREENS`) | `page.route("**/drafts/*/snapshot", …)`: fetch, then set `draft.pick_timer_seconds = 90` and `draft.pick_deadline_at = FIXED_NOW + 4000 ms` (ISO), and fulfil | Desktop: the buckle is in the danger phase (`#b34b42`) with a 2 px light inner ring, a timer glyph and "4s left" in light ink. The buckle width equals the normal timer width. Phone: the full-width bar in the same state. **E and F:** ring, glyph and words are clearly present (this cell is the chunk 12 evidence that the hue-only pulse has a non-colour cue) |
| `draft-paused`         | avery, `/drafts/${drafts.live}` | desktop and mobile | refined-gold only                       | same route, `draft.status = "PAUSED"`                                                                                                                         | Neutral `sunken` buckle (desktop) or bar (phone) reading "Paused" with a pause glyph; no my-turn colour; the commissioner's control shows the play glyph (Resume); pills inert                                                                                                                                                                                       |

Cell count: 28 + 4 = 32 new PNGs. `KEY_SCREENS` becomes 11, so a new brand has 42 cells. Matrix total: 358.

## 7. Escalations

### (a) Owner

1. **Gold as the family highlight in the header** (02 a3, deferred "decide later", needed now for chunk 8).
   - B gets a gold nav underline and second word. C gets a gold underline. D gets a gold second word. E gets a gold full stop.
   - Gold would then mean "won" on the board and "brand highlight" in the shell header, which never appears in the draft room.
   - _Recommendation: yes, in the shell and auth headers only._ That is what every one of these boards shows, and it is never on the same screen as a won pill.
   - If no: the values in §3.1.3. B and C get ink underlines. B's second word becomes primary, which is 1.86:1 in light and faint. D and E use their accents (grey, laurel).
2. **E's two-tone split is a gold full stop** (02 D14). The rule requires a visible split in every wordmark. Festival's board shows "Fantasy Oscars" in black with a gold full stop.
   - _Recommendation: accept it as E's split_, as a new `stop` enum value (§3.1).
   - If no: E colours "Oscars" in its tone colour like B and D.

### (b) Designer

1. **Draft header states per brand.** The boards show the buckle only as "Draft complete" in the display face at 22–28 px. The app's buckle has about ten states and measures itself in the body face (02 §3.12). We render the brand through shape, edge and fill only (§4.13.3). Two asks:
   - design the my-turn, countdown (last 5 seconds), paused and podium states per brand within those constraints;
   - for festival and technicolor, confirm that the countdown cue in §4.13.6 (inner ring, timer glyph, "Ns left") suits the brand. This carries 02 b2.
2. **Button face.** The festival, technicolor and lightbox boards set buttons in the display face, and noir in uppercase tracked Inter. We keep the body face in sentence case so long labels ("View draft results", "Adjust draft settings") fit at 390. Confirm, or specify a button face and case per brand. That would need one new slot, `type.buttonFont`.
3. **Phone navigation.** The phone boards show a horizontally scrolling nav row. The app keeps a drawer, which also holds Account, Log out and Admin. Confirm the drawer and, if wanted, show one drawer per brand. Low priority.
4. **Coloured chips.** The boards show only a neutral "Closed" chip. Confirm the construction for drafting, paused, complete and the gold "Winner" chip (sunken fill, tone border and mark, ink label, §4.12), or propose per-brand chips that keep a text label and a non-colour mark.
5. **Lightbox wordmark.** The board shows no split. We split by weight (Plex Mono 600 / 400). Confirm, or propose another split. Low priority.

## 8. Build notes

### 8.1 Files likely touched

- **Theme:** `theme/brands/contract.ts` (P1, P2, `stop`, contract test hook), `theme/brands/css.ts` (derived properties, §3.2), the seven brand files (P1, P2 values; E `twoTone`; C Plex 600), unit tests (`contract`, `css` snapshot, `fonts`), `theme/index.ts` (Indicator colour, Modal overlay), `tokens/overlays.ts`.
- **Chrome:** `app/chrome/ui/ShellHeader.tsx`, `ShellPrimaryNav.tsx`, `ShellNavDrawer.tsx`, `app/layouts/AuthLayout.tsx`, `app/layouts/SiteFooter.tsx` (no markup change expected).
- **UI:** `ui/Button.tsx` (variants, `data-fo-variant`, `aria-busy`), `ui/ActionIcon.tsx`, `ui/Title.tsx` (unchanged API), new `primitives/EmptyState.tsx`, `shared/pills.tsx`.
- **Screens:** call sites in §4.4.1; `features/seasons/ui/*Column.tsx`, `SeasonDashboardHeader`; `features/leagues/ui/*Section.tsx`, `LeagueDetailScreen`; `LandingScreen`, `SeasonsIndexScreen`, `AccountScreen`, `CeremonyDetailScreen`, `DraftPlansScreen`; empty-state call sites.
- **Decisions:** new `decisions/statusTone.ts`; `decisions/season.ts` and `decisions/seasons/seasonIndexCards.ts` (Paused); `decisions/draft/countdown.ts` (`formatCountdownText`); `decisions/draft/announcements.ts`; `decisions/chrome/bannerColor.ts`; tests for each.
- **Draft:** `features/draft/ui/CenterBuckle.tsx`, `screens/DraftBoardHeader.tsx`, `screens/mobile/MobileDraftHeader.tsx`, `ui/DraftHeaderRightWing.tsx`, `ui/mobile/MobileRail.tsx`, `ui/DraftLiveRegion.tsx`; optional `orchestration/draft/useCountdownPhase.ts`.
- **Notifications:** `notifications/notify.ts`, `BannerStackScreen`, `runtimeBanners.tsx`.
- **Styles:** `styles.css`, `primitives/baseline.css`.
- **Tests and docs:** `tests/visual/matrix.ts`, `tests/visual/screens.spec.ts`; `docs/architecture/brands.md` (new slots, derived properties, the warning and modal decisions). The cartographer updates the inventory afterwards: chips are now coloured; the wordmark renders two-tone; danger buttons are red; nav slots and label families are read; there are two new cells.

### 8.2 Chunk 8 steps

| Step                                                       | Work                                                                                                                                                         | Verify                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **8A** Slots and generator                                 | §3.1 (with the owner's a1 and a2 answers), §3.2 derived properties, contract test (pill brands' `activeColor`), CSS snapshot, C's Plex 600 face, `brands.md` | `test:unit` green; `test:visual` **zero diff** (nothing reads the new properties yet)                                                                    |
| **8B** Header, nav, drawer, wordmark, skip link            | §4.1, §4.2, §4.3, §4.7, M1–M8. The Mantine Divider in the drawer can wait for 9A                                                                             | Re-baseline H1, H2, H3 and S1 only. Triage with the vertical-offset search. Keyboard check: the drawer opens from the button, and focus returns on close |
| **8C** Buttons, icon buttons, menus, Indicator, type scale | §4.4, §4.5, §4.6, M9–M13. Migrate the `color="red"` call sites                                                                                               | Re-baseline T1–T3 and B1–B4. `grep 'color="red"'` leaves only Alerts and ActionIcons. Unit test: `ui/Button` sets `data-fo-variant` and `aria-busy`      |

### 8.3 Chunk 9 steps

| Step                                          | Work                                                                                                                                                                                                              | Verify                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9A** Surfaces, palette, labels, decorations | §4.8 (palette, default border, Divider, Skeleton, Alerts and banners with icons, toasts, modal blur), §4.9 (card radius, `.card`, EmptyState), §4.10 (footer rule), §4.11 (L1), §4.4.5 footer link hover, M18–M20 | Re-baseline F1, K1–K3, W2. The draft cells must not change in 9A                                                                                               |
| **9B** Chips, winner, stepper, overflow       | §4.12 (tone decision and tests, StatusPill, Paused labels, landing chip, role chip, account), §4.14, §4.15, M15–M17                                                                                               | Re-baseline C1–C8 and W1. Remove `account` and `draft-plans` from `KNOWN_PHONE_OVERFLOW`, and the phone guard passes                                           |
| **9C** Draft room and new cells               | §4.13 (pills, cards, buckle, header rule and controls, rails, toggles, SegmentedControl, Switch, countdown cue, paused, live announcement), §6.4 (`beforeNavigate`, two cells, `KEY_SCREENS`), M21–M23            | Re-baseline D1–D4 and add the 32 new PNGs. Functional QA: gold phase of the countdown, reduced motion (ring and glyph still shown), screen reader announcement |

### 8.4 Risks

- **R1 Doubled dark selectors.** The palette and `default-border` bindings go into both the `:root[...]` and `body[...]` blocks at the top of S (as `blue` does). Missing one leaves Mantine values in one mode.
- **R2 Specificity of the button skin.** The base `.mantine-Button-root` rule sets `--button-*` with `!important`. Variant rules keyed on `[data-fo-variant]` must come after it and use `!important` on the same variables. The disabled rule must still win over every variant, except while loading.
- **R3 Nav measurement.** New nav faces change widths (D 20 px with 0.12em is the widest; C 12 px mono is narrow), so the 500–900 inline-or-drawer decision may flip. This is not captured. Functional QA checks 768 in every brand: links either fit on one row or the drawer opens. The admin sub-nav shares `.nav-link`, wraps on phones (#397), and must still wrap with D's larger nav.
- **R4 Header height shift.** 40 px controls and the new nav sizes change the header height per brand. Every shell cell shifts. Use the offset-aware triage (§6), or almost every cell will look unexpected.
- **R5 F's offsets near scroll edges.** The 5 px card offset and 4 px buckle offset need room. Check that `.dr-middle` and roster columns have at least 8 px bottom padding and 2 px top padding, so the offset and ring are not clipped. Add padding if not (no geometry change to cards).
- **R6 The C header rule.** `.dr-header` keeps `flex: 0 0 64px`. A 3 px double border shrinks the buckle's height by 2 px in C only. That is accepted; check that the buckle text still centres.
- **R7 Snapshot route.** If a socket event or refetch replaces the rewritten snapshot during capture, the countdown cell flakes. The route covers HTTP refetches; socket events are deltas. If skew correction (`clockSkew.ts`) shifts the remaining time, set the deadline from the corrected clock: the cell must read 4s or 5s, and the baseline pins whichever is deterministic.
- **R8 `calc()` with decoration multipliers.** `--brand-deco-*` must stay unitless `0` or `1`. Never emit `"true"`.
- **R9 Material glyphs.** `mail`, `logout`, `person`, `expand_more`, `timer`, `pause`, `check`, `emoji_events`, `warning`, `error`, `info` and `check_circle` are standard Material Symbols ligatures. The visual suite serves a stub icon font (`ICON_FONT` in `tests/visual/support/page.ts`), so check that ligature width is stable in captures.
- **R10 Plex 600 for C.** `fonts.test.ts` must see the new weight. The face is only downloaded when C renders 600 Plex text.

## 9. Marginal improvements (all brands, same structure)

| #   | Current                                                                                                                                                                       | Change                                                                                                                   | Why                                                                                                    | Cells (chunk)                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| M1  | Header controls are bare 48 × 36 subtle icons (`.theme-toggle`), so their hit area and clickability are unclear                                                               | Bounded 40 px boxes in the brand's card edge and button shape, 44 px on phone, with tooltips (§4.1)                      | Clear affordance; 44 px phone targets; the boards draw them this way in all seven brands               | H1, H2 (8)                           |
| M2  | The bell is labelled "Notifications" but opens Invites; the count is not in its name; the badge is Mantine yellow                                                             | Name "Invites" / "Invites, N pending", `mail` glyph, tooltip, badge in primary                                           | Says what it opens; screen readers hear the count; yellow was an off-palette hue                       | H1 signed-in (8)                     |
| M3  | The account trigger shows a long username unbounded and a "▾" text glyph                                                                                                      | 160 px max with ellipsis and `title`, full name as the menu label, `expand_more` that turns when open                    | A 61-character name no longer crowds the header; open or closed is visible                             | H1 signed-in desktop (8)             |
| M4  | "Logout" is red in the menu and the drawer, "Logout" on the account page                                                                                                      | "Log out" everywhere, neutral, with a `logout` glyph                                                                     | Red is reserved for destructive actions; logging out is reversible; one verb form                      | B3 (8); menu and drawer not captured |
| M5  | Signed out, the inline header offers only "Login" (ghost); "Create account" exists only in the drawer                                                                         | "Create account" (ghost) and "Log in" (secondary) in the inline header; the "Checking…" placeholder reserves their width | The same entry points at every width; no layout jump after the session check                           | H3 (8)                               |
| M6  | The hamburger is "Open menu" with no expanded state                                                                                                                           | "Open navigation", `aria-expanded`, `aria-controls`, 44 px                                                               | States what opens, and whether it is open                                                              | H1 phone (8)                         |
| M7  | Drawer links have no current-page cue, rows of about 36 px, a red Log out button                                                                                              | Current-page bar or pill, 44 px rows, neutral Log out with a glyph                                                       | You can see where you are; easier taps                                                                 | not captured (8)                     |
| M8  | The nav underline is 1 px in primary (1.86–2.10:1 in A and B light, 2.76 in the E dark drawer); hover draws a 1.2:1 line                                                      | A 2 px underline in the P1 colour (at least 4.48), or a filled pill; hover underline in `ruleStrong`                     | The current page is visible in every palette (1.4.11)                                                  | H1 (8)                               |
| M9  | Disabled buttons explain themselves only in a `title` tooltip ("locked once drafting starts", "Draft board is unavailable…", "Completed drafts cannot be deleted")            | Visible helper text under the control, linked with `aria-describedby`; the two management locks share one line           | Tooltips on disabled buttons never show on touch or to keyboard users                                  | B2, B4 (8)                           |
| M10 | `danger` buttons and every `color="red"` button render exactly like secondary                                                                                                 | Real danger (red outline) and destructive (red fill) variants; call sites migrated                                       | Destructive actions look destructive; the confirm step is the heaviest                                 | B2, B3 (8)                           |
| M11 | A loading button turns into the disabled well (the M4 rule matches Mantine's disabled flag)                                                                                   | Loading keeps its variant colour, shows the loader and sets `aria-busy`                                                  | A primary action does not appear to become unavailable while it saves                                  | not captured (8)                     |
| M12 | Secondary buttons have a `rule` border (1.2–1.5:1): on a card they barely read as buttons                                                                                     | `ruleStrong` border (3:1)                                                                                                | Clear affordance                                                                                       | B1 (8)                               |
| M13 | Phone buttons and icon buttons are 32–36 px                                                                                                                                   | 44 px minimum below 500 px in the shell and auth layouts                                                                 | Touch-target guidance                                                                                  | H1, H2, B1 phone (8)                 |
| M14 | Section `Title`s without a variant render at page-title size (noir inverts the hierarchy)                                                                                     | `variant="section"` on every section title; page titles at `h1Size`                                                      | Hierarchy holds in every brand                                                                         | T1–T3 (8)                            |
| M15 | The landing status chip is a focusable span with a tooltip that repeats its label                                                                                             | Plain chip, not focusable, no tooltip                                                                                    | One fewer meaningless tab stop                                                                         | C4 (9)                               |
| M16 | Season chips are grey everywhere; "Draft live" is a primary-filled pill (cherry in F, laurel in E)                                                                            | Status tones with a mark and a label (§4.12)                                                                             | Status is recognisable at a glance and never confused with primary                                     | C1–C5 (9)                            |
| M17 | A paused draft reads "Open" in the seasons index and "Drafting" on league rows, but "Paused" on the season page; account details use status chips                             | "Paused" with a pause mark on all three; account values as plain text                                                    | The same state has the same name everywhere; fixes the account overflow at 390                         | C3, C7 (9)                           |
| M18 | Empty states are a bare line of text                                                                                                                                          | A dashed `faint` box (EmptyState primitive), same words                                                                  | The empty slot reads as a deliberate placeholder in the space the content would fill, as on the boards | K2 (9)                               |
| M19 | Banners and alerts differ by tint only; warning is Mantine yellow; info toasts take the brand primary stripe                                                                  | Variant icon on every alert and banner; neutral warning; neutral info stripe                                             | A non-colour cue for severity; no off-palette yellow; no cherry stripe on a harmless toast in F        | not captured (9)                     |
| M20 | The footer link hover underline is the invisible `rule` colour                                                                                                                | `currentColor`                                                                                                           | Hover is visible                                                                                       | not captured (9)                     |
| M21 | Rail titles differ by viewport ("Draft History" / "Draft history")                                                                                                            | One wording: "Draft history", "My roster", "Auto-draft"                                                                  | Consistency, visible in E and F where labels are not uppercased                                        | D1 (9)                               |
| M22 | Sound and cursor-spy buttons flip their names ("Mute" / "Unmute") with no pressed state; the "Show drafted" switch has no accessible name; "Toggle theme" in the compact menu | Toggle buttons with `aria-pressed` and stable names, a labelled Switch, explicit "Switch to light/dark mode"             | Screen readers report state, not a changing command; the switch is announced                           | D3 (9)                               |
| M23 | The ceremony winner is an unlabelled star glyph (the wrong codepoint) in text colour                                                                                          | A gold "Winner" chip with a trophy glyph                                                                                 | A visible word; "gold means won" holds on the results page                                             | C6 (9)                               |
| M24 | `draft-plans` controls overflow at 390 ("Download" is cut off)                                                                                                                | Controls stack under 500 px                                                                                              | Every action is reachable on a phone                                                                   | C8 (9)                               |

Bigger ideas noted for the owner, not in this package:

- a 768 viewport for key screens;
- a per-brand `theme-color` at chunk 12;
- one shared countdown hook across the desktop and phone headers. This one is optional in 9C if the builder prefers to keep the duplication.
