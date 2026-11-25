# Season polish: names, logs, space, navigation and standings

Package: `season-polish` (dogfooding D16 to D23). Spec for `season-polish-build`. There is no mockup. The design sources are the owner's tour notes (`tests/tour/runs/2026-11-24-1750/notes.md`, shots 055, 065, 067, 068, 074, 075, 076, 080, 095, 097, 099; `tests/tour/runs/2026-11-23-1749/notes.json`, shots 029, 033, 038), the screens as they ship on `main` after `circuit-parity`, `docs/design/app-inventory.md` and the token contract in `docs/architecture/brands.md`.

Brand letters as in earlier prescriptions: A refined-gold, B red-carpet, C ballot, D noir, E festival, F technicolor, G lightbox. Paths are relative to `apps/web/src` unless they start with `apps/`, `packages/`, `docs/` or `tests/`. Player copy says "season", never "Circuit" (ADR 0006).

`circuit-parity.md` stays in force. This package changes only what is named here. In particular, the pill (4.1 there), its states (4.2), the draft gesture (4.3), the points rules (4.6), the phone nominee card (4.11) and the roster card (4.12) are unchanged unless a section below says otherwise.

## 1. Scope

**In scope:** every brand A to G, both modes, at 1280 and 390. 768 follows the desktop rules unless stated.

| Screen | Route | Finding | What changes |
| --- | --- | --- | --- |
| Full season page | `/leagues/:id/:slug/seasons/full/:id` | D16, D19 | Header keeps Add/drop and Back to league. The other destinations become a row of season tiles. Members show avatars. |
| Season draft room: lobby, live, staging pane | `…/draft` | D16, D18, D22 | Queue rows lose the grip, and the pill itself drags. The ⋯ menu is explained. The lobby Players list shows avatars without "(you)". |
| Season draft board (completed) | `…/draft` (IN_SEASON, COMPLETE) | D22 | "(you)" is removed from the roster card header. |
| Roster (own and others') | `…/roster` | D16, D18, D22 | Flat pick list with narrower pills and no category headings. A limits line appears when limits exist. The Player select shows avatars without "(you)". |
| Transactions | `…/transactions` | D16, D17 | Added and dropped become icons, stacked. |
| Waivers (all states) | `…/waivers` | D16, D17, D18, D20, D22, D23 | Results and claim rows stack their moves with the icons. Claim rows drag by the row. The priority list loses its boxes. Chips are renamed (owner decision) and explained in one place. |
| Standings | `…/standings` | D20, D22 | Leaderboard, Final results (COMPLETE only) and By ceremony become views behind one segmented switch. Boxes are removed. |
| Ceremony points, By category | `…/standings/:ceremonyId?view=category` | D21 | One card per category with pills, laid out like the draft board. Winners are gold. |
| Rules | `…/rules` | D20 (same row fault) | Boxes are removed from the event and category rows. |
| Single-ceremony season page | `/seasons/:id` | D16 | The Participants column shows avatars. So does the Manage participants modal list. |
| League page | `/leagues/:id/:slug` | D16 | The Members list shows avatars. |

**Not changed**

- The ceremony draft room and its pills, rails, header, phone tree and podium. Ceremony points By player view (circuit-parity 4.13) apart from removing "(you)". Final results contents (circuit-parity 4.14) apart from where they sit (5.7).
- Routes, destinations and what each screen is for. No route is added or removed. Every button on today's season page still has a way in (5.2).
- Scoring, waivers, chips (apart from their player-facing name, which the owner decides), the draft and free agency. The API changes are read-only additions of `avatar_key` (9.2).
- Token contract and brand values. No slot is added.
- Admin screens, including the admin `.circuit-row` (its fill is right for the editor), Home, `/seasons`, create season, and the ceremony draft plans list.

## 2. Intent

Season screens should read as one well-kept place. People are always shown the same way: their animal with their name. Moves are shown the same way: a plus for what came in, a minus for what went out, one above the other. Space goes to contenders and points, not to scaffolding: no grip where the pill can be grabbed, no heading where the icon already names the category, no box whose content touches its edges.

Navigation should feel like reading the page rather than choosing from a toolbar. The season page offers its parts as tiles with a line about each. Standings is one screen with three views, like every other season screen with more than one reading. The viewer is not singled out with a label. They know their own name and animal, and the header shows them.

## 3. Token values

**No contract slot changes and no new brand values.** The package reuses the existing slots and the shared win gold:

- **Season list rows** (5.1): no fill. Rows sit on the page ground (`--brand-page`), or on the card ground (`--brand-raised`) inside cards, with `--brand-rule` hairline separators.
- **Season tiles** (5.2): `StandardCard interactive`, so `--panel` = `--brand-raised`, with the card shadow, hover and focus already defined in `primitives/baseline.css`.
- **Move icons** (5.4): `--brand-muted` glyphs.
- **Drag placeholder** (5.3): a dashed `--fo-border-width` border in `--brand-rule-strong`. The lifted row uses `--fo-shadow-card`.
- **Avatars**: unchanged (`.fo-animalAvatar`, ink from the brand).

The tokens-check rules hold. No enum reads, no `[data-brand`, no raw colours.

### 3.1 Contrast of every pair this package paints

Computed from the brand files at `origin/main` (WCAG 2.1 relative luminance; light / dark). They have not changed since `circuit-parity`, so these values match its table. Minimums: text 4.5, non-text 3.0.

| Pair | Use in this package | A | B | C | D | E | F | G |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| text / page | Names, totals and tile-less rows now on the page ground (leaderboard, ceremony list, priority, rules, transactions) | 16.38 / 16.31 | 15.95 / 16.90 | 15.41 / 15.04 | 17.17 / 17.58 | 19.30 / 17.67 | 15.59 / 16.42 | 15.68 / 15.48 |
| muted / page | Helper lines ("Nominations n pts · Wins n pts"), meta, hints, move icons on the page | 5.69 / 7.20 | 5.70 / 8.52 | 6.53 / 6.71 | 6.27 / 7.80 | 6.50 / 7.81 | 6.50 / 9.54 | 6.17 / 7.21 |
| text / raised | Tile titles, card titles, pill labels | 17.37 / 15.01 | 18.00 / 15.90 | 16.51 / 13.97 | 18.88 / 16.16 | 17.67 / 16.28 | 16.45 / 15.00 | 18.42 / 14.30 |
| muted / raised | Tile descriptions, card meta, pill points, move icons inside cards | 6.03 / 6.63 | 6.43 / 8.02 | 6.99 / 6.23 | 6.90 / 7.17 | 5.95 / 7.19 | 6.85 / 8.72 | 7.25 / 6.66 |
| win-gold-on / win-gold | Won pills in the By category cards | 9.24 / 11.20 (shared tokens, every brand) | | | | | | |
| ruleStrong / page | Dashed drop placeholder, dropped-pill dash, queue pill hover edge | 3.39 / 3.71 | 3.42 / 3.56 | 3.45 / 3.63 | 3.49 / 3.75 | 3.64 / 3.72 | 3.40 / 4.89 | 3.38 / 3.66 |
| ruleStrong / raised | The same inside cards and the room's rail | 3.59 / 3.42 | 3.86 / 3.35 | 3.69 / 3.37 | 3.84 / 3.45 | 3.33 / 3.43 | 3.59 / 4.47 | 3.97 / 3.38 |

Every pair passes. The `--brand-rule` hairline (1.27 to 1.67 against the page) is decorative separation, as everywhere else in the app. Rows never depend on it: each row's content starts on a fixed left edge.

**Not used, on purpose.** No gold text (`--fo-win-gold-text` is 4.24 to 4.37 on surfaces in A and F light). No status colours for added, dropped, won or lost: the glyph and the words carry the meaning, and red and green would collide with the live and complete status tones.

## 4. Shared pieces introduced

### 4.1 `PlayerName` (D16): one name-with-avatar treatment

A render-only component in `shared/PlayerName.tsx` (beside `animalAvatarIcon.tsx`). It is the only way a player's name is drawn in a list.

| Prop | Meaning |
| --- | --- |
| `name` | Username. |
| `avatarKey` | `avatar_key`. When it is null, the existing fallback mask draws the default animal, so there is never an empty gap. |
| `density` | `"dense"` or `"roomy"` (table below). |
| `isViewer` | Adds a visually hidden ", you" after the name. It draws nothing (D22, 4.2). |
| `wrap` | `"ellipsis"` (default) or `"anywhere"`. |

| Density | Avatar | Gap | Name text | Use |
| --- | --- | --- | --- | --- |
| dense | `sm`, 22 px (`--fo-avatar-size-sm`) | `--fo-space-4` (4 px) | Inherits the row's size (pill rows: `--fo-db-pill-font`; log rows: `--fo-font-size-sm`), regular weight | Rows where the name sits beside pills or other data: transactions, waiver results, priority-after line, ceremony points entries, final results player chips, draft history (already avatar-only: unchanged), By category board rows (unchanged) |
| roomy | `lg`, 26 px | `--fo-space-8` (8 px) | Body size; weight as the list already sets (bold in leaderboard and priority, regular in member lists) | Lists of people: season Members, single-ceremony Participants, league Members, Manage participants modal, draft lobby Players, leaderboard, waiver priority. (The roster card header is dense: it keeps its 22 px avatar.) |

**Layout rules.**

- `display: inline-flex; align-items: center; min-width: 0`. The avatar never shrinks (`flex: none`).
- With a second line under the name (leaderboard helper, priority chip line), the avatar aligns to the first line: `align-items: flex-start`, with the avatar's top offset so its centre meets the name's cap height. Use `margin-top: calc((1lh - 26px) / 2)` with a fallback of 0.
- Ellipsis mode: one line, `text-overflow: ellipsis`, full name in `title`. Anywhere mode (member lists, which have room and must show long names in full): `overflow-wrap: anywhere` (`baseline-wrapAnywhere`).
- The avatar stays `aria-hidden`. The accessible name is the text.

**Not a tab stop.** It is never interactive by itself. Where a list row is a link, the link wraps the whole row.

**Running text stays plain.** Names inside sentences keep no avatar ("Waiting for emmy to pick", "Owned by pia", captions, tooltips other than the drafted chip, which already has one). The rule is "listed by name", not "mentioned".

### 4.2 The viewer, without "(you)" (D22)

Remove the visible "(you)" suffix everywhere it appears today:

- `SeasonRosterCard` (board, By player, Final rosters)
- `CircuitStandingsList`
- `CircuitPriorityList`
- `CircuitDraftLobby` Players
- the roster screen's Player select

The viewer's name is drawn exactly like everyone else's. Screen readers still hear "cora, you" (the `isViewer` visually hidden text). In the Select the option's accessible label is "cora (you)" through `aria-label` on the option, and its visible text is "cora".

Why nothing visible replaces it: on every screen where it appeared the viewer is already identified. The header's account chip shows the same avatar and name. "Your roster" and "Your claims" name the viewer's own data, and lists are short (4 to 12 players). A ring, tint or "You" tag would be a second, quieter label on screens the owner wants calmer. If the owner wants a cue, escalation (a)2 gives the quietest option.

### 4.3 Season list row (D20): replaces the admin row on season pages

New class `.season-row` (in the season block of `styles.css`), used instead of `.circuit-row` by:

- `CircuitStandingsList`
- `CircuitCeremonyPointsList`
- `CircuitPriorityList`
- `CircuitClaimList`
- `ContenderPreviewRow`
- `CircuitRulesScreen` (events and categories)
- `CircuitRosterList` rows

The admin `CircuitCeremoniesTab` and `CircuitCategoriesTab` keep `.circuit-row`.

| Property | Value |
| --- | --- |
| Fill | none (transparent): the row sits on whatever ground the section has |
| Padding | `--fo-space-dense-2` (10 px) top and bottom, 0 sides. With no fill there is no edge for content to touch. |
| Separator | `--fo-border-width` `--brand-rule` top border between rows (`.season-list > li + li`), none above the first or below the last |
| Layout | `display: grid`, columns per list (5.x); `align-items: center` (or `start` for two-line rows); `column-gap: --fo-space-xs` (12 px) |
| Rank cell | `min-width: 3ch`, end-aligned, tabular numerals, meta voice. It starts at the row's left edge (x = 0), so ranks align with the section title above. |
| Trailing figure | end-aligned at the row's right edge, tabular numerals, semibold |
| Dragging row | lifted copy: `--brand-raised` fill, `--fo-shadow-card`, `--fo-radius-medium`, padding `--fo-space-4 --fo-space-xs` (the overlay is the only state with a fill, and it has padding on every side). The slot left behind: dashed `--brand-rule-strong` outline at `--fo-radius-medium`, content hidden. |

**The rule for any boxed group this package draws** (tiles, category cards and roster cards): content inset is at least `--fo-space-xs` (12 px) on every side, and the box is a `StandardCard`, never a filled list row. The review checks this as "no content within 12 px of a box edge".

## 5. Component rules

### 5.1 Lists that lose their boxes (D20)

| List | Columns (desktop) | Phone 390 |
| --- | --- | --- |
| Leaderboard | `[rank 3ch][PlayerName roomy + helper line, 1fr][total auto]` | same; the helper wraps under the name |
| By ceremony | `[ceremony link + helper, 1fr][“n pts awarded” auto, meta]` | the meta moves under the helper (single column) |
| Waiver priority | `[rank 3ch][PlayerName roomy + pass line, 1fr]` | same |
| Rules: events, categories | the existing contents, as `.season-row` | same |

The leaderboard total keeps "12 pts" and gains `font-variant-numeric: tabular-nums`, so totals align. A tied rank still repeats ("1, 1, 3").

### 5.2 Full season page (D19, D16)

**Header** (left as today: title, league name, status pill, coming-soon note).

- Right group, desktop: **Add/drop** (filled; shown on the circuit-parity 4.15 rule), then **Back to league** (outline). The processing caption stays under the group (`role=status`, `aria-describedby` from Add/drop).
- Phone: both buttons full width, 44 px, Add/drop first.
- Every other header button leaves the header.

**Season tiles.** Directly under the membership bar and above the Settings and Members grid, there is a `nav` with `aria-label="Season"` holding a list (`ul`) of tiles.

- **Tile:** `StandardCard interactive` rendered as a `Link`, padding `--fo-space-xs --fo-space-sm` (12/16), min-height 72 px desktop, 56 px phone.
- **Tile content, left to right:**
  1. A text block: the title in the card-title voice (`baseline-textCardTitle`), one line. Under it the description in the meta voice (`baseline-textMeta`), up to two lines, wrapping.
  2. A trailing `chevron_right` glyph (`gicon`, `--brand-muted`, `aria-hidden`), vertically centred.
- **Accessible name:** the link's name is the title. The description is its `aria-describedby`. Hover, focus-visible (ring, 4 px offset) and active come from `isInteractive`.
- **Grid:** `repeat(3, minmax(0, 1fr))` from 768 up, gap `--fo-space-xs`. Phone: one column, gap `--fo-space-4`.
- **Order** (only the tiles the status allows; the visibility decisions are unchanged):

| Tile | Shown when | Description |
| --- | --- | --- |
| Draft lobby / Draft room / Draft board (`circuitDraftLinkLabel`) | always | Lobby: "Queue contenders before the draft starts." Room: "The draft is on. Take your seat." Board: "Every pick from the draft." |
| Your roster (member) / Rosters (non-member) | `circuitRostersVisible` | "Your picks and what they have scored." / "Every player's picks and points." |
| Transactions | `circuitRostersVisible` | "Every add and drop, newest first." |
| Waivers | `circuitWaiversVisible` | "Claims, priority and results." Plus the pass line (5.9) when the viewer holds an available one. |
| Standings | `circuitStandingsVisible` | IN_SEASON: "The leaderboard and points by ceremony." COMPLETE: "Final standings and results." |
| Rules | always | "How scoring, rosters and waivers work." |

- **Pre-draft:** two tiles (Draft lobby, Rules). Drafting: four. In season and complete: six (two rows of three).
- **Members section:** each member is a `PlayerName roomy, wrap="anywhere"`, and each row's vertical padding goes from `sm` to `--fo-space-dense-2` so the 26 px avatar does not grow the list. Empty text unchanged.
- **Loading:** the existing page skeleton gains a tile-row skeleton of three 72 px `Skeleton` blocks in the same grid. Error unchanged.

Why tiles: the destinations are parts of the season, not actions. Tiles give each a sentence, so a first-time player learns what Transactions or Waivers is before choosing it. The header is left with the one action (Add/drop) and the way out. The component is the league index tile, so nothing new is introduced.

### 5.3 Draft room staging pane: queue without a grip (D18)

**Row construction** (queue): `[rank 3ch][pill 1fr][⋯ 28]`, row height 32 px desktop and 44 px phone. Staged rows: `[empty 3ch][pill 1fr][⋯]`, so the pills still align. The grip column is removed: `CircuitDragHandle` no longer renders in the season room.

**The pill is the drag source** (queue only; the staged list is unordered, so it does not drag).

| Input | Behaviour |
| --- | --- |
| Mouse or pen | Pointer down on the pill and move 6 px: the row lifts (dnd-kit `PointerSensor`, `distance: 6`). Below 6 px it is a click, so arm and double-click to draft keep working exactly as in circuit-parity 4.3. The click that ends a drag is swallowed, so a drag never arms. Starting a drag disarms an armed pill and dismisses its toast. |
| Touch | Press and hold 250 ms (tolerance 5 px) anywhere on the row except ⋯ to lift (`TouchSensor`, `delay: 250`). A shorter tap opens the phone nominee card as today, and a swipe scrolls the pane (`touch-action: manipulation` on the row, `none` only while lifted). |
| Keyboard | The pill keeps Enter, Space, Shift+Enter and Escape for drafting. Reordering is **Alt+ArrowUp / Alt+ArrowDown** on the focused queue pill (one place per press; focus stays on the moved pill), plus Move up and Move down in the menu. dnd-kit's `KeyboardSensor` is not attached to the pill, because its Space-to-lift would collide with Space-to-arm. `aria-keyshortcuts` becomes "Enter Space Shift+Enter Escape Alt+ArrowUp Alt+ArrowDown". |
| Screen reader | Each reorder, by any input, announces politely: "Moved `<label>` to position 2 of 3." It goes through the staging pane's existing note region, or a new visually hidden `role=status` beside the list. |

**Affordance, so dragging is obvious without a grip:**

- Cursor: `grab` over queue pills while you are not on the clock (lobby, waiting, paused), `pointer` while you are (drafting is then the primary action), and `grabbing` during a drag.
- Hover when not on the clock: the pill's border goes to `--brand-rule-strong` (no lift, no weight change; the lift stays reserved for "you can draft this").
- A hint under the "Queue" heading in the meta voice, shown only with two or more queued contenders: "Drag to reorder." (fine pointer) or "Press and hold to reorder." (coarse pointer).
- During a drag: the lifted row and placeholder as in 4.3, and the list scrolls when the row nears its edge (dnd-kit auto-scroll).

**The ⋯ menu stays, explained.**

- What it holds:
  - Queue rows: **Draft** (only while on the clock and undrafted), Move up, Move down, Move to staged, Remove from queue.
  - Staged rows: **Draft** (same condition), Add to queue, Remove from staged.
- It stays because it is the only way to move a contender between queue and staged and to remove one, the only mouse path for someone who does not know the double-click, and the keyboard path for reordering for someone who does not know Alt+Arrow. Folding it into the pill (right-click, or a menu on click) would collide with click-to-arm.
- Changes:
  - Tooltip: "Draft, move or remove" while a Draft item is present, else "Move or remove". Its `aria-label` becomes "Actions for `<label>`".
  - The dropdown opens with a `Menu.Label` naming the contender (one line, ellipsis), so it is clear which row it acts on.
  - Move up is disabled on the first row and Move down on the last.
  - Glyph `more_horiz`, unchanged.
  - Size: 28 px desktop (from 32, giving the pill room) and 44 px phone. 28 px is within the room's allowlisted rail controls; the allowlist is not touched at 390, where the button is 44.

The width freed by the grip (32 px plus a gap) goes to the pill, so "Summer of L…" in 055 shows in full at 1280.

**Lobby Players list:** `PlayerName roomy` rows in seat order once drawn, else join order. No "(you)". Row gap `--fo-space-4`.

### 5.4 Move icons, stacked (D17)

**One "moves" block**, used by transactions, waiver results and claim rows:

- A vertical stack (`display: grid; row-gap: --fo-space-4`) of move lines.
- Each line is `[icon 18 px cell][pill]`, `align-items: center`, `column-gap: --fo-space-4`.
- The added line always comes first, then the dropped line. A move with only one side has one line.

| Move | Glyph (`gicon`) | Accessible name and tooltip | Pill |
| --- | --- | --- | --- |
| Added (draft pick, free agent add, won claim) | `add` (bare plus, not the circled action glyph) | "Added" | default |
| Dropped | `remove` (bare minus) | "Dropped" | `is-dropped` (dashed) |
| Claimed, pending (your claims) | `add` | "Claim" | default |
| Drop if the claim wins (your claims) | `remove` | "Drop if the claim wins" | `is-dropped` |
| Lost claim, its claim | `add` | "Claimed, lost" | `is-muted` |
| Lost claim, its drop | `remove` | "Would have dropped" | `is-muted` (not dashed: nothing left the roster) |

**Icons:**

- 16 px glyph in an 18 px cell, `--brand-muted`.
- `role="img"` with `aria-label`, plus a visible `Tooltip` (the shared one, `openDelay` as elsewhere) on hover.
- They are not tab stops. A log has two icons per row, and making them focusable would double the tab count without adding an action. The pill beside each icon is focusable, and its accessible name starts with the move ("Added: Best Picture: Static" / "Dropped: Best Picture: The Long Field"), so keyboard and screen-reader users get the same information. See deviation 6.2.
- The bare plus and minus are deliberately not the circled `add_circle` and `remove_circle` used for the add and drop buttons, so a log line never looks like a control.

**Transactions row** (desktop): `[PlayerName dense 12rem][moves 1fr][kind · time auto]`.

- `align-items: start`. The name and the kind · time align with the first move line (both cells take `min-height` of one pill line and centre within it).
- Row padding as `.season-row`, hairline separators.
- Phone: line 1 is `[PlayerName dense][kind · time]` (time end-aligned, meta). The moves stack goes below, indented to the name's text edge (avatar width + gap = 26 px).

**Waiver results row:**

- Line 1 is `[n.][PlayerName dense][outcome]` as today.
- The moves stack goes below, indented to the name's text edge.
- The chip stays in the outcome text ("Won · Pick 7 chip", renamed per 5.9).

**"Priority after" line:** "Priority after:" in the meta voice, followed by an inline ordered list of `PlayerName dense` items separated by `--fo-space-xs`, wrapping. The list is an `ol` with `aria-label="Priority after this run"`.

### 5.5 Claim rows (D17, D18: consistency with 5.3 and 5.4)

- **Row** (desktop): `[rank 3ch][moves stack 1fr][pass meta auto][four 32 px icons]`.
- **Phone:** `[rank][moves stack 1fr][⋯ 44]`. The menu is unchanged from circuit-parity M7. The pass meta wraps under the stack.
- **The grip is removed.** The row drags as 5.3 describes:
  - Mouse: drag from the claim pill or any non-control part of the row after 6 px. A click below 6 px on the claim pill still opens the edit modal.
  - Touch: long press 250 ms.
  - Keyboard: Alt+ArrowUp/Down on the claim pill, plus the Move up and Move down icons.
  - The reorder is server-confirmed as today. The announcement is "Moved claim for `<label>` to rank 2 of 4."
- **Hint:** with two or more claims and the window not locked, the claims note gains a second sentence: "Drag a claim to change its rank."
- **Locked or busy:** the row does not drag (the sensors are disabled), the cursor stays default and the hint is hidden. Everything else is as today.

### 5.6 Roster page (D18, D16, D22)

**Picks section.** Keep the title "Picks" and its meta ("4 of 4 · 12 pts so far"). Then:

- **One flat list, no category headings.** Picks are ordered by season category order, then pick order (draft slot, then acquisition time). The pill's icon, which is always present (D14), and its nominee tooltip carry the category (D15).
- **Row:** `grid-template-columns: minmax(0, 22rem) 32px` on desktop, with `justify-content: start` and a column gap of `--fo-space-4`.
  - Every pill is the same width (up to 22 rem), so the points at the pill's end form one aligned column.
  - The drop icon sits right after the pill.
  - Other players' rosters have no icon column.
  - Row height 32 px, row gap `--fo-space-4`, no separators (pills already have edges).
- **Phone:** `minmax(0, 1fr) 44px`, full width.
- **Category limits line**, only when the season sets per-category limits:
  - Under the list, in the meta voice, an inline list of `[category icon 14 px] n of max` items separated by `--fo-space-xs`.
  - Each icon has `role="img"`, `aria-label="<Category>"` and a hover tooltip. The text reads "3 of 3".
  - A full category's count is semibold. No colour.
  - With no limits the line is absent ("No category limits." is already on the season page and the rules).
- **Empty categories** no longer print "None". Without limits they don't matter; with limits the limits line shows "0 of 2".
- **The empty roster** keeps "No picks yet."

**Player select.** Each option renders `PlayerName dense` (Mantine `renderOption`), and the input's `leftSection` shows the chosen player's avatar (22 px). Labels lose "(you)" (4.2). The page title already says "Your roster" or "`<name>`'s roster".

**Free agency panel.** Unchanged (circuit-parity 4.8).

### 5.7 Standings: three views (D20, D22)

**Header** unchanged: "Standings", the season and league line, Back to season.

**View switch.**

- Directly under the header, left-aligned like the ceremony points switch: `SegmentedControl` with `aria-label="Show standings"`.
- Segments:
  - IN_SEASON: **Leaderboard | By ceremony**.
  - COMPLETE: **Leaderboard | Final results | By ceremony**.
- State lives in `?view=leaderboard|results|ceremonies`. The default is leaderboard. An unknown value, or `results` before COMPLETE, falls back to leaderboard.
- `?results=rosters` keeps choosing the Final rosters sub-view.
- Phone: the control is full width, with 44 px segments (the existing rule below 500).

**Each view** starts with a visually hidden `h3` naming it, so the heading outline survives. The visible section titles "Leaderboard", "Final results" and "By ceremony" are removed: the switch shows which view is on.

- **Leaderboard:** the 5.1 list, with `PlayerName roomy` rows and no "(you)".
- **Final results** (COMPLETE):
  - A row holds the sub-switch "All scoring contenders | Final rosters" (`aria-label="Show final results"`), end-aligned at desktop and full width on phone. It sits above the content, with no divider.
  - Contents as circuit-parity 4.14. The All scoring contenders rows become `.season-row`s (they already have no fill). Player chips use `PlayerName dense` with the points after.
- **By ceremony:** the 5.1 list.

**Loading and error:** the skeleton draws the switch and five rows. Errors are unchanged. Live refresh on `score:update` keeps the current view.

**The season page's Standings tile** opens the default view. No link targets a view, so no URL elsewhere changes.

### 5.8 Ceremony points, By category (D21)

It looks like the season draft board's By category view, read-only.

- **Layout:** the board's card grid, `repeat(auto-fill, minmax(min(100%, 16rem), 1fr))`, gap 12 down and 10 across. Phone: one column.
- **Card:** `StandardCard` with `.fo-pillScope`, padding 12 (the `SeasonRosterCard` construction).
  - Header row: category icon, category name (one line, ellipsis, `title`) and, in the score cell, the category's points awarded at this ceremony ("7", tabular, `--brand-font-numeral`, as the roster card's score).
  - A `--brand-rule` hairline under the header.
- **Entries:** one per (contender, player) that scored here.
  - Row: `[pill with icon and points, 1fr][PlayerName dense, max-width 45%]`, row height 26 px (pill 22 + gap 4).
  - The pill's points are that player's total for the contender at this ceremony: nomination plus win, "+3".
  - **Gold** (`is-winner`) when it won here.
  - A pick the player has since dropped is `is-dropped`, and the name is followed by "· dropped" in the meta voice (circuit-parity 4.13 wording).
  - **Order:** winners first, then points descending, then label.
- **Tooltip:** the nominee card with the points section for that player at this ceremony ("Nomination +1 · Win +2"). On a phone a tap opens the nominee card.
- **Empty category:** the card stays, with "No points in this category." in the meta voice and a score of "0".
- **Every season category gets a card**, in category order, so the screen always lists the full set.

This replaces the Nominations and Wins columns of circuit-parity 4.13 (see 6.3 and escalation (a)5). The view switch, By player view, header, "Points updated" status and loading states are unchanged.

### 5.9 Chips: name and where players learn about them (D23)

**Recommendation: call it a "priority pass"** and tell the player in the two places they act.

Why: "chip" means nothing until explained, and in this app "chip" is also the visual word for the drafted chip and status chips. What it does is give one claim priority. "Priority pass" says that, and pairs with the existing "Priority" list. It is named by the missed pick: "Pick 5 priority pass". In tight places (claim row meta, results outcome) use "Pass for pick 5".

**Copy changes if accepted.** Player-facing strings only. API codes, types and the domain keep "chip".

| Where | Today | New |
| --- | --- | --- |
| Waivers, right column title | "Priority and chips" | "Waiver priority" |
| Its helper | "Claims with a chip run first, earliest missed pick first. Then claims run in this order. Everyone who wins a claim moves to the bottom once." | "Claims run in this order. A claim with a priority pass runs first, earliest missed pick first. Everyone who wins a claim moves to the bottom once." |
| Priority row line | "Pick 5 chip: Available" | "Pick 5 priority pass: Available" (Used, Expired) |
| Claim modal field | "Chip", placeholder "No chip" / "You have no chips" | "Priority pass", "No pass" / "You have no priority passes" |
| Claim modal helper | "Chips come from missed draft picks…" | "You get a priority pass when a missed draft pick can't be made up. A claim with one runs before claims without, earliest pick first. It is used only if the claim wins, and expires when the first waiver window's claims run." |
| Claim row meta, results outcome | "Pick 7 chip", "Won · Pick 7 chip" | "Pass for pick 7", "Won · Pass for pick 7" |
| Errors | "That chip is already on another claim." / "That chip has been used up." | "That pass is already on another claim." / "That pass has been used." |

**Where a holder learns they have one** (data already loaded: the viewer's claims read carries their passes):

1. **Season page, Waivers tile** (5.2): while the viewer holds an available pass, a second description line in the body voice (not meta) reads: "You have a priority pass for pick 5. Use it on a claim in the first waiver window." It is part of the tile's `aria-describedby`.
2. **Waivers page, Your claims:** while the viewer holds an available pass, a note under the section title (same `Text variant="helper"` as the window note): "You have a priority pass for pick 5. Add it to a claim when you file it. It expires when this window's claims run." Outside a window the second sentence reads "…when the first waiver window's claims run."
3. **Claim modal:** the field and helper above.

The rules page keeps its explanation, with the new name. No Home or notification change (no new feature).

If the owner keeps "chip", apply the same three placements with today's word. The helper copy then says "chip" where it says "priority pass".

### 5.10 Single-ceremony season page and league page (D16)

- **Participants column** (`SeasonParticipantsColumn`):
  - Each row is `[PlayerName roomy, wrap="anywhere"][Commissioner pill]`, `justify-content: space-between`, row gap `--fo-space-4`.
  - Empty "No participants." is unchanged.
  - Phone: unchanged stacking; the pill stays on the row and wraps under a long name.
- **Manage participants modal** (`SeasonParticipantsModal` member list, `SeasonInvitesModal` line 176): `PlayerName dense` before each username. Actions are unchanged.
- **League page Members** (`LeagueMembersSection`): `PlayerName roomy, wrap="anywhere"` with the Commissioner pill. Separators and padding as today, with vertical padding `--fo-space-dense-2`.
- **Not changed:** the user-invite search results (they list people to invite, not players; they keep text).

### 5.11 Phone (390) summary

| Screen | Phone rule |
| --- | --- |
| Season page | Header buttons full width (44). Tiles in one column at 56 px. Settings then Members, as today. |
| Staging pane | `[rank][pill][⋯ 44]`, 44 px rows. Long press to drag. Hint "Press and hold to reorder." |
| Roster | Full-width pills with 44 px drop icons. The limits line wraps. |
| Transactions, results | Two-part rows (5.4), the moves indented under the name. |
| Claims | `[rank][moves][⋯ 44]`, long press to drag. |
| Standings | Full-width switch, 44 px segments. Lists single-column (5.1). |
| Points By category | One column of cards. Entries keep the pill and name on one line; the name ellipsises at 45 %. |
| Member lists | `PlayerName roomy` with anywhere-wrap. |

No phone page scrolls horizontally. Touch targets are 44 px everywhere except the pills (the allowlisted 22 px `dr-pill`, whose tap opens a card with 44 px buttons) and the non-interactive move icons.

## 6. Deviations from the sources

There is no mockup, so these are departures from the owner's notes or from circuit-parity. None needs Claude Design.

1. **Drag from the pill coexists with click-to-arm** (5.3, 5.5). The owner asked for no handle. A pointer drag needs 6 px of travel and a touch drag a 250 ms hold, so neither changes the click, double-click or tap meanings set by circuit-parity 4.3. Keyboard reordering moves to Alt+Arrow because Space already arms. This reverses circuit-parity's "the pill is never a drag source" (4.3, point 3). The drafting safeguards still hold, because a drag never drafts and the click after a drag is swallowed.
2. **Move icons are not keyboard-focusable** (5.4). The brief asks for tooltips on every icon. These icons get a hover tooltip and an accessible name, but the pill beside each carries the move in its accessible name, so a keyboard user loses nothing and the log keeps one tab stop per move.
3. **Ceremony points By category merges nomination and win into one pill per player** (5.8). The owner asked for the draft board look. Two columns inside a board card would not fit 16 rem, and one pill per (contender, player) with gold for a win is how the By player view and the roster already read. The tooltip keeps the split. This supersedes D11's two-column layout, so the owner confirms it ((a)5).
4. **Standings uses the switch before the season completes too** (5.7). The owner described the final screen. Using the same switch from the first day keeps one standings layout instead of two.
5. **No visible marker for the viewer** (4.2). The owner allowed "or not at all".

## 7. Acceptance per screenshot

**Screenshot tier:** no baseline image changes. That tier captures only Home and the specimen sample card (`tests/visual/matrix.ts`), and this package changes neither. **The design reviewer judges the tour gallery** (re-run `pnpm run tour` after the build, every brand × mode at 1280, and 390 where the sweep captures it). **The assertion tier must pass** for every row below. These existing SCREENS rows change appearance: `full-season-setup`, `full-season-member`, `full-season-member-view-open`, `full-season-in-season`, `full-season-processing`, `circuit-roster-own`, `circuit-roster-window`, `circuit-roster-other`, `circuit-roster-tooltip`, `circuit-draft-lobby`, `circuit-draft-lobby-not-live`, `circuit-draft-room`, `circuit-draft-staging`, `circuit-draft-armed`, `circuit-draft-board`, `circuit-transactions`, `circuit-waivers`, `circuit-waivers-window`, `circuit-waivers-processing`, `circuit-points-player`, `circuit-points-category`, `circuit-standings-final`, `circuit-standings-final-rosters`, `league-detail`, `league-detail-member`, `season-live`, `season-completed`, `season-pending`. New rows: `circuit-standings` (IN_SEASON, Leaderboard), `circuit-standings-ceremonies` (By ceremony), `circuit-rules`. `assertions/pairs.json` regenerates. No allowlist change is expected.

**Every cell, every brand and mode:**

- No visible "(you)" anywhere.
- Every listed player shows the avatar before the name.
- No list row has a fill. No content sits within 12 px of a card or tile edge.
- No gold text, and no red or green for moves or outcomes.
- Every icon shows a tooltip on hover (and on focus where it is a control).
- No horizontal scroll at 390.

| Cells | Desktop 1280 | Phone 390 |
| --- | --- | --- |
| `full-season-in-season`, `-processing` | Header: Add/drop (filled) and Back to league only; processing caption under them. Six tiles in two rows of three with title, description and chevron. Members with 26 px avatars. | Two full-width header buttons; one column of 56 px tiles, then Settings and Members |
| `full-season-setup`, `-member`, `-member-view-open` | Two tiles (Draft lobby, Rules); header has Back to league only (no Add/drop before the season) | same, one column |
| `circuit-draft-lobby`, `-lobby-not-live` | Queue rows `[rank][pill][⋯]` with no grip; "Drag to reorder." under Queue; ⋯ tooltip "Move or remove"; Players list with avatars, no "(you)" | n/a (desktop row) |
| `circuit-draft-room`, `-armed` | On the clock: queue pills with pointer cursor, ⋯ tooltip "Draft, move or remove"; armed pill and toast unchanged | n/a |
| `circuit-draft-staging` | n/a | Rows `[rank][pill][⋯ 44]`, no grip; hint "Press and hold to reorder." |
| `circuit-draft-board` | Roster card headers without "(you)" | same |
| `circuit-roster-own`, `-window` | Flat pick list without category headings; pills 22 rem wide with aligned points; drop icon beside each; Player select shows the avatar and "cora" | Full-width pills, 44 px drop icons |
| `circuit-roster-other`, `-tooltip` | Same list without icons; tooltip unchanged | same |
| `circuit-transactions` | Rows: avatar and name, then a stacked plus line and minus line (dashed pill), kind · time at right | Name and time on line 1, moves stacked below, indented |
| `circuit-waivers` | Priority rows without boxes (ranks at the left edge, avatar, name, pass line); results with stacked moves; "Priority after" as avatars and names | same, wrapped |
| `circuit-waivers-window`, `-processing` | Claim rows with no grip, stacked moves, four icons; hint "Drag a claim to change its rank." (window, two or more claims); processing: no hint, default cursor | `[rank][moves][⋯ 44]` |
| `circuit-standings` (new) | Switch "Leaderboard / By ceremony" on Leaderboard; rows on the page ground, no fill, totals aligned | Full-width switch |
| `circuit-standings-ceremonies` (new) | Switch on By ceremony; ceremony rows with links and "n pts awarded" | Meta under the helper |
| `circuit-standings-final`, `-final-rosters` | Three-segment switch on Final results; sub-switch at the right; contents per circuit-parity, without "(you)" | Both switches full width |
| `circuit-points-category` | Category cards in the board grid; entries pill plus avatar and name; winners gold and first; dropped dashed with "· dropped" | One column of cards |
| `circuit-points-player` | Unchanged except no "(you)" | same |
| `circuit-rules` (new) | Event and category rows without fills | same |
| `season-live`, `season-completed`, `season-pending` | Participants with avatars and the Commissioner pill | same |
| `league-detail`, `-member` | Members with avatars | same |

## 8. Escalations

### (a) Owner decisions at approval

1. **D23: the chip's name.** Recommendation: **"priority pass"** ("Pick 5 priority pass"; "Pass for pick 5" where space is tight), told on the season page's Waivers tile, on the waivers page and in the claim modal (5.9). Alternative: keep "chip" with the same three placements.
2. **D22: how the viewer is marked.** Recommendation: **no visible marker**, only screen-reader text (4.2). If a cue is wanted, the quietest is the name in medium weight on the viewer's row or card header only. No tag, no colour.
3. **D19: tiles for the season page's destinations** (5.2). Recommendation: tiles with a one-line description each, with only Add/drop and Back to league left in the header. Alternative: a compact text link row ("Draft board · Your roster · …") under the header. It is lighter, but explains nothing.
4. **Standings switch before the season ends** (deviation 6.4). Recommendation: yes, two segments while in season and three once complete.
5. **Ceremony points By category: one pill per player, nomination and win combined** (deviation 6.3). Recommendation: yes. The tooltip keeps the split.

### (b) Requests for Claude Design

None. Every treatment reuses an existing component (interactive tile, roster card, segmented control, pill).

### Suggestions outside this package

- Admin sortable lists and the ceremony draft plans list still use grips. If the owner likes the gripless queue, a later package can apply the same pattern there.
- Members on the season page could link to that player's roster. That needs a roster deep link (a query parameter), which is a small feature, so it is left out.

## 9. Build notes

### 9.1 Web: files and order

1. **Shared pieces:**
   - `shared/PlayerName.tsx` (4.1), with a unit test for the viewer text and fallback.
   - `.season-row` and `.season-list` CSS (4.3).
   - A `MovesStack` render piece in `features/circuitLeagues/ui/` (5.4).
   - A pure `decisions/playerName.ts` is not needed. Keep it render-only.
2. **"(you)" removal** in the six places (4.2). Update tests that assert the suffix.
3. **Lists to `.season-row`:** `CircuitStandingsList`, `CircuitCeremonyPointsList`, `CircuitPriorityList`, `CircuitRulesScreen`, `ContenderPreviewRow`, `CircuitClaimList`, `CircuitRosterList`.
4. **Season page:**
   - `CircuitLeagueScreen` header and tiles, via a new `features/circuitLeagues/ui/SeasonTiles.tsx`.
   - A pure `decisions/circuitSeasonTiles.ts` returns the tiles for a status, membership and pass state.
   - `CircuitLeagueMembersSection` gets avatars.
   - The orchestration exposes the viewer's available passes from the claims read it already makes. If it does not make that read in every status, it shows the line only where the data is present.
5. **Staging and claims drag:**
   - `CircuitStagingPanel` and `CircuitClaimList`: sensors, listeners on the pill or row, the swallowed click, Alt+Arrow, announcements, hint and menu changes.
   - Add a `useRowReorderSensors` beside `shared/dnd/useReorderSensors.ts` (pointer distance 6 plus touch delay 250, no keyboard sensor). Leave the existing hook as it is for admin.
6. **Moves:** `CircuitTransactionList`, `CircuitWaiverResults`, `CircuitClaimList`.
7. **Roster:** `CircuitRosterList` (flat list, limits line), `CircuitRosterScreen` (select).
   - Use a pure `decisions/circuitRoster.ts` helper for the flat order and the limits items.
8. **Standings:** `CircuitStandingsScreen` (switch, URL state, views).
   - Use a pure `decisions/circuitStandings.ts` for parsing the view.
9. **Points By category:** `CircuitScoreBreakdown` category view.
   - A pure aggregation that merges kinds per (selection, member) and orders entries, with a unit test that the card scores sum to the ceremony total.
10. **Chip copy** (only after the owner's (a)1): `decisions/circuitWaivers.ts` labels and errors, `CircuitPriorityList`, `CircuitClaimModal`, `CircuitClaimsSection`, rules content.
11. **D16 elsewhere:**
    - `SeasonParticipantsColumn`, `SeasonParticipantsModal`, `SeasonInvitesModal` and `LeagueMembersSection`.
    - Types: `avatar_key` on season and league member shapes in `lib/types.ts`.

### 9.2 API: read-only additions

- `listSeasonMembers` (`apps/api/src/data/repositories/seasonMemberRepository.ts`) selects `u.avatar_key`. The season detail response carries it.
- The league members read (`leagueRepository.ts`, around line 428) does the same.
- Shared schemas in `packages/shared` gain the optional field.
- Integration tests assert the field.
- No writes and no migrations.

### 9.3 Tests and visuals

- **Unit tests:** tiles per status; the standings view parse; the flat roster order and the limits line; the By category merge and its sums; `PlayerName`; the move-line accessible names.
- **E2E tests:**
  - Reorder the queue by mouse drag, by Alt+Arrow and through the menu; a drag does not arm.
  - Double-click to draft still works.
  - Reorder claims by drag.
  - Each standings view loads from its URL.
- **Visual:** SCREENS rows as in section 7. The seed needs a season with per-category limits for the limits line (add it to an existing in-season league, or accept the line as untested in the sweep and cover it with a unit test), and a viewer holding an available pass for the tile line.
- **Tour:** update the steps that click the grip, read "(you)", or rely on the season page's header buttons. They now click tiles.

### 9.4 Risks

- **Drag on the pill against the draft gesture.** The 6 px distance, the swallowed post-drag click and the disarm on drag start must all be in place, or a drag could arm a pill. E2E covers it.
- **dnd-kit listeners on a button.** Spread only `onPointerDown` and `onTouchStart` from the sortable listeners onto the pill. Do not spread `onKeyDown`, which would take over Space.
- **Room geometry assertions** (`room-rail-align`). With the grip gone, the queue and staged pills must still share a left edge; the rank column stays in both.
- **Removing `.circuit-row` from season screens** must not touch admin. Admin rows keep the class.
- **Copy rename (D23)** touches tests and the rules content. Do it as one commit after approval, and leave API error codes unchanged.

## 10. Marginal improvements

Each applies in every brand and mode.

| # | Current | Change | Benefit | Cells |
| --- | --- | --- | --- | --- |
| M1 | Waiver priority, rules and claim rows reuse the admin row, with a raised fill and content flush to its edges (same fault as D20) | `.season-row` everywhere on season pages (4.3) | One row language; no row looks broken | `circuit-waivers*`, `circuit-rules` |
| M2 | The ⋯ menu's tooltip says only "More actions" | Tooltip names the contents ("Move or remove", "Draft, move or remove"); the menu opens with the contender's name; first Up and last Down disabled | Players know what ⋯ holds before opening it, and which row it acts on | `circuit-draft-lobby`, `-room`, `-staging` |
| M3 | Claim rows show "dropping" and the pill inline, unlike the new logs | The same stacked moves (5.5) | Claims, results and transactions read the same | `circuit-waivers-window`, `-processing` |
| M4 | Transactions' header link says "Rosters" for a member; the season page and waivers say "Your roster" | "Your roster" for members, "Rosters" for others | Same label for the same destination | `circuit-transactions` |
| M5 | Leaderboard totals use proportional figures | Tabular numerals | Totals align down the column | `circuit-standings*` |
| M6 | Reordering gives no confirmation to screen readers outside dnd-kit's own messages | "Moved X to position n of m" on every input | Keyboard and screen-reader users know the result | `circuit-draft-lobby`, `circuit-waivers-window` |
| M7 | Standings section titles repeat what a switch would say | Visually hidden view headings; the switch is the visible label | Less chrome, heading structure kept | `circuit-standings*` |
| M8 | The roster Player select is text only | Avatar in the options and in the field | The same identity cue as every list | `circuit-roster-*` |
| M9 | Season tiles would be links with a two-part name | Name = title; description via `aria-describedby` | Short, predictable link names for screen readers | `full-season-*` |
| M10 | "Priority after: cora, emmy, pia, theo" is a sentence | An ordered inline list of avatars and names | Reads as the order it is, consistent with D16 | `circuit-waivers` |
