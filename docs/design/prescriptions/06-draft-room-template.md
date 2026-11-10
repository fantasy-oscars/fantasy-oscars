# 06 Draft room template

Package: turn the draft room into one robust template with a closed, named set of levers each theme may pull, so a theme can add personality without being able to break the room. It replaces the buckle with a **hanging tab** in the header, redesigns roster rotation, settles the icon colour rules, the room's font limits and card edge geometry, and adds the checks that keep the levers locked. Builder: implement this file, not the mockups or the gallery. Section 11 splits the work into three shippable chunks.

Brand letters: A refined-gold, B red-carpet, C ballot, D noir, E festival, F technicolor, G lightbox. "Ink" is `--brand-text`. Contrast ratios and font measurements were computed for this prescription; font metrics were measured in Chromium 1200 from the Google Fonts latin files of each family at 100 px, weight 500 where the family has it.

The owner chose the header tab and the roster treatment from rendered galleries (gallery round 2). Those decisions are written into 5.3 and 5.4 and recorded in 9.

The mechanics of the draft do not change: picks, arming, the confirm toast, keyboard model, timers, audio, live announcements, the unit grid, rail open and close behaviour and the mobile tree are untouched. Only the things listed here change.

## 1. Scope

**In scope**

- Every draft room state in inventory 3.2 (loading through final results), all seven brands, light and dark, at 1280, 768 and 390. Screens: `draft-live-your-turn`, `-not-your-turn`, `-armed`, `-hover-match`, `-focus-disabled`, `-countdown`, `draft-paused`, `draft-completed` (`draft-plans` excluded).
- A new `room` slot group in the brand contract (3.3), with a value for every brand, including the header tab's edge (`room.tabEdge`).
- The buckle concept, replaced from scratch (owner decision 3): `CenterBuckle` and all `.drh-buckle*` go, replaced by `DraftHeaderTab` (5.3), on desktop and phone.
- Roster rotation (owner decision 4): `RosterBoardScaffold` and `MobileRosterBoard` share one window model and one track (5.4).
- Icon colour and glyph rules for every icon in the room (5.2), including the `materialGlyph` fix.
- Geometry: card edge gaps, rail row columns, header box, pill radius, the auto-draft rail's controls (5.1, 5.5).
- Enforcement: contract tests, a stress theme in the visual tier, geometry assertions, a CSS check and an economical per-theme visual matrix (section 6).
- Marginal improvements inside the room (section 12).

**Shared pieces touched (called out)**

- `theme/brands/contract.ts`, `css.ts`, the seven brand files, `fontCatalog.ts`, `brandContract.test.ts`, `brands.css.snapshot`, `docs/architecture/brands.md`.
- `decisions/admin/materialGlyph.ts`: the four-character hex check is narrowed. This also fixes the admin ceremony screens (`admin-ceremony-nominees` shows the Best Actress glyph).
- `.mi-icon`: per-axis custom properties with the current values as defaults, so every screen outside the room renders exactly as today.
- `styles.css` `.dr-*`, `.drh-*`, `.drm-*`, `.fo-tip-draftedChip*`; `tokens/draftHeader.ts`; `theme/tokens.ts` (`--fo-db-*`).
- `tests/visual/matrix.ts`, `tests/visual/assertions/*`, `.github/scripts/tokens-check.mjs`.

**Not changed**

- The unit system (`pickDraftDivisor`, 1.25/0.25 rails, masonry, compactRails 665), pill height (22) and text size (10), the keyboard model, the armed, winner and muted semantics, win gold and metals, the tooltip nominee card layout, toasts, the confirm flow, the phone rail bar and category list, modals, banners and site chrome.
- Nothing outside the draft room changes appearance except the `materialGlyph` fix and the specimen's draft section.

## 2. Intent

The owner's goal: "a robust template with an explicit set of levers that a theme can pull to customize, that ensure personality without compromising the design." The room is the app's most complex and most fragile screen. Today a theme can reach into it with free-form shadow strings and any font; future themes (Monoton, Orbitron, Creepster, blackletter, glows) would break it. This package draws one line: **a theme chooses surfaces, ink, corners, edge weight, the tab's edge and title voice; the template owns layout, spacing, small type, states and icons.**

Per theme, the expression available through the levers:

- **A refined-gold**, soft ceremony: soft-depth cards, a gold tab lifted on a soft shadow, Cinzel rail titles.
- **B red-carpet**, premiere signage: hairline cards, tight corners, Playfair titles, a gold tab with an inner keyline.
- **C ballot**, printed form: ink-ringed square cards, double rule under the header, a square tab bordered in a double rule, monospace titles.
- **D noir**, title card: square hairline cards, condensed titles, a square double-ruled tab.
- **E festival**, flat tiles: no card edge, rounded pills, Archivo titles, a flat rounded tab.
- **F technicolor**, poster: 2 px ink outline and 5 px offset on cards and tab alike, Fraunces titles, a cherry tab.
- **G lightbox**, contact sheet: ink-framed square cards and tab, monospace titles.

## 3. The lever set

### 3.1 Levers (closed list)

A theme may vary exactly these, within these bounds. Anything else in the room is fixed by the template.

| #   | Lever           | Contract slot                                                    | Allowed                                                                                                                                                        | Read in the room as                                                                                                      |
| --- | --------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| L1  | Grounds and ink | `colors.page/raised/sunken/text/muted/rule/ruleStrong/focusRing` | Existing floors (`brandContract.test.ts`)                                                                                                                      | Page, card and rail fills, the rest tab, pill states, ink, hairlines, focus                                              |
| L2  | Action colour   | `colors.primary/onPrimary`                                       | Existing floor: on-primary on primary at 4.5 or better                                                                                                         | Your-turn tab fill, primary buttons, confirm toast stripe. Never used for win or status                                  |
| L3  | Corner radii    | `shape.radiusSm`, `radiusMd`, `radiusLg`, `buttonShape`          | `radiusSm` 0 to 12 px, `radiusMd` 0 to 20 px, `radiusLg` 0 to 28 px, `buttonShape` enum (new range checks)                                                     | Pills and chips: `radiusSm`. Cards, tooltip and the tab's bottom corners: `radiusMd`. Controls and tokens: button radius |
| L4  | Card edge       | `room.edge: { ring, ringColor, drop, depth }` (new)              | `ring` 0, 1, 2 or 3 px. `ringColor` `rule`, `ruleStrong` or `text`. `drop` integer 0 to 6 px, only when `ring` is at least 1. `depth` `none`, `soft` or `glow` | Category and roster cards; the tab's `ring` and `drop` edges. Gaps are computed from it (5.1)                            |
| L5  | Tab edge        | `room.tabEdge` (new)                                             | `flat`, `keyline`, `double`, `ring`, `drop` or `lift` (5.3)                                                                                                    | The header tab's edge                                                                                                    |
| L6  | Hairline weight | `shape.borderWidth`                                              | `1px` or `2px`                                                                                                                                                 | Pill, rail and input borders                                                                                             |
| L7  | Header rule     | `shape.ruleStyle`, `decorations.doubleRules`, `frameBorders`     | Existing enums, derived `--brand-section-rule` (at most 3 px)                                                                                                  | The single rule under the header and over the footer, inside the 64 px header box                                        |
| L8  | Working font    | `room.workFont` (new)                                            | A font stack whose family is in `ROOM_WORK_FONTS` (passes the width check, 5.6)                                                                                | Pills, rail rows, numbers, the tab's data text, labels, every Mantine control in the room                                |
| L9  | Title voice     | `room.titleFace` (new)                                           | `work`, `label` or `display`. `display` requires the brand's `type.displayFont` family in `ROOM_TITLE_FONTS`                                                   | Rail pane titles and the tab's fixed status words only (5.6)                                                             |
| L10 | Label case      | `type.labelCase`                                                 | Existing enum                                                                                                                                                  | The room's small labels                                                                                                  |
| L11 | Score numeral   | `type.numeralFont`                                               | Existing slot; one site only: the roster card's score, in a fixed 3-character cell                                                                             | `.dr-rosterWinCount`                                                                                                     |

Components read the derived properties in 3.3, never the enums. There is no brand id, enum or `data-brand` condition in any draft CSS or component (section 6).

### 3.2 Fixed by the template

A theme cannot change these. Numbers are the same in every theme and mode.

| Area                  | Fixed                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frame                 | Unit grid, rails 1.25u/0.25u, masonry columns, compactRails 665, header 64 px including its rule, footer fineprint                                                                                                                                                                                                           |
| Spacing               | Visible gaps between board card edges 10 px across and 12 px down, 5 px to the frame, card padding 10, pill gap 6, rail row gap 4, roster columns 12 apart (5.1, 5.4)                                                                                                                                                        |
| Pill                  | Height 22, one line with an end ellipsis, padding 10, text 10 px, weights 400 (muted) and 500                                                                                                                                                                                                                                |
| Small type            | Working font only. Sizes: pill and meta 10, labels and kickers 10, name kicker 11, rail titles 12, tab stats 14, tab name 15, tab status words 17 (title voice), tab clock 18 (16 on the phone), weights 400 to 700 (no 800 or 900 in working text; several brands do not load them)                                         |
| States                | Armed is an ink fill with a check; muted is sunken with muted ink; winner is the shared gold fill with its gold-on ink; hover-match is a 10 % ink tint and ink border; pending is dashed at 0.65; focus is an ink ring with a 2 px gap. No state changes hue by theme. No state uses `primary`, an accent or a status colour |
| Win and medals        | `--fo-win-gold*`, `--fo-medal-*`, `--fo-danger*` are shared and never a lever                                                                                                                                                                                                                                                |
| Icons                 | Material Symbols only; axis and colour rules in 5.2                                                                                                                                                                                                                                                                          |
| Motion                | 120 ms hover and fill transitions, the countdown pulse rhythm, the roll on tied names, the 320 ms roster slide; all follow the global reduced-motion clamp                                                                                                                                                                   |
| Header tab and roster | All geometry, content, order and states, including the tab edges' dimensions (5.3, 5.4)                                                                                                                                                                                                                                      |

### 3.3 Contract additions (smallest)

One new group, `room`, added to `BrandDefinition` and filled for every brand (values in 4.1).

```ts
export const ROOM_RING_WIDTHS = [0, 1, 2, 3] as const;
export const ROOM_RING_COLORS = ["rule", "ruleStrong", "text"] as const;
export const ROOM_DEPTHS = ["none", "soft", "glow"] as const;
export const ROOM_DROP_RANGE = { min: 0, max: 6 } as const;
export const ROOM_TITLE_FACES = ["work", "label", "display"] as const;
export const ROOM_TAB_EDGES = [
  "flat",
  "keyline",
  "double",
  "ring",
  "drop",
  "lift"
] as const;

export type RoomSlots = {
  /** Font of pills, rail rows, numbers and every label in the room. Family must be in ROOM_WORK_FONTS. */
  workFont: string;
  /** Voice of rail titles and the header tab's fixed status words. */
  titleFace: (typeof ROOM_TITLE_FACES)[number];
  edge: {
    ring: (typeof ROOM_RING_WIDTHS)[number];
    ringColor: (typeof ROOM_RING_COLORS)[number];
    /** Hard downward offset in px; 0 unless ring is at least 1. */
    drop: number;
    depth: (typeof ROOM_DEPTHS)[number];
  };
  /** Edge of the header tab. `ring` and `drop` take their width and colour from `edge`. */
  tabEdge: (typeof ROOM_TAB_EDGES)[number];
};
```

Two closed lists in `fontCatalog.ts` hold the families that have passed the checks in 5.6: `ROOM_WORK_FONTS` (Inter, DM Sans, Instrument Sans, Archivo) and `ROOM_TITLE_FONTS` (Cinzel, Playfair Display, Barlow Condensed, Fraunces, Archivo, IBM Plex Mono).

Derived properties, emitted by a new `roomDeclarations` in `css.ts`, in the common block unless marked per mode:

| Property                                      | Value                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--brand-room-font-work`                      | `room.workFont`                                                                                                                                                                |
| `--brand-room-font-title`                     | `work`: `room.workFont`; `label`: `type.labelFont`; `display`: `type.displayFont`                                                                                              |
| `--brand-room-title-weight`                   | `display`: `type.displayWeight`; else `600` (every brand's label and work faces load 600)                                                                                      |
| `--brand-room-ring`                           | `{ring}px`                                                                                                                                                                     |
| `--brand-room-ring-color`                     | `var(--brand-rule)`, `var(--brand-rule-strong)` or `var(--brand-text)`                                                                                                         |
| `--brand-room-drop`                           | `{drop}px`                                                                                                                                                                     |
| `--brand-room-depth` (per mode)               | `none`: `0 0 0 0 transparent`. `soft`: `0 1px 2px rgba(0,0,0,a), 0 6px 16px rgba(0,0,0,a)`, `a` 0.05 light / 0.28 dark. `glow`: `0 0 10px rgba(var(--brand-accent-rgb), 0.35)` |
| `--brand-room-card-shadow`                    | `0 0 0 var(--brand-room-ring) var(--brand-room-ring-color), 0 var(--brand-room-drop) 0 var(--brand-room-ring) var(--brand-room-ring-color), var(--brand-room-depth)`           |
| `--brand-room-tab-keyline`                    | `1` for `keyline`, else `0`                                                                                                                                                    |
| `--brand-room-tab-border`                     | `3px` for `double`, else `0px`                                                                                                                                                 |
| `--brand-room-tab-ring`                       | `ring`, `drop`: `max(ring, 1)px`; else `0px`                                                                                                                                   |
| `--brand-room-tab-drop`                       | `drop`: `min(max(drop, 4), 7 - tabRing)px`; else `0px`. So the tab's lowest edge is never below 61 px and always clears a 3 px header rule                                     |
| `--brand-room-tab-lift`                       | `1` for `lift`, else `0`                                                                                                                                                       |
| `--brand-room-tab-edge` (per mode)            | The `ringColor` value: the edge on the `rest` and `paused` tones                                                                                                               |
| `--brand-room-tab-edge-on-primary` (per mode) | The first of `ringColor`, `text`, `ruleStrong` that reaches 3:1 against both `primary` and `page`                                                                              |
| `--brand-room-tab-edge-on-danger` (per mode)  | The first of `ringColor`, `text`, `ruleStrong` that reaches 3:1 against both `--fo-danger` and `page`                                                                          |

The generator throws when no candidate qualifies, so the build fails and the brand must choose another `tabEdge`. On the `final` tone the edge is always the shared `--fo-win-gold-on` (5.3), so it needs no per-brand value.

### 3.4 Variation removed

| Removed                                                                                                                                                           | Why                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.dr-card { box-shadow: var(--brand-shadow-card) }`                                                                                                               | Opaque strings cannot feed gaps. The site keeps `shadow-card`; the room reads `--brand-room-card-shadow`                                                      |
| `--brand-shadow-raised`, the button radius on all corners and the offset shadow on the buckle                                                                     | The tab's edge is the closed `tabEdge` enum; its corners and overhang are fixed by the template                                                               |
| `--fo-radius-pill` on board pills, roster nav, tokens, back and pause buttons, user badge, connection chip, cursor label, tooltip drafted chip, phone podium bars | Owner decision 1. Pills and chips use `--brand-radius-sm`; icon buttons and tokens use `--brand-button-radius`                                                |
| `.drh-row::before` radial backdrop, hover-card and podium bar gradients                                                                                           | Theme-blind decoration that fought every palette; flat fills need no local contrast                                                                           |
| `--brand-font-body` in the room                                                                                                                                   | Replaced by `--brand-room-font-work`. Decorative faces cannot reach working text, and body fonts of future themes are free to fail the check outside the room |
| `DRAFT_BUCKLE_*`, `--fo-db-buckle*`, the `useMemo` width and every `.drh-buckle*` selector                                                                        | Replaced by a CSS-only tab width and one decision (5.3)                                                                                                       |
| `.mi-icon`'s fixed `--fo-text-primary` colour inside the room                                                                                                     | Icons take the ink of the surface they sit on (5.2)                                                                                                           |
| `.dr-rosterNav` floating arrows and the `100vw / 6.25` roster unit                                                                                                | Replaced by the roster track (5.4)                                                                                                                            |

## 4. Token values

### 4.1 `room` per brand

| Brand          | `workFont` (family) | `titleFace` | Title font (resolved) | `edge.ring` | `edge.ringColor` | `edge.drop` | `edge.depth` | `tabEdge` |
| -------------- | ------------------- | ----------- | --------------------- | ----------- | ---------------- | ----------- | ------------ | --------- |
| A refined-gold | Inter               | display     | Cinzel 700            | 1           | rule             | 0           | soft         | lift      |
| B red-carpet   | DM Sans             | display     | Playfair Display 600  | 1           | rule             | 0           | none         | keyline   |
| C ballot       | Instrument Sans     | label       | IBM Plex Mono 600     | 1           | text             | 0           | none         | double    |
| D noir         | Inter               | display     | Barlow Condensed 700  | 1           | rule             | 0           | none         | double    |
| E festival     | Instrument Sans     | label       | Archivo 600           | 0           | rule             | 0           | none         | flat      |
| F technicolor  | DM Sans             | display     | Fraunces 800          | 2           | text             | 5           | none         | drop      |
| G lightbox     | Archivo             | label       | IBM Plex Mono 600     | 1           | text             | 0           | none         | ring      |

`workFont` keeps each brand's current body font, so no brand's pills change face. F's dark card ring moves from `#f3ddbb` to `text` (`#fff1dc`): the enum gives one ring value per role, and the cream is close enough that the change is invisible (15.0:1 on raised). A's soft depth moves from a warm brown to neutral black at the same alpha, an imperceptible change that removes one per-theme shadow colour.

### 4.2 Existing slots, range check only

Every other contract slot keeps the values in prescription 02; none changes here. The new range checks reject no current value: `radiusSm` 0, 4, 10, 12; `radiusMd` 0, 6, 12, 16, 18; `radiusLg` 0, 6, 14, 20, 24; `borderWidth` 1 or 2.

| Brand   | Pill radius (`radiusSm`, clamped at half of 22) | Card radius (`radiusMd`) | Tab bottom corners (`min(radiusMd, 18)`) | Token and control radius (`buttonRadius`) |
| ------- | ----------------------------------------------- | ------------------------ | ---------------------------------------- | ----------------------------------------- |
| A       | 10                                              | 12                       | 12                                       | 10                                        |
| B       | 4                                               | 6                        | 6                                        | 4                                         |
| C, D, G | 0                                               | 0                        | 0 (square)                               | 0                                         |
| E       | 11 (stadium)                                    | 16                       | 16                                       | 999 (circle)                              |
| F       | 11 (stadium)                                    | 18                       | 18                                       | 12                                        |

Check: no always-round pill in C, D or G; A, E and F stay soft because their own radii say so.

### 4.3 Contrast (computed)

Every text/background pair. Ground and ink roles come from contract slots, so these numbers hold for every state that uses the pair (the tab tones `rest` and `paused` are ink on sunken, `mine` and `countdown-primary` on-primary on primary).

| Brand · mode           | on-primary / primary | ink / sunken | muted / sunken | ink / raised | muted / raised | page / ink (armed) | ink / hover-match | ink / primary (chip avatar today) |
| ---------------------- | -------------------- | ------------ | -------------- | ------------ | -------------- | ------------------ | ----------------- | --------------------------------- |
| A refined-gold · light | 8.26                 | 15.01        | 5.21           | 17.37        | 6.03           | 16.38              | 14.18             | 8.26                              |
| A refined-gold · dark  | 10.87                | 13.52        | 5.97           | 15.01        | 6.63           | 16.31              | 11.51             | 1.50                              |
| B red-carpet · light   | 8.76                 | 14.40        | 5.14           | 18.00        | 6.43           | 15.95              | 14.69             | 8.56                              |
| B red-carpet · dark    | 10.61                | 14.63        | 7.38           | 15.90        | 8.02           | 16.90              | 12.41             | 1.50                              |
| C ballot · light       | 15.41                | 13.96        | 5.91           | 16.51        | 6.99           | 15.41              | 13.55             | 1.00                              |
| C ballot · dark        | 15.04                | 12.90        | 5.75           | 13.97        | 6.23           | 15.04              | 10.87             | 1.00                              |
| D noir · light         | 17.17                | 15.55        | 5.68           | 18.88        | 6.90           | 17.17              | 15.27             | 1.00                              |
| D noir · dark          | 17.58                | 14.55        | 6.46           | 16.16        | 7.17           | 17.58              | 12.47             | 1.00                              |
| E festival · light     | 6.44                 | 16.17        | 5.45           | 17.67        | 5.95           | 19.30              | 14.32             | 3.00                              |
| E festival · dark      | 6.44                 | 14.60        | 6.45           | 16.28        | 7.19           | 17.67              | 12.46             | 5.90                              |
| F technicolor · light  | 5.19                 | 14.03        | 5.84           | 16.45        | 6.85           | 15.59              | 13.46             | 3.01                              |
| F technicolor · dark   | 5.19                 | 12.89        | 7.49           | 15.00        | 8.72           | 16.42              | 11.31             | 5.00                              |
| G lightbox · light     | 18.42                | 14.56        | 5.73           | 18.42        | 7.25           | 15.68              | 15.04             | 1.00                              |
| G lightbox · dark      | 15.48                | 13.00        | 6.05           | 14.30        | 6.66           | 15.48              | 11.04             | 1.00                              |

Shared pairs (every brand, light/dark where they differ): `#0d0d0d` on win gold 9.24 / 11.20 (and a gold glyph on a `#0d0d0d` circle, the same); on silver 10.85; on bronze 5.28; danger-on on danger 4.94. The last column is the current bug on the tooltip drafted chip (5.2); after the fix the avatar reads on-primary on primary, 5.19 or better.

All text pairs pass 4.5. Icons use the same pairs as the text beside them and pass 3:1 for non-text. Tab fills are not contrast-tested against the page because the tab's meaning is in its words.

### 4.4 Tab edges (computed, `ring` and `drop` brands)

Only F and G use the card ring on the tab. The edge colour changes with the tone so it never merges with the fill:

| Brand · mode          | `rest`, `paused` (vs page / sunken) | On `primary` (vs primary / page)   | On `danger` (vs danger / page) | On `final`: `#0d0d0d` (vs metals; vs page)                       |
| --------------------- | ----------------------------------- | ---------------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| F technicolor · light | `text` 15.59 / 14.03                | `text` 3.01 / 15.59                | `text` 3.19 / 15.59            | at least 5.28; 18.11                                             |
| F technicolor · dark  | `text` 16.42 / 12.89                | `text` 5.00 / 16.42                | `text` 4.71 / 16.42            | at least 5.28; 1.06, but every metal is 4.96 or more on the page |
| G lightbox · light    | `text` 15.68 / 14.56                | `ruleStrong` `#7f807e` 3.38 / 3.38 | `text` 3.51 / 15.68            | at least 5.28; 16.54                                             |
| G lightbox · dark     | `text` 15.48 / 13.00                | `ruleStrong` `#756b6b` 3.66 / 3.66 | `text` 4.30 / 15.48            | at least 5.28; 1.03, but every metal is 5.13 or more on the page |

Why per tone and not one "edge on fill" value: in G no single colour reaches 3:1 against both its black primary and the mid red of `--fo-danger`, and in dark mode no colour reaches 3:1 against both the dark page and the light metals. On `final` the edge separates the metal cells and the metals carry the silhouette against the dark page. Tab edges `keyline`, `double`, `lift` and `flat` draw no ring and are not part of this table: `keyline` is tone ink inside the fill; `double` keeps a page-coloured gap between its two `text` lines, so its outer line always reads against the page.

## 5. Component rules

### 5.1 Card edge and gaps

The visible gap between card edges is constant. Components compute margins from the lever:

- `.dr-card`: `margin-inline: calc(var(--fo-space-dense-1) + var(--brand-room-ring))`, `box-shadow: var(--brand-room-card-shadow)`, `border-radius: var(--fo-radius-medium)` (the existing transparent border stays, so nothing inside the card moves). Result: 5 px visible to the rail or frame and 10 px between cards at any ring.
- `.dr-masonry-col` gap: `calc(var(--fo-space-xs) + 2 * var(--brand-room-ring) + var(--brand-room-drop))`. Visible vertical gap 12 at every lever value (the drop layer reaches `ring + drop` below a card; the next card's ring reaches `ring` above it).
- `.dr-masonry` block padding: `calc(var(--fo-space-dense-1) + var(--brand-room-ring))` at the top, `calc(var(--fo-space-8) + var(--brand-room-ring) + var(--brand-room-drop))` at the bottom. The phone category stack uses the same gap and bottom padding. Roster cards follow 5.4.
- `.dr-header { box-sizing: border-box }` with `flex: 0 0 var(--fo-db-headerHeight)`. The section rule now sits inside the 64 px box, so a double rule no longer pushes the board down 2 px.
- `depth` layers do not affect gaps; they are translucent and sit outside the geometry calculation.

Rails stay flush with 1 or 2 px borders; rails are not cards and take no drop.

### 5.2 Icon rule set

**Finding, Best Actress (verified in the data).** The seed defines the category in `tests/visual/support/dataset.ts` (`{ code: "best-actress", ..., icon: "face" }`); `buildDataset` stores it as the `icon` row's `code`, and `services/drafting/draftBoard.ts` returns it as `icon_code`. `materialGlyph` treats any four hex characters as a code point, and `face` is four hex letters, so the app draws U+FACE, a CJK ideograph (`龜`), from a system fallback font. That is the muddy square in the baselines; it is not a colour problem. The database fixtures (`golden-nominees.json`, `dev-minimal-nominees.json`) use `icon-film` and `film`, so production data seeded from them is unaffected, but any admin-entered name such as `face`, `cafe`, `feed` or `fade` hits the same bug. Fix in `decisions/admin/materialGlyph.ts`: treat a value as a code point only when it is four hex digits within the Private Use Area, `0xE000`–`0xF8FF`; otherwise it is a ligature name. Unit tests: `face`, `e87c`, an uppercase code, an empty string, an unknown name.

**Findings, audit.** Every glyph in the room reads a fixed ink whatever its surface:

| Site                                                        | Today                                                                  | Issue                                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Category icon, card title and rail/roster pills             | `.mi-icon` hard-coded `--fo-text-primary`, FILL 1, weight 500 or 600   | Filled blobs next to 1 px line-art avatars; ink fixed whatever the surface; muted pills keep full-ink icons                                                  |
| `.dr-icon-punchout`                                         | circle in text colour, glyph in page colour on every surface           | On a winner pill in dark mode the circle is cream on gold (about 1.5:1, the circle vanishes); an exclusion from the winner rule exists only for plain glyphs |
| Avatar on tooltip drafted chip (`.fo-tip-draftedChip`)      | avatar mask always `--fo-text-primary`; chip fill is `--brand-primary` | **1.00:1 in C, D and G in both modes, 1.50:1 in A and B dark.** The avatar disappears (table 4.3)                                                            |
| Armed mark, winner plain glyph                              | hand-set per state                                                     | Correct, but a separate rule per state                                                                                                                       |
| Buckle glyph, phone bar glyphs and buttons                  | several `data-turn` selectors, each recolouring its child              | Works, but brittle and duplicated                                                                                                                            |
| Header icons (`.gicon`, `.mi-icon` in back, pause, toggles) | `.gicon` has no colour and inherits Mantine's `subtle` button colour   | Does not read the room's ink                                                                                                                                 |

**One rule set (five rules):**

1. **Every surface in the room states its ink and ground as two local properties**, `--dr-ink` and `--dr-ground`, plus `--dr-ink-soft` for labels. The surface owner sets them; children only read them. Owners: `.dr-frame` (default `--brand-text` on `--brand-page`), `.dr-card` and rails (on `--brand-raised`), `.dr-pill` per state (muted: `--brand-muted` on `--brand-sunken`; armed: `--brand-page` on `--brand-text`; winner: `--fo-win-gold-on` on `--fo-win-gold`), the header tab per tone (5.3), `.fo-tip-draftedChip` (`--brand-on-primary` on `--brand-primary`).
2. **Icons read the ink, nothing else**: `.dr-frame .mi-icon, .dr-frame .gicon, .drh-stripTip .gicon { color: var(--dr-ink); }`. Avatars use it as their mask fill: `.dr-frame .fo-animalAvatar::before, .fo-tip-draftedChip .fo-animalAvatar::before { background: var(--dr-ink); }`. `.fo-tip-draftedChip` sets `--dr-ink` itself because the tooltip is portaled outside `.dr-frame`. Delete the per-state overrides. Icon opacity follows the pending pill state, as text does.
3. **Punchout is the surface inverted**: `background: var(--dr-ink); color: var(--dr-ground)`. A winner pill gives an ink circle with a gold glyph (`#0d0d0d` / `#e2c25a`, 9.24 or 11.20); a muted pill gives a muted circle and a sunken glyph. Circle size fixed, 1 px padding.
4. **Glyph axes**: category and interface glyphs in the room are outlined, `FILL 0`, `wght 400`, `opsz 20`, matching the avatars' single-stroke line art at 14 px (rendered and compared). Only state marks are filled: `check` (armed), `timer` and `pause` use `FILL 1`, `wght 600`. Implementation: `.mi-icon` reads `--mi-fill`, `--mi-wght` and `--mi-opsz`, with today's values as defaults outside the room; `.dr-frame` sets `--mi-fill: 0; --mi-wght: 400`; `.dr-pill-armedMark, .drh-tabGlyph` set `--mi-fill: 1; --mi-wght: 600`.
5. **Sizes**: tiny glyph 14 in a 14 box (`padding: 0` in the room; punchout keeps 1 px), tab glyph 16, stub icon 18, phone nav icon 20, header controls 16 (`.gicon` 16 inside `.drh-toggleBtn`). `.dr-frame` gives `.gicon` the same `-webkit-font-smoothing` as `.mi-icon`.

### 5.3 The header tab (buckle replacement)

**Concept (owner's choice, gallery option B1).** A tab that hangs from the top edge of the screen, in normal grid flow between the wings: square at the top, rounded only at the bottom corners, 10 px clear of the header's bottom rule. Its width is set by CSS alone; content never changes it. Inventory source for states: 3.2 and 2.8.

**Desktop geometry** (desktop tree, 500 px and wider):

- `.drh-row` becomes a grid: `grid-template-columns: minmax(0, 1fr) var(--fo-db-tabWidth) minmax(0, 1fr)`, `height: 100%`, `padding-inline: var(--fo-db-headerPadX)`. DOM order: left wing, tab, right wing. Screen readers now reach the draft state before the right-hand controls; the tab order is unchanged because the tab has no focusable content.
- `--fo-db-tabWidth: clamp(15.5rem, 32vw, 27.5rem)` (248 to 440 px, 410 at 1280). In final results (`.dr-frame[data-results="final"]`): `clamp(20rem, 56vw, 45rem)` (716 at 1280; the wings are nearly empty in that state).
- `.drh-tab`: `align-self: start`, top flush with the screen edge, `height: var(--fo-db-tabHeight)` (54 px), `box-sizing: border-box`, `display: grid`, `grid-template-columns: var(--fo-db-tabStat-w) minmax(0, 1fr) var(--fo-db-tabStat-w)` with stat cells 56 px at every width, `background: var(--dr-ground)`, `background-clip: padding-box`, `color: var(--dr-ink)`, `border-radius: 0 0 var(--dr-tab-r) var(--dr-tab-r)` where `--dr-tab-r: min(var(--brand-radius-md), 18px)`.
- The centre cell has `border-inline: 1px solid color-mix(in srgb, var(--dr-ink) 16%, transparent)`, `padding-inline: 10px`, and is a size container (for the clock rule below).

**Tab edge.** One rule in CSS, multiplied by the derived properties in 3.3, so no component branches on the enum:

```css
.drh-tab {
  border: var(--brand-room-tab-border) double var(--brand-text);
  border-top-width: 0;
  margin-top: calc(-1 * var(--brand-room-tab-ring));
  height: calc(var(--fo-db-tabHeight) + var(--brand-room-tab-ring));
  box-shadow:
    inset 0 0 0 calc(3px * var(--brand-room-tab-keyline)) var(--dr-ground),
    inset 0 0 0 calc(4px * var(--brand-room-tab-keyline))
      color-mix(in srgb, var(--dr-ink) 75%, transparent),
    0 0 0 var(--brand-room-tab-ring) var(--dr-tab-edge),
    0 var(--brand-room-tab-drop) 0 var(--brand-room-tab-ring) var(--dr-tab-edge),
    0 0 0 calc(1px * var(--brand-room-tab-lift)) var(--brand-rule),
    0 calc(4px * var(--brand-room-tab-lift)) calc(12px * var(--brand-room-tab-lift))
      rgba(var(--fo-black-rgb), calc(var(--fo-alpha-18) * var(--brand-room-tab-lift)));
}
```

(The builder writes the literal pixel values as `--fo-db-*` tokens to satisfy `tokens:check`.)

| `tabEdge` | What it draws                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flat`    | Nothing: the fill alone                                                                                                                                                                       |
| `keyline` | A 1 px line 3 px inside the edge, in the tone ink at 75 %. On the podium the keyline drops its top edge, follows the corners and uses `#0d0d0d` at 55 % (a `::before`), as the gallery showed |
| `double`  | A 3 px double rule in `text` on the sides and bottom, no top edge; the background is clipped to the padding box, so the gap between the lines shows the page                                  |
| `ring`    | The card ring (`max(ring, 1)` px) in the tone's edge colour (4.4); the top edge sits above the screen and is hidden                                                                           |
| `drop`    | The ring plus a hard drop of `min(max(drop, 4), 7 - ring)` px; the lowest edge stays within 61 px of the top, inside the header                                                               |
| `lift`    | A 1 px `rule` line and a soft shadow (`0 4px 12px`, black at 18 %) from the shared shadow channel; the blur may fade over the header rule, which is decorative                                |

**Tones.** `data-tone` on the tab sets `--dr-ground`, `--dr-ink`, `--dr-ink-soft` and `--dr-tab-edge`:

| `data-tone`         | Trigger                                   | Ground                                                              | Ink                  | Soft ink (kicker, stat labels) | Tab edge colour                    |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------- | -------------------- | ------------------------------ | ---------------------------------- |
| `rest`              | Not started, others' turn, draft complete | `--brand-sunken`                                                    | `--brand-text`       | `--brand-muted`                | `--brand-room-tab-edge`            |
| `paused`            | `PAUSED`                                  | `--brand-sunken`                                                    | `--brand-text`       | `--brand-muted`                | `--brand-room-tab-edge`            |
| `mine`              | My turn, preview                          | `--brand-primary`                                                   | `--brand-on-primary` | `--brand-on-primary`           | `--brand-room-tab-edge-on-primary` |
| `countdown-primary` | Last 5 s on my turn, gold phase           | `--brand-primary`                                                   | `--brand-on-primary` | `--brand-on-primary`           | `--brand-room-tab-edge-on-primary` |
| `countdown-danger`  | Last 5 s on my turn, red phase            | `--fo-danger`                                                       | `--fo-danger-on`     | `--fo-danger-on`               | `--brand-room-tab-edge-on-danger`  |
| `final`             | Final results (podium)                    | Per cell: `--fo-win-gold`, `--fo-medal-silver`, `--fo-medal-bronze` | `--fo-win-gold-on`   | Same ink                       | `--fo-win-gold-on`                 |

**Content by state.** One pure decision, `decisions/draft/headerStatus.ts`, `computeHeaderStatus(...)`, used by desktop and phone, replacing the two duplicated copies. It returns the tone, kicker, headline, headline kind (`name`, `clock` or `status`), glyph and whether the stat cells show.

| State                      | Round / Pick cells           | Kicker (10 px, label case)                                      | Headline                                             | Glyph                |
| -------------------------- | ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- | -------------------- |
| Pre-draft (`PENDING`)      | `—` / `—`                    | none (headline centred)                                         | "Not started", title voice, 17 px                    | none                 |
| Paused                     | current round / pick         | none                                                            | "Paused", title voice, 17 px                         | `pause` (16, filled) |
| Others' turn, no timer     | round / pick                 | "On the clock"                                                  | active seat name, working font, 15 px semibold       | none                 |
| My turn, no timer          | round / pick                 | "Your pick"                                                     | my name                                              | none                 |
| Timer running, others      | round / pick                 | active seat name (working font, 11 px semibold, no case change) | clock string, 18 px, weight 700, digit cells (below) | none                 |
| Timer running, mine        | round / pick                 | "Your pick"                                                     | clock string                                         | none                 |
| Countdown (mine, last 5 s) | round / pick                 | "Your pick"                                                     | "{N}s left" (`formatCountdownText`), 18 px           | `timer` (16, filled) |
| Preview                    | as my turn (`Alice`)         | "Your pick"                                                     | name                                                 | none                 |
| Draft complete             | hidden; centre spans the tab | none                                                            | "Draft complete", title voice, 17 px                 | none                 |
| Final results              | n/a; podium layout           | see Podium                                                      | see Podium                                           | none                 |

Stat cells show a 10 px label ("Round", "Pick") over a 14 px bold tabular number. Names and strings in the centre use one line, an end ellipsis and `title` for the full value. Hover has no effect. Mine versus theirs now carries a non-colour cue: the kicker "Your pick".

**Clock rule.** The width cannot jump: the tab width is CSS, independent of text. Digits are stabilised in every font by `<TabularText>` (a new small component in `ui/`): each digit in a clock string is wrapped in `<span class="dr-digit">` with `display: inline-block; width: 1ch; text-align: center`, so even fonts without tabular figures (DM Sans, in B and F) never shift. Elsewhere numbers get `font-variant-numeric: tabular-nums` and fixed-width columns (5.5). When the centre cell is narrower than 180 px (an `@container` query; at the 248 px minimum width the centre is 136 px) the clock drops to 14 px, and the longest string "120s • 119s left" fits: Inter, the widest listed work font, is 110 px; Montserrat, the stress font, 112 px.

**Countdown non-colour cue.** Constant in both phases: the `timer` glyph, the words "{N}s left", and an inner frame, a `::after` with `inset: 0 4px 4px`, `border: 2px solid var(--dr-ink)`, `border-top: 0` and `border-radius: 0 0 max(0px, var(--dr-tab-r) - 4px) max(0px, var(--dr-tab-r) - 4px)`, so it follows the bottom corners. Only the ground, ink and edge colour alternate, driven by `useCountdownPhase` (the tone flips every 700 ms). Reduced motion holds `countdown-danger`. A 120 ms transition on background and colour, in countdown only.

**Podium.** Final results, `showPodium`:

- The tab becomes up to three flush cells with no gaps, no stat cells and no centre borders: three places `1fr 1.4fr 1fr`, two places `1fr 1fr`, one place a single cell. DOM order 1st, 2nd, 3rd; visual order by grid column 2nd, 1st, 3rd (the conventional podium). Each cell's ground is its metal; `overflow: hidden` keeps the metals inside the rounded corners.
- Each cell shows a kicker ("Winner", "2nd", "3rd"; tied: "Joint winner", "Tied 2nd", "Tied 3rd") and one centred name, working font, 15 px semibold, end ellipsis, `title`. The longest username (61 characters) truncates at its end in every cell.
- Ties: names cycle every 1500 ms with the existing roll animation (renamed `drh-tab-roll`, 280 ms). The name element is `aria-hidden` and the cell carries `aria-label="First place: a, b (tied)"`. Reduced motion swaps instantly. The cycle resets when the podium changes. One shared hook, `usePodiumCycle`, for both trees.
- No podium (no winner resolved) falls back to "Draft complete".

**Phone.** The bar keeps its 64 px height with a `page` background and the section rule; the tab sits between the 44 px menu button and the 44 px settings button (or its same-size spacer), top flush, 54 px tall, same corners, edges and tones. `.dr-mobileBar` becomes `grid-template-columns: 44px minmax(0, 1fr) 44px`. Inside, the same three cells with 56 px stat cells (44 px overflowed with tracked capital labels), centre `padding-inline: 4px`, headline 16 px (name or clock), 14 px when the centre is below 180 px (viewports narrower than about 380 px; at 320 the longest clock still fits). Final results on the phone: the podium moves into the tab, cells `1fr 1.3fr 1fr`, names 14 px with an end ellipsis, kickers as desktop; the three stacked podium rows below the bar are removed. The menu button stays (it holds "Back to seasons" and the view switch); see 9 (a) for the one open point.

**Header compaction** becomes simple and robust:

- `decisions/draft/headerLayout.ts`: `shouldCompactHeader({ headerWidth, tabWidth, leftNeeded, rightNeeded, wasCompact })` is pure (hysteresis 10/22 from the existing tokens) and unit tested.
- `useHeaderCompaction` holds one effect with one `ResizeObserver` watching the header element, the left measure wing and the right measure wing. Width changes from a theme swap, a font swap or a roster change all arrive through the measure wings, so `compute` needs no dependency array and no `document.fonts` listener. The duplicated content effect is deleted. Below 665 the user badge is omitted from the wing (the identity is in the drawer, and nothing essential is lost) and the pause button shrinks to 44.
- `useParticipantStripLayout` keeps its behaviour; the visible wing's own width changes are already measured.

### 5.4 Roster rotation

**Decided by the owner (gallery round 2):** one-seat steps with an animated slide; 48 px of each neighbouring column showing, dimmed; two plain icon buttons in a row above the cards at its outer edges; no visible position text.

**Window model**, `decisions/draft/rosterWindow.ts` (pure, unit tested):

- `rosterGeometry(boardWidthPx, layout)`: peek 48 on desktop, 28 on the phone; column gap 12; side allowance `peek + 12`; inner width `board − 2 × side`. Capacity: desktop `clamp(1, floor((inner + 12) / 188), 6)`, so columns are at least 176 px; phone always 1. Column width `(inner − 12 × (capacity − 1)) / capacity`. At 1280: 6 columns of 183 px; at 1100: 5; at 768: 3; at 500: 2; phone at 390: one column of 310 px.
- `stepWindow(start, dir, capacity, count)` moves one seat and clamps so the window stays full (from 1–6 of 8, next shows 2–7). No wrap: the ends are real.
- `windowForSeat(seatIndex, capacity, count)` for the phone's seat select: that seat becomes the first visible, clamped.
- Works for any seat count from 2 to `league.max_members` (10 for a private league by default; `PUBLIC_SEASON_MAX_MEMBERS` defaults to 200, though public seasons have no web entry point today). Only the window and one column on each side are rendered, so 200 seats cost the same as 6.

**Desktop treatment** (`RosterBoardScaffold`, new `RosterTrack.tsx`):

- Row `.dr-rosterControls` in flow above the board, `position: sticky; top: 0; z-index: 2; background: var(--brand-page)`, rendered only when seats exceed capacity. Its inline padding equals the side allowance (60 px), so each button lines up with the edge of the visible window.
- Buttons: `ActionIcon` 32 px, glyphs `chevron_left` and `chevron_right`, button radius and the theme's control edge, `aria-label` "Previous seat" and "Next seat". At an end the button stays focusable with `aria-disabled="true"`, muted ink and no fill, and does nothing.
- No visible position text. A visually hidden `aria-live="polite"` line announces "Seats 7 to 12 of 14" after each step.
- Peeks: 48 px of the neighbouring column, only on a side where more seats exist, at 42 % opacity. Clicking a peeking column steps one seat towards it. Peek width and dimming are fixed by the template, not levers.
- Motion: the track translates one column width plus gap, 320 ms, `cubic-bezier(0.22, 0.8, 0.26, 1)`. Reduced motion: instant.
- A horizontal drag of more than 40 px on the board steps one seat (pointer events, `touch-action: pan-y` so vertical scrolling is untouched).
- Seat counts at or below capacity: no controls, no peeks, columns centred at the computed width.
- Cards: each card sits in its column with `margin-inline: var(--brand-room-ring)`, so the visible gap stays 12 px at any ring; the board's block padding is `calc(8px + ring)` at the top and `calc(16px + ring + drop)` at the bottom.

**Phone treatment** (`MobileRosterBoard`): one column with 28 px peeks; the same sticky row with 44 px buttons at the outer edges; the existing seat `Select` stays between them as the way to jump to a player (it names the seat, so it is not position text), labelled by `aria-label="Roster seat"` instead of the visible "Roster" label. The live line announces "Seat 2 of 6".

**Keyboard and accessibility, both layouts.** The board is `role="region"`, `aria-label="Roster board"`, `tabIndex=0`. Tab order: Previous seat, (phone: the select), Next seat, the board, then the cards. ArrowLeft and ArrowRight step one seat, Home and End go to the first and last window, when focus is within the board but not in an input or open list. If a step unmounts the focused element, focus moves to the board. Every control keeps the ink focus ring, not clipped by the sticky row.

`ParticipantStrip` keeps its automatic window around the active seat (its job is "who is next", not browsing): no arrows. It adopts the same radius rules; the `+N` chips stay focusable with their tooltip list and gain the hidden names in their accessible name ("3 more: a, b, c").

### 5.5 Rails, pills, category and roster cards

**Pills.** Radius `var(--brand-radius-sm)` (`.dr-pill` and every pill-shaped variant), padding 10, `border: var(--fo-border-width) solid var(--fo-border)`. All states per 3.2. Text uses `color: var(--dr-ink)` and the state's weight.

**Rail rows.** `.dr-ledgerRow`: `grid-template-columns: calc(var(--dr-meta-ch) * 1ch) var(--fo-hit-size-sm) minmax(0, 1fr)`; `.dr-rosterRow`: `calc(var(--dr-meta-ch) * 1ch) minmax(0, 1fr)`. `--dr-meta-ch` is set once per rail with `useCssVars`, from `max(3, longest roundPick length)` in glue, so all rows in a rail share column widths and every pill left edge aligns. `.dr-railMeta`: `font-variant-numeric: tabular-nums`, `text-align: end`. Phone rails follow the same rules. Future-pick rows ("3-1", "—") share the column.

**Roster card.** Same `.dr-card` look. Title row: avatar, name (one line, ellipsis, `title`), score in a `min-width: 3ch; text-align: end; font-variant-numeric: tabular-nums` cell in `--brand-font-numeral`, 16 px.

**Category card.** Same geometry. Title 10 px bold, working font, wraps; a weight such as `+2` stays at the row's end. Masonry estimate unchanged.

**Rail titles.** `.dr-railPaneTitle`: `--brand-room-font-title`, 12 px, `--brand-room-title-weight`, label case, tracking, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, `title` with the name. The strings are fixed, so clipping is unusual.

**Header controls.** `.drh-back`, `.drh-pause`, `.drh-settingsBtn`, `.drh-toggleBtn`, `.dr-railClose`, the roster buttons, `.drh-token` and `.dr-railToggle` all take `var(--brand-button-radius)`. `.gicon` is 16 px in the room.

**Auto-draft rail (desktop).** `Checkbox size="xs"` with a 12 px working-font label, `Select size="xs"` (30 px, 12 px text) with a 12 px label, row gap 12. The phone tree stays 44 px (the `--input-height-sm` override, unchanged). The plan select appears for custom, as today.

**Connection indicator, cursor label, tooltip drafted chip.** Radius `--brand-radius-sm`. The chip's avatar follows rule 2 in 5.2.

**Loading, error, reconnect.** Loading: the skeleton's header block becomes a 64 px band with a tab-shaped block hanging in the middle; the rest as today. Load error: keep `PageError` and add a secondary "Back to seasons" button linking to `/seasons` (inventory 3.2: today the state has no way back). Reconnecting and disconnected: indicator unchanged, picks disabled as today, the tab keeps showing the state.

### 5.6 Fonts in the room

**The width check (working text).** A font may be `room.workFont` only if it is in `ROOM_WORK_FONTS`, and it can enter that list only by passing all of these, measured in Chromium at 100 px, weight 500 (400 if the family has no 500), kerning on:

1. **Width, sentence case**: `Saint Marguerite of the Docks`, between 0.85 and 1.10 times Inter.
2. **Width, capitals** (labels): `DRAFT HISTORY`, at most 1.10 times Inter.
3. **x-height** at least 0.49 em, and x-height divided by cap height at most 0.80, so the font is not capitals only.

Measured:

| Font                      | lc ratio  | caps ratio | x-height  | x/cap     | Result                                     |
| ------------------------- | --------- | ---------- | --------- | --------- | ------------------------------------------ |
| Inter (reference)         | 1.000     | 1.000      | 0.546     | 0.75      | pass                                       |
| Archivo                   | 0.930     | 1.005      | 0.526     | 0.77      | pass                                       |
| Instrument Sans           | 0.967     | 0.991      | 0.510     | 0.71      | pass                                       |
| DM Sans                   | 0.981     | 0.924      | 0.504     | 0.72      | pass                                       |
| Montserrat                | 1.063     | 1.043      | 0.530     | 0.76      | pass (stress theme, section 6)             |
| IBM Plex Mono             | 1.225     | 0.981      | 0.516     | 0.74      | fail: width                                |
| Cinzel                    | 1.179     | 1.016      | 0.600     | 0.86      | fail: width, capitals-only                 |
| Fraunces, Bodoni          | 0.98–1.00 | 1.06       | 0.46–0.47 | 0.61–0.67 | fail: x-height                             |
| Oswald                    | 0.810     | 0.767      | 0.578     | 0.71      | fail: width (too condensed)                |
| Bebas Neue, Anton         | 0.71–0.84 | 0.58–0.69  | —         | 0.85–1.00 | fail: capitals-only                        |
| Orbitron                  | 1.159     | 1.180      | 0.580     | 0.81      | fail: width, capitals-only                 |
| Monoton, Michroma         | 1.30–1.35 | 1.15–1.47  | —         | —         | fail: width                                |
| Creepster, UnifrakturCook | 0.80–0.84 | 0.67–0.99  | —         | 0.70–0.98 | fail: width (Creepster also capitals-only) |

Tabular figures are not a gate: only some faces have them, and digit cells handle the clock (5.3).

**Title face check.** `display` is allowed only if the family is in `ROOM_TITLE_FONTS`, which requires `DRAFT HISTORY` at 12 px, 0.06em tracking, at most 122 px wide (it fits a 1280 rail title cell), and a named 12 px legibility review of the rendered face by the design reviewer. Measured at weight 500: Cinzel 106, Playfair 102, Barlow Condensed 73, Fraunces 111, Plex 103, Archivo 105; Monoton 119 and Orbitron 122 pass width but fail the legibility review; Michroma 150 fails width. A theme with a decorative wordmark and no approved title voice uses `label` or `work`.

Decorative faces are limited to the wordmark and titles: rail pane titles and the tab's fixed status words ("Not started", "Paused", "Draft complete") are the only room sites that can use a title face. Names, clocks, pills and numbers are always `room.workFont`. Working text uses weights 400 to 700, and a contract test checks the brand's `faces` declare them for its work font.

### 5.7 Accessibility and phone targets

Phone (below 500): roster buttons and select 44, menu and settings 44, rail bar unchanged; the tab is not interactive. Desktop roster buttons are 32 px, consistent with the header controls. The tab is not a live region (`DraftLiveRegion` announces picks and turns); it has `role="group"` and `aria-label="Draft status"`, with stat labels and headline as readable text.

## 6. Enforcement (how the levers stay locked)

1. **Contract tests** (`brandContract.test.ts`):
   - `room` is filled with allowed values; `ring`, `ringColor`, `depth`, `titleFace` and `tabEdge` are enum members; `drop` is an integer in range and zero when `ring` is 0.
   - `shape.radiusSm/Md/Lg` and `borderWidth` are within the ranges in 3.1.
   - `room.workFont`'s first family is in `ROOM_WORK_FONTS`; a `display` title voice requires a family in `ROOM_TITLE_FONTS`; the brand's `faces` declare weights 400, 500, 600 and 700 of the work font.
   - For every brand whose `tabEdge` is `ring` or `drop`, in both modes: the rest edge reaches 3:1 against `page` and `sunken`; the on-primary edge against `primary` and `page`; the on-danger edge against `--fo-danger` and `page`; `--fo-win-gold-on` against each metal, and either against `page` or every metal against `page` (4.4).
   - The tab's lowest painted edge (`54 + tabRing + tabDrop`) is at most 61 px for every brand and for the stress definition.
   - `generateBrandCss` emits every derived `--brand-room-*` (snapshot updated) and throws for a brand with no qualifying tab edge colour.
   - A test brand at the extremes of every range (the stress definition below) passes these checks.
2. **Width check in the assertion tier**: one page per run measures every family in `ROOM_WORK_FONTS` against 5.6 in real Chromium, so the list can never drift from the rule.
3. **CSS check** (`tokens-check.mjs`): in `.dr-*`, `.drh-*`, `.drm-*` and `.fo-tip-*` rules, fail on any `[data-brand`, any read of an enum-valued property (`--brand-button-shape`, `--brand-nav-active`, `--brand-rule-style`, `--brand-wordmark-two-tone`, and any `room` enum if one is ever emitted), and any brand slug; in `features/draft/**`, fail on any brand module import, `data-brand` read or brand-id comparison. A second rule, landing with the pill fix, fails on `border-radius: var(--fo-radius-pill)` in those rules.
4. **Geometry assertions** (`tests/visual/assertions/pageChecks.ts`, a new `roomFindings`, run on every draft screen in every brand, both modes, both viewports; no baselines):
   - Every `.dr-ledgerRow` and `.dr-rosterRow` pill left edge equal within 0.5 px per rail.
   - Between consecutive cards in a masonry column and across columns, the gap between card edges, including the computed ring and drop, is at least 12 and 10 px (within 0.5 px); roster columns at least 12 px apart and at least 176 px wide on desktop.
   - Header box height is 64 regardless of rule style.
   - Tab: its top at the header's top (allowing the hidden ring), its lowest painted edge at most 61 px from the top, no child outside its rect, the wings' rects never intersecting it, and its width equal across two advanced clock ticks (`page.clock`) on `draft-live-countdown`. On every draft screen a `.drh-tab` must exist, so the checks cannot pass vacuously.
   - Every `.dr-frame .mi-icon, .gicon` computed colour reaches 3:1 against its nearest opaque background; the punchout circle against its surface 3:1; `.fo-tip-draftedChip .fo-animalAvatar::before` is on-primary.
   - `.dr-pill` computed border-radius equals `--brand-radius-sm`.
   - The existing overflow, clipped-text and overlap checks run unchanged and must pass for the stress theme.
5. **Stress theme, visual tier only.** `tests/visual/fixtures/stressBrand.ts` exports a value typed `BrandDefinition` (so the compiler demands every slot) at the far edge of every range: ring 3, drop 6, glow depth, `tabEdge` `drop` (its drop clamps to 4, lowest edge 61 px), `radiusSm` 12, `radiusMd` 20, `borderWidth` 2, `workFont` Montserrat (the widest passing), a `display` title voice in Cinzel, a double section rule. The assertion and screenshot specs apply it with `page.addStyleTag(generateBrandCss([stress], stress))` plus a pinned `@font-face` in `tests/visual/fixtures/` (like `material-symbols.woff2`): no runtime brand id, no production code path, no change to `BRAND_IDS`. It is exercised with a rewritten snapshot through `rewriteDraftSnapshot`: `long` on the clock, 12 seats, 61-character names and a tied podium. All assertions must pass.
6. **Visual matrix.**
   - Brand screens become per viewport: add `draft-live-countdown` (desktop) and `draft-completed` (desktop and phone) for each non-default brand in its primary mode: 6 × 3 = 18 new cells. The default brand already has these.
   - Stress theme: `draft-live-your-turn` desktop and phone, `draft-live-countdown` desktop (long name on the clock), `draft-completed` desktop (12 seats, tied podium) and phone: 5 cells.
   - The specimen's draft section grows to cover every pill state with the punchout variant, every tab tone with both countdown phases, the podium with ties, card edges, roster controls at both ends and an icon audit row. The specimen already renders per brand × both modes at desktop and the primary mode on the phone, so this adds no cells.
   - Armed, paused and hover-match stay default-brand cells; their per-theme risk is colour, which the specimen and axe cover.
   - Total: 23 new baselines, 124 to 147 (section 11).

## 7. Deviations from the mockups

The mockups showed a display-face pill floating in the header with an offset shadow, always-rounded board pills in square themes, teal "complete" fills and side-flanking roster arrows. There are no new mockups for this package; the owner chose from rendered galleries.

| #   | Mockup detail                                 | Decision                                                                      | Why                                                                             | Designer input needed |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| D1  | Status as a floating pill with offset shadow  | Hanging tab, bottom corners only, 10 px clear of the rule, closed edge enum   | Owner decision 3 and gallery choice: corners and overhang failed in many themes | No                    |
| D2  | Headline in the display face                  | Fixed status words only; names and clocks in the working font                 | Long usernames and clock digits must fit and not shift                          | No                    |
| D3  | Pills always rounded, including square themes | Follow `radiusSm`                                                             | Owner decision 1                                                                | No                    |
| D4  | Roster arrows flanking the grid               | Icon buttons above the board at its outer edges, dimmed peeks, one-seat slide | Owner decision 4 and gallery choice                                             | No                    |
| D5  | Teal fill for complete                        | Sunken rest fill                                                              | Status colours have no fill meaning in the room                                 | No                    |
| D6  | Technicolor card shadow crowding the rails    | Same look, gaps widened by the formula                                        | The poster look is preserved; the gap bug is not                                | No                    |

## 8. Acceptance per screenshot

**All draft cells, all brands and modes.** Header 64 px including its rule; the board does not shift between themes; no pill reads as always round in C, D or G; pill left edges align per rail; card gaps match the lever in every theme; Best Actress shows the `face` glyph; icons are outlined and match the text ink on every surface; no text pair falls below table 4.3.

| Cell group                                                      | What the reviewer should see                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft-live-your-turn`, all brands, desktop                     | A 410 px tab hanging from the top edge, 54 px tall with 10 px clear above the rule, bottom corners per 4.2, in primary, kicker "Your pick", the name, Round 3 and Pick 13 in 56 px cells. Tab edge per brand: A lift, B keyline, C and D double, E flat, F ring with a 5 px drop, G ring (in G's light mode a grey ring on the black fill). Board cards with theme edges and 10/12 visible gaps. Rail titles in the voice of 4.1 |
| `draft-live-your-turn`, phone                                   | Page-coloured bar, menu and settings 44 px, the tab between them with 56 px stat cells, kicker, name at 16 px; category cards with gaps                                                                                                                                                                                                                                                                                          |
| `draft-live-not-your-turn`                                      | Sunken tab with ink, kicker "On the clock", the active name; no pill hover                                                                                                                                                                                                                                                                                                                                                       |
| `draft-live-armed`                                              | Armed pill an ink fill with a leading check, tooltip open with confirm; pill states unchanged from 02/03                                                                                                                                                                                                                                                                                                                         |
| `draft-live-countdown`, default and brand cells                 | Tab in primary or danger per phase, the inner 2 px frame without a top edge following the corners, `timer` glyph, "4s left"; the same width as every other tone; phone the same                                                                                                                                                                                                                                                  |
| `draft-paused`                                                  | Sunken tab, `pause` glyph, "Paused" in the title voice                                                                                                                                                                                                                                                                                                                                                                           |
| `draft-completed`, desktop (podium)                             | A 716 px tab: silver 2nd left, gold "Winner / avery" centre, bronze 3rd right, flush cells, no overlap, the long name truncated at its end; roster board with six 183 px columns (with more seats: buttons above at the outer edges and dimmed 48 px peeks)                                                                                                                                                                      |
| `draft-completed`, phone                                        | Tab between the menu button and a spacer holding the three podium cells with place kickers; one roster column with 28 px peeks, the seat select between 44 px buttons                                                                                                                                                                                                                                                            |
| 768 (not a suite cell; check in a browser, all brands)          | Compact header with the wings outside a 248 px tab; a timer clock at 14 px fits the centre; no overlap between strip, tab and controls; roster shows 3 columns and its controls when seats exceed 3; board columns as today                                                                                                                                                                                                      |
| Stress: `draft-live-your-turn`, `-countdown`, `draft-completed` | Montserrat working text, Cinzel rail titles, 3 px ring with 6 px drop on cards and 10/12 visible gaps, the tab's drop clamped to 4 px and clear of the double rule, no overflow, no header collision, the 61-character name truncated, constant tab width, ties cycling, 12 seats rotating                                                                                                                                       |
| Specimen, every brand and mode                                  | Every pill state, every tab tone with its edge colour from 4.4, podium with ties, roster controls at both ends, and the icon row including punchout on winner and muted pills, each with the correct ink pair                                                                                                                                                                                                                    |

## 9. Escalations

### (a) Owner decisions and the one open point

**Recorded decisions (gallery round 2).**

1. **Header: the full hanging tab (option B1).** Rejected: the flush slate panel (option A, the earlier recommendation), a full-width status band under the header (C, costs 32 px of board), a shorter tab (B2) and a tab with only a lined edge (B3). Each theme's tab edge was chosen in the same review (4.1).
2. **Roster: one-seat slide with dimmed 48 px peeks, icon buttons above at the outer edges, no visible position text.** Rejected: a pager row with labelled buttons and a range menu, a native horizontal scroller, seat tabs, a slider underneath and a seat map. The interpretation is confirmed: "carousel controls" meant the roster board's arrows and the phone's one-seat view; the header strip stays automatic.

**Open: the phone podium and the menu button (recommendation: keep the menu).** The gallery's phone final-results header let the podium tab span the whole bar, without the menu button. That button is the only route on the phone to "Back to seasons" and the view switch, so 5.3 keeps it and places the podium tab between it and the same-size spacer, which narrows the side cells by about 24 px and the centre by about 30 px, so names truncate a few characters earlier. The alternative is to keep the full-width podium and move "Back to seasons" into the roster area, which is a larger change.

### (b) Requests for the designer

None.

## 10. Build notes

**Files likely touched.**

- Contract and generator: `theme/brands/contract.ts`, `css.ts`, `fontCatalog.ts`, seven brand files, `tests/unit/brand/brandContract.test.ts`, `brands.css.snapshot`, `docs/architecture/brands.md` (document the `room` group and the derived properties).
- Decisions: `decisions/admin/materialGlyph.ts`; new `decisions/draft/headerStatus.ts`, `decisions/draft/headerLayout.ts`, `decisions/draft/rosterWindow.ts`, all unit tested.
- Components: new `features/draft/ui/DraftHeaderTab.tsx`, `features/draft/ui/RosterTrack.tsx`, `ui/TabularText.tsx`, `useHeaderCompaction.ts`, `usePodiumCycle.ts`; changed `DraftBoardHeader.tsx`, `MobileDraftHeader.tsx`, `RosterBoardScaffold.tsx`, `MobileRosterBoard.tsx`, `DraftLedgerRail.tsx`, `DraftMyRosterRail.tsx`, `DraftAutoDraftRail.tsx`, `ParticipantStrip.tsx`, `DraftRoomScreen.tsx` (load error button); deleted `CenterBuckle.tsx`. `DirectionChevron` stays.
- CSS: `.dr-*`, `.drh-*`, `.drm-*`, `.fo-tip-draftedChip*`, `.mi-icon` axis variables, new `--fo-db-tab*` tokens; remove `.drh-buckle*`, `.drh-row::before`, `.dr-rosterNav`, `.drm-podium*`, the podium gradients.
- Tests: `tests/visual/matrix.ts` (the `.drh-buckle*` and `.drh-buckleCenter` selectors in `draft-live-countdown` and `draft-paused` move to `.drh-tab` and its headline), `assertions/pageChecks.ts`, `assertions/allowlist.ts`, `fixtures/stressBrand.ts`, the specimen's `DraftSlice`, `tokens-check.mjs`.

**Risks.**

- The grid header changes what the wings measure; the hidden measure row must stay independent of the tab column (it is absolutely positioned).
- The `ring` and `drop` tab edges use a negative top margin to hide the top ring above the screen: `.dr-frame` uses `overflow: clip` with an 8 px clip margin, so confirm the hidden edge is clipped by the viewport, not drawn into a banner above.
- `lift`'s shadow blur crosses the header rule; check it does not read as a smudge on the first card row in A dark.
- The sticky roster controls live inside `.dr-middle` (vertical scroller, horizontal overflow hidden); keep them below the cursor ghost layer (z-index 12), and keep the track's translate inside the board's `overflow: hidden`.
- Drag-to-step must not cancel a pill's tooltip focus or start on a text selection; ignore drags that begin on a focusable control.
- `.mi-icon` is shared: the axis variables' defaults must equal today's values so non-draft screens stay pixel-identical (no baseline outside the room changes, except `admin-ceremony-nominees` for the glyph fix).
- DM Sans lacks tabular figures, which is why the clock uses digit cells; `<TabularText>` wraps digits only.
- The phone seat `Select` keeps 44 px with no visible label; check `aria-label` replaces the label association.

## 11. Build sequence

Three chunks. Each ships alone, passes `pnpm run ci` and changes baselines only in its listed cells.

**Chunk 1: Foundation.** The checks that guard the later chunks.

- Work: the `room` group with `tabEdge` and every brand's values, derived properties (emitted, not yet read), range locks and all contract tests in section 6.1 including the tab edge contrast test, the Chromium width check, the CSS conditional check (without the pill-radius rule), the stress theme fixture, and `roomFindings` with every geometry assertion. Assertions that fail on today's room (rail alignment, F's card gaps, the 64 px header in C and D, pill radius, icon contrast, the drafted-chip avatar) get dated allowlist entries naming chunk 2; tab and roster checks key on `.drh-tab` and `RosterTrack`, and chunk 3 turns on the "must exist" rule. The allowlist fails on any entry that no longer matches, so each fix must delete its entry.
- Acceptance: contract tests pass and fail as designed on a broken fixture (bad `drop`, a non-listed work font, a `ring` brand with a 1:1 on-primary edge); the generator throws on a brand with no qualifying edge colour; the snapshot updates; `tokens:check` rejects `[data-brand` in a draft rule; the width check passes for the four listed fonts.
- Baselines: none change. Total 124.

**Chunk 2: Fixes.**

- Work: the icon rule set and the `materialGlyph` fix (5.2), card edge and gaps and the header box (5.1), pills and controls following their radii and the pill-radius CSS rule, aligned rail columns with tabular numbers, the roster card score cell, auto-draft sizing, the working font and title voice (5.5, 5.6), and the marginal improvements that are not about the header or roster: M5 and M9.
- Acceptance: every chunk 2 allowlist entry is deleted and the assertions pass in all brands, both modes, both viewports, stress included; noir's drafted-chip avatar is visible; Best Actress shows `face` in the draft room and the admin nominees screen; no non-draft baseline changes except `admin-ceremony-nominees`.
- Baselines changed: the 29 draft cells (`draft-live-your-turn` 16, `draft-completed` 4, `-countdown` 2, `-not-your-turn` 2, `draft-paused` 2, `-armed` 1, `-hover-match` 1, `-focus-disabled` 1), `admin-ceremony-nominees` 2, specimen 21: 52 cells. Total 124.

**Chunk 3: Redesigns** (reviewed in one gallery).

- Work: the header tab (5.3) with `computeHeaderStatus`, `TabularText`, tones, edges, the countdown frame, compaction rework, podium and ties on desktop and phone; roster rotation (5.4) with `rosterWindow`, `RosterTrack`, drag, keyboard and live region; the remaining marginal improvements (M1–M4, M6–M8, M10–M12); the new brand and stress cells and the specimen sections.
- Acceptance: tab and roster assertions find their elements and pass in all brands and the stress theme; tab width constant across ticks; the tab's lowest edge at most 61 px; reduced motion holds `countdown-danger` and makes the roster step instant; unit tests for `computeHeaderStatus` (every row of the content table), `shouldCompactHeader` (including a font or theme swap), `rosterGeometry` at 390, 500, 768, 1100 and 1280, and `stepWindow`/`windowForSeat` at 2, 7, 12 and 200 seats; 44 px targets on the phone; the owner reviews the gallery before the PR.
- Baselines changed: 27 draft cells (the 29 less `-hover-match` and `-focus-disabled`, whose header is masked and whose board does not change here) and specimen 21; new: 18 brand cells and 5 stress cells. Total 147.

## 12. Marginal improvements

Each applies in every brand.

| #   | Current state                                                                                        | Change                                                                 | Reason (user benefit)                                                                | Cells                               | Chunk |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------- | ----- |
| M1  | With a timer the buckle shows only the clock; the active name appears only in the strip              | Kicker carries the active seat name above the clock                    | One glance answers who is on the clock                                               | Timed draft states in the specimen  | 3     |
| M2  | Pending draft hides Round and Pick, so the buckle changes shape                                      | Stat cells always present, "—" until the draft starts                  | No layout change when the draft starts                                               | Pre-draft specimen                  | 3     |
| M3  | Final results podium order bronze, gold, silver                                                      | Conventional 2nd, 1st, 3rd                                             | Reads as a podium at a glance                                                        | `draft-completed`                   | 3     |
| M4  | Phone podium rows show the name only                                                                 | Every podium cell names its place ("Winner", "2nd", "3rd")             | Non-colour rank cue; the metal alone is not enough for colour-blind users            | `draft-completed`                   | 3     |
| M5  | `.dr-railToggle[aria-disabled]` stub in pre-draft looks identical to enabled, hint only in a `title` | Disabled stub at `--fo-alpha-50` like the phone's disabled rail button | Shows at a glance that history and roster are unavailable yet                        | Specimen (pre-draft is not a cell)  | 2     |
| M6  | `+N` overflow chips announce "3 more"                                                                | The hidden names in the accessible name                                | Screen-reader users hear who is hidden                                               | Non-visual                          | 3     |
| M7  | Desktop podium buckles and phone podium bars use different radii, shadows and gradients              | One flat metal-cell treatment in the tab on both                       | Consistent component for the same job                                                | `draft-completed`                   | 3     |
| M8  | Roster nav disabled by 45 % opacity                                                                  | Muted ink with `aria-disabled`, still focusable                        | Focus does not vanish at the ends; disabled reads clearly                            | Specimen roster controls            | 3     |
| M9  | Load error page is a dead end                                                                        | Add "Back to seasons"                                                  | A way out; the same action the draft menu has                                        | Not captured (functional QA)        | 2     |
| M10 | Phone roster's visible "Roster" label sits above the select                                          | `aria-label` on the select, no visible label                           | Frees a line on the phone; the select already names the seat                         | `draft-completed` phone             | 3     |
| M11 | Header wing separators at back and pause use a local rule with a fixed alpha                         | One `color-mix` of `--dr-ink` at 18 %                                  | Consistent colour source; follows any surface                                        | All `draft-*` except masked headers | 3     |
| M12 | Compaction leaves a stale compact decision after a font or theme swap                                | Observe the measure wings instead of content dependencies              | The header never stays in the wrong layout after a font arrives or the theme changes | Not captured; unit test             | 3     |
