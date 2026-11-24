# Circuit parity: full seasons drawn like the ceremony experience

Package: `circuit-parity` (dogfooding D4 to D8, D11 to D13). Spec for `circuit-parity-build`. There is no mockup. The design source is the ceremony draft room as it ships in every brand: its nominee pills, rails, roster cards, nominee card, confirm toast and phone nominee card. Current full-season screens are taken from the player tour (`pnpm run tour`, screenshots 055 to 105) and `docs/design/app-inventory.md` (sections 1, 2.8, 3.1, 4.2, 5, 6).

Brand letters as in earlier prescriptions: A refined-gold, B red-carpet, C ballot, D noir, E festival, F technicolor, G lightbox. "Ink" is `--brand-text`. Paths are relative to `apps/web/src` unless they start with `apps/`, `packages/`, `docs/` or `tests/`. Player copy says "season", never "Circuit" (ADR 0006). No string in this prescription contains "circuit".

## 1. Scope

**In scope** (every brand A to G, both modes, 1280 and 390; 768 follows the desktop rules unless stated):

| Screen | Route (under `/leagues/:leagueId/:leagueSlug/seasons/full/:id`) | What changes |
| --- | --- | --- |
| Season page | `/` | One Add/drop button (D6); header group order |
| Season draft room: lobby, live, supplemental, paused, reconnecting | `/draft` | Pills in history and My roster rails, staging rows as pills with the D13 gesture, picker preview pill |
| Season draft board (completed) | `/draft` (IN_SEASON, COMPLETE) | Board drawn as roster cards and category cards of pills; supplemental is an ordinary pick (D5) |
| Roster (own and others', free agency open and closed) | `/roster` | Pills with points (D8), drop and add as icons (D7), denser |
| Transactions | `/transactions` | Pills, denser rows |
| Waivers (no window, window open, processing, results) | `/waivers` | Claim rows as pills, icon actions, results as pills |
| Ceremony points | `/standings/:ceremonyId` | Two views, By player and By category (D11) |
| Standings, season complete | `/standings` (COMPLETE) | Final results with two views, All scoring contenders and Final rosters (D12) |
| Claim modal, drop confirm, phone nominee card | modal | Pill preview in the modal title area; one phone card for every pill |

**Not changed**

- The ceremony draft room, its pills, toast, rails, header and phone tree. This package reuses them; it changes none of their pixels. The only edits to ceremony code are moves of render-only pieces so the season screens can share them (section 9).
- Information architecture: no new routes, no screens removed. The season page's settings card, members section, membership bar and lock control. Rules page. Standings leaderboard and By ceremony list (kept as they are, plus the final-results section at COMPLETE).
- Token contract, brand definitions and values. No slot is added (section 3).
- Server rules for drafting, claims, free agency and scoring. The API gains reads only (section 9.2).
- Home, `/seasons`, league page, admin Circuit screens, create season.
- The status words (Pre-draft, Drafting, In progress, Complete) belong to `season-status-lifecycle`, which merges first.

## 2. Intent

A full season should feel like the same game as a single-ceremony season, played for longer. Wherever a player meets a contender (choosing, queueing, owning, losing, scoring), it is the same object they handled in the ceremony draft: a nominee pill, with the category's icon, the nominee card on hover or tap, and gold when it wins. Lists of contenders read as rosters, not as paperwork: one line per pick, points at the end of the pill, actions as quiet icons beside it.

Players act on the pill itself where the ceremony room already taught them how (double-click to draft, select and confirm, tap for the card on a phone), and through small labelled icons where an action has to stay visible (drop, claim, withdraw). Every number shown in a list adds up to the number above it.

## 3. Token values

No contract slot changes and no new brand values. The package reuses existing slots and the shared win gold. The one new pill state (`is-dropped`) and the page scope for pills are built from existing slots:

- `.fo-pillScope` (new wrapper class for pills outside the draft frame): `--dr-ink: var(--brand-text); --dr-ground: var(--brand-raised);`, the same values `.dr-card` sets inside the room. Pills read `--dr-ink`, so without this scope they would lose their ink on pages.
- `.dr-pill.is-dropped`: `border: var(--fo-border-width) dashed var(--brand-rule-strong)`; fill and ink unchanged (default: `--brand-raised`, `--dr-ink`); full opacity. With `is-winner`: the dashed border takes `--fo-win-gold-on`.
- `.dr-pill-caption` (new, outside the pill): `--brand-muted`, `--fo-db-pill-font` size, regular weight, one line, ellipsis, `title`.

The tokens check rule for `.dr-` selectors (no enum reads, no `[data-brand`) holds: none of these read an enum.

### 3.1 Contrast of every text and boundary pair this package paints

Computed from the brand files at `origin/main` (WCAG 2.1 relative luminance). Pill fill is `raised`; pages put pills on `page`, `surface` (cards) or `raised`. Minimum required: text 4.5, non-text boundary 3.0.

| Pair | Use | A L / D | B L / D | C L / D | D L / D | E L / D | F L / D | G L / D |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| text / raised | default pill label | 17.37 / 15.01 | 18.00 / 15.90 | 16.51 / 13.97 | 18.88 / 16.16 | 17.67 / 16.28 | 16.45 / 15.00 | 18.42 / 14.30 |
| muted / raised | points inside a default pill, captions on raised cards | 6.03 / 6.63 | 6.43 / 8.02 | 6.99 / 6.23 | 6.90 / 7.17 | 5.95 / 7.19 | 6.85 / 8.72 | 7.25 / 6.66 |
| muted / sunken | owned-elsewhere and lost pills (`is-muted`), their points | 5.21 / 5.97 | 5.14 / 7.38 | 5.91 / 5.75 | 5.68 / 6.46 | 5.45 / 6.45 | 5.84 / 7.49 | 5.73 / 6.05 |
| muted / page | captions on the page ground | 5.69 / 7.20 | 5.70 / 8.52 | 6.53 / 6.71 | 6.27 / 7.80 | 6.50 / 7.81 | 6.50 / 9.54 | 6.17 / 7.21 |
| muted / surface | captions inside surface cards | 5.21 / 5.97 | 6.43 / 8.02 | 6.99 / 6.23 | 6.90 / 7.17 | 5.95 / 7.19 | 5.84 / 7.49 | 7.25 / 6.66 |
| page / text | armed pill (ink inversion) | 16.38 / 16.31 | 15.95 / 16.90 | 15.41 / 15.04 | 17.17 / 17.58 | 19.30 / 17.67 | 15.59 / 16.42 | 15.68 / 15.48 |
| win-gold-on / win-gold | won pill label and points | 9.24 / 11.20 (all brands, shared tokens) | | | | | | |
| ruleStrong / raised | dropped pill dash (on the pill's own fill) | 3.59 / 3.42 | 3.86 / 3.35 | 3.69 / 3.37 | 3.84 / 3.45 | 3.33 / 3.43 | 3.59 / 4.47 | 3.97 / 3.38 |
| ruleStrong / page | dropped dash against the page | 3.39 / 3.71 | 3.42 / 3.56 | 3.45 / 3.63 | 3.49 / 3.75 | 3.64 / 3.72 | 3.40 / 4.89 | 3.38 / 3.66 |
| ruleStrong / surface | dropped dash inside a surface card | 3.10 / 3.08 | 3.86 / 3.35 | 3.69 / 3.37 | 3.84 / 3.45 | 3.33 / 3.43 | 3.06 / 3.84 | 3.97 / 3.38 |
| text / page, text / surface | totals, usernames | ≥ 15.0 / ≥ 13.5 everywhere | | | | | | |

Every pair passes. The narrowest is the dropped dash in a surface card in F light (3.06) and A dark (3.08). That dash is a secondary cue (rule 5.1.4): the "Dropped" caption carries the meaning in text.

**Not used, on purpose.** Win gold as text (`--fo-win-gold-text`) on `surface` is 4.37 in A light and 4.24 in F light, so points and captions are never gold text. Gold is only ever the won pill's fill, with on-gold ink. Status colours stay unrendered.

## 4. Component rules

### 4.1 The season pill (one component for every contender)

**Construction.** It is the ceremony's static roster pill (`.dr-pill .dr-pill-static`, 22 px desktop, radius `--dr-pill-radius`), rendered by one shared component, `ContenderPill` (section 9.1). It contains, left to right:

1. The category icon (`DraftCategoryIcon`, `icon_code` and `icon_variant` of the season category), class `dr-pill-icon`. **Always present (owner, 2026-11-23): a contender is never drawn as a pill without its category**, including inside structures that already name the category (roster groups, board by category, the By category points view). If a category has no icon, the pill shows the fallback glyph (escalation (a)5) rather than nothing.
2. The label: `circuitSelectionLabel` ("Name, Film (2026)" for acting, "Film (2026)" otherwise), one line with an ellipsis, full label in `title`.
3. Optional points (`dr-pill-points`), wherever the context scores (4.6). Use the ceremony roster's signed format, extended to two decimals: `+3`, `0`, `+4.5`, `−1`.

**Outside the pill**, on the same row: an optional caption (`.dr-pill-caption`) such as "Dropped" or "Owned by pia", and the row's icon actions.

**Accessible name:** "`<Category>: <label>`", plus ", `<n>` points" where points show, plus the state suffix (", dropped", ", owned by pia", ", lost"). The pill is `role="group"` and `tabIndex=0` wherever it carries a tooltip (as the ceremony roster pills are). It is a button only where it has a gesture (4.3, 4.8).

**Category is the icon; the tooltip covers the rest (owner, 2026-11-24).** Categories never share an icon, so the icon identifies the category and no "in `<Category>`" caption is added anywhere. Every pill, in every context, carries the standard nominee tooltip (`NomineeTooltipCard`, hover and focus on desktop, the phone nominee card on touch), which names the category and fills any gap the pill leaves. Context additions (points section, drafted chip in the draft room only) are sections of that same card, never a different tooltip.

### 4.2 Pill states in full-season contexts

Ceremony states are reused wherever they mean the same thing. There is one new state.

| Full-season meaning | Where | Pill class | Non-colour cue | Caption |
| --- | --- | --- | --- | --- |
| Free agent, or a contender you are considering | Picker preview, free agency, staging rows nobody has drafted | default | n/a | none |
| Owned by you | Your roster, My roster rail, your claims, your queue after drafting it | default | n/a | none (the context says "yours") |
| Owned by someone else (where you are choosing) | Staging rows drafted by others; picker preview when the contender is owned | `is-muted` (the ceremony's "already drafted") | Transparent border instead of the rule; regular weight | "Owned by `<name>`" in the picker; in the room the nominee card's drafted chip (as in the ceremony) |
| Claimed (your pending claim) | Your claims list | default | Rank number and grip on the row | Drop line (4.10) |
| Claim lost | Waiver results | `is-muted` | Outcome text "Lost: `<reason>`" | outcome |
| Claim won, free-agent add, draft pick (log contexts) | Results, transactions | default | Verb text "Added", "Claimed" | verb |
| Dropped (left a roster) | Transactions "Dropped", results "dropping", claim drop target, ceremony points for a pick dropped since | `is-dropped` (new) | Dashed border, plus the caption | "Dropped" (points views) or the verb "Dropped" / "dropping" (logs) |
| Won | Roster and points views (4.6) | `is-winner` (gold fill, on-gold ink) | Fill change; the tooltip says "Win +n" | none |
| Selected (armed) for a draft | Staging rows, on the clock | `is-armed` (ink inversion with check mark) | Check mark, `aria-pressed` | none |
| Draft request in flight | Staging rows | `is-pending` (dashed, 0.65 opacity) | Dashed border | none |
| Missed slot | Draft history only (D5) | the existing muted "Missed" pill | Text | none |

**Combinations.** Won plus dropped is a gold fill with a dashed on-gold border, plus the caption. Muted is never combined with won. Pending replaces armed.

**Gold.** A pill is gold when, in that view's scope, the contender won:

- Per-player views (your roster, Final rosters, By player): it won at least once while this player owned it.
- The By category view: it is in the Wins column.
- All scoring contenders: it won at least once in the season.
- The draft room, transactions, claims and results never show gold. They record moves, not scoring.

### 4.3 Draft room: drafting from the queue (D13)

**Primary gesture: double-click the pill, as on the ceremony board.** Select-then-confirm comes with it, as in the ceremony room. Drag onto the pick panel is rejected: it conflicts with the queue's reorder drag, has no natural keyboard path and is unreachable on a phone.

**Row construction** (queue and staged lists, `.circuit-stageRow` becomes one line):

- Queue row: `[grip 32] [rank, 3ch, tabular] [pill 1fr] [⋯ 32]`.
- Staged row: the same grid, with the grip and rank cells empty, so the pills' left edges align (the room's rail alignment rule).
- Pill: category icon and label, no points. Gap 8 px, row height 32 px, rows separated by 4 px (no dividers).
- The "Draft" text button is removed from every row.

**States of a staging pill:**

| Condition | Pill | Pointer | Gesture |
| --- | --- | --- | --- |
| Not on the clock, paused, reconnecting, lobby | default, `aria-disabled="true"` (still focusable, tooltip works) | default cursor, no hover change | none; the row menu works |
| On the clock (`canDraft`) | default; hover adds the ceremony's `data-turn="mine"` treatment (`--brand-rule-strong` border, 1 px lift, medium weight) | pointer | click arms, double-click drafts |
| Armed | `is-armed` | pointer | toast click confirms; Escape, a second click or a click elsewhere disarms |
| Request in flight | `is-pending` on that pill; every other staging pill `aria-disabled` | default | none until it settles |
| Drafted by anyone | `is-muted`; tooltip shows the drafted chip (name and round-pick) | default | none; the menu offers Remove only |

**Confirm.** Reuse `useDraftPickConfirmToast` unchanged. After 220 ms an armed pill raises the persistent toast "Confirm draft pick / Draft "`<label>`"", and clicking the toast drafts. This is the "about to happen" signal: the ink-inverted pill with its check, and the toast naming the contender.

**Keyboard.** Each staging pill is a button in the list's tab order (the lists are short, so no roving tabindex is needed). It carries the ceremony's exact contract: Enter or Space (on keyup) arms or disarms; Shift+Enter drafts; Escape disarms; held keys never act; `aria-keyshortcuts="Enter Space Shift+Enter Escape"`; armed pills are `aria-describedby` the hint "Selected. Press Shift+Enter to draft, Escape to cancel."

**Row menu (`⋯`, `more_horiz`, labelled "More actions for `<label>`", tooltip "More actions").** Items, in order:

- **Draft** (only while `canDraft` and the row is undrafted; a discoverable path for anyone who doesn't know the gesture).
- Then, for a queue row: Move up, Move down, Move to staged, Remove from queue. For a staged row: Add to queue, Remove from staged.

**Touch and phone.** A tap on a pill opens the phone nominee card (4.11) with the contender's card and, as 44 px full-width buttons: **Draft** (primary, only while `canDraft`), then "Move to staged" or "Add to queue", then "Remove". Double-tap does nothing special: a tap opens the card, and a second tap lands on the overlay. The grip stays 44 px and is the only drag source.

**Discovery.**

- The staging note (`circuit-staging-note`, already `aria-describedby` of the rows) changes wording by state:
  - On the clock, desktop: "You're on the clock. Double-click a contender to draft it, or select it and confirm."
  - On the clock, phone: "You're on the clock. Tap a contender, then Draft."
  - Otherwise: unchanged ("Waiting for emmy to pick. You can draft from here when you're on the clock.").
- The pointer cursor and hover lift appear only while a pick is possible.
- The nominee tooltip (hover or focus) is unchanged.

**Why an accidental pick is hard:**

1. No single action drafts. A click arms, and the confirm is a separate deliberate target (the toast).
2. Double-click acts only while `canDraft` is true: on the clock, connected, not paused, nothing in flight, contender undrafted. Two clicks must land on the same pill within the OS double-click interval.
3. The pill is never a drag source. Only the grip drags, and double-clicking the grip does nothing.
4. Keyboard drafting needs the Shift+Enter chord. Plain Enter or Space only arm, and auto-repeat is ignored.
5. On a phone, drafting needs the card's Draft button (44 px). There is no double-tap path.
6. A turn change, pause, disconnect, or the contender being drafted elsewhere clears the arming and the toast. This is the ceremony's existing effect; add a polite announcement "Selection cleared: `<label>` is no longer available" when the cause is a drafted contender, which fixes inventory 6.6's silent disarm for the season room.
7. Only one request is in flight. Its pill shows pending, and every other draft gesture is off until it settles.

**Form ("Your pick").** The confirm buttons "Draft X", "Queue X" and "Stage X" stay. The picker preview gains a pill (4.9).

**Live region.** Unchanged (turn moves only). A pick drafted by the gesture is announced like any other confirmed pick.

### 4.4 Draft room: rails

- **Draft history** (`CircuitDraftRailLists`): the ceremony ledger row `[round-pick] [avatar] [pill]`, with the pill now carrying the category icon (today it has none, so "Paper Moons" twice in tour 063 is ambiguous).
  - Tooltip: the nominee card with the drafted chip.
  - "Missed" and "—" are unchanged. Supplemental slots keep `S-n` in the meta column: the history is where D5 allows the record. The slot on the clock keeps `data-active`.
- **My roster** (rail): the ceremony roster row `[round-pick] [pill with icon]`. The `.circuit-railSub` category line is removed, because the icon and tooltip carry it. A supplemental pick shows its original slot's round-pick ("1-2"), not `S-n`. A pick is a pick.
- **Phone**: the same rows inside the bottom-bar panes. A tap on a pill opens the phone nominee card, with no actions in history and none in My roster.

### 4.5 Draft board, completed (D5)

The board keeps its header note, its "Board" title and the By player / By category `SegmentedControl` (the reference switch for every view switch in this package).

- **By player.** One card per seat, in draft order. It uses the ceremony roster card's header and pills, rendered by `SeasonRosterCard` (4.12):
  - Header: avatar, name ("(you)" suffix), and the meta "4 of 4" in the score cell.
  - Rows: `[round-pick] [pill with icon]`, ordered by original pick number. A supplemental pick sits in the slot it filled, with that slot's round-pick, and looks like every other pick.
  - A slot never filled (missed twice, so a chip) is simply absent. The meta reads "3 of 4".
  - No "From queue", no "Missed", no start border, no notes.
  - No points: the board is the draft, not the current rosters.
- **By category.** One card per category, with a title row of icon and name like the ceremony category card, and the meta count. Rows: `[round-pick] [avatar] [pill with icon]` (the ledger row). Empty: "None drafted."
- **Layout.** Cards in the existing auto-fill grid, `minmax(min(100%, 14rem), 1fr)`, gap 12/10 (the room's card gap rule). Phone: one column.
- **Tooltip.** The nominee card with the drafted chip, as in the ceremony room.

### 4.6 Points on pills (D8, D11, D12)

**What a figure means.** A pill's figure is the points that contender scored for that player, in the view's scope:

- Roster views: season so far, while this player owned it.
- By player: this ceremony.
- All scoring contenders: the season, for every player.

Points follow ownership at the occasion's instant (`docs/architecture/circuit.md`), so the same contender can carry different figures for different players.

**Breakdown tooltip.** It is the nominee card (`NomineeTooltipCard`) with a new optional points section, `.fo-tip-points`, between the body and the TMDB footer:

- Heading (label voice, xs): "Points for `<name>`", or "Points" in the contender-level view.
- One line per ceremony where it scored in scope: ceremony name (wraps), then "Nomination +1 · Win +2" (omit a zero part), and the line total right-aligned with tabular numerals. In All scoring contenders, each line also names the player: "Northlight Awards 2035 · pia · Nomination +1".
- A "Total" line when there are two or more lines.
- With no lines: "No points yet."
- The section's total always equals the figure on the pill.
- The drafted chip ("badge") is omitted everywhere outside the draft room (D12), because ownership changes after the draft.

This mirrors the standings breakdown wording ("Nominations n pts · Wins n pts").

**Reconciliation rule (every view).** Whenever a total sits above a list of pills, the pills plus any stated remainder add up to the total:

- Roster page: header meta "12 pts so far". Pills sum to it, or a muted line under the picks says "Plus 2 pts from picks dropped earlier in the season". Omit that line at zero.
- Final rosters: the same line per card.
- By player (ceremony): dropped picks are listed in the card, so they sum without a remainder line.
- All scoring contenders: the sum of every row equals the sum of the leaderboard totals. A unit test checks this against the ledger.

### 4.7 Roster page (D7, D8)

- **Header and layout.** Unchanged: title, subtitle, buttons, Player select, two columns `baseline-grid2Wide`.
- **Picks column.** Section title "Picks" with the meta "4 of 4 · 12 pts so far".
- **Category groups.** Compact headings (Marginal improvement M3): category icon, name and the "n of max" meta in one 28 px row in the label voice. No dividers between picks.
- **Pick row:** `[pill with points, 1fr] [drop icon 32]`, row height 32, gap 4.
  - The pill carries its category icon (always; see 4.1). It is gold if it has won for this player.
  - The drop icon appears only on the viewer's own writable roster. It is `ActionIcon` `data-fo-variant="ghost"`, glyph `remove_circle`, `aria-label="Drop <label>"`, visible tooltip "Drop". It keeps today's confirm dialog ("Drop" confirm label), so a drop is never one click.
  - While a drop runs, the active icon shows the loader and the others are disabled.
- **Empty states.** Unchanged ("No picks yet.", "None" per category, the not-joined note).
- **Phone.** Drop icon 44 px. A tap on a pill opens the phone nominee card with the points section and, on your own writable roster, a 44 px "Drop" button (danger variant). It runs the same confirm.

### 4.8 Free agency panel (D6, D7)

The panel ("Add a free agent") stays on the roster page, in the right column. It is the Add/drop destination outside a window, and the button deep-links to it (`#add`, focus moves to the section heading).

- **Drop select.** Placeholder "Select a pick to drop" when the roster or the chosen category is full, else "Don't drop anyone" (Marginal improvement M4, matching D3). The first option is "Don't drop anyone"; it stays clearable.
- **Picker.** The contender picker as today. Once a contender is fully chosen, the picker preview (4.9) shows a row `[pill with icon] [caption] [add icon 32]`. The add icon (`add_circle`, `aria-label="Add <Category>: <label>"`, tooltip "Add") replaces the "Pick X" text button. With a drop chosen, the tooltip reads "Add, dropping `<drop label>`".
- **Pending and errors.** The pending retry pair ("Add X" and "Cancel") stays text. It is a recovery state that needs words.
- **Closed states.** The notes are unchanged (the window-open and processing wording).

### 4.9 Picker preview pill (draft form, free agency, claims)

`ContenderPicker` keeps its fields. It is shared with admin, and admin is unchanged: the preview pill renders only when a new optional `previewPill` prop is passed. The chosen-film row keeps "Change".

Below it, the season screens add one preview line: the contender pill (with icon). If the selection read reports an owner (9.2), the pill is `is-muted` with the caption "Owned by `<name>`" (or "Already on your roster"). The add or claim icon is then disabled with the tooltip "Owned by `<name>`", and the draft form's Draft, Queue and Stage buttons keep their own server checks.

Film search results stay as listbox options. They are films, not contenders yet, so drawing them as pills would misstate them (deviation 6.2).

### 4.10 Waivers (D7)

**Your claims.** Each row: `[grip] [rank] [claim pill with icon] [caption]`. The caption has two parts:

- "dropping" plus the drop pill (`is-dropped`, with icon), or "No drop".
- The chip meta "Pick 7 chip".

Desktop actions are four 32 px icons as today (Move up `arrow_upward`, Move down `arrow_downward`, Edit `edit`, Withdraw `close`), each with a visible tooltip naming the action and an `aria-label` naming the pick. Clicking the claim pill opens the edit modal, the same as Edit.

**Phone.** `[grip 44] [rank] [pills stack] [⋯ 44]`. The menu holds Move up, Move down, Edit claim and Withdraw (Marginal improvement M7). A tap on the pill opens the edit modal.

Locked or busy: every control is disabled as today. Withdraw keeps its confirm.

**Claim a contender.** The picker as today (picking still opens the claim modal), with the preview pill (4.9).

**Claim modal.**

- The title stays "Claim X" or "Your claim for X". The first line of the body is the claim pill.
- The "Drop if this claim wins" select's chosen value is echoed under it as an `is-dropped` pill. Its behaviour is unchanged (D3).

**Priority and chips.** Rows are unchanged apart from M6 (avatar before the username).

**Results.** Per run, as today (title, "Ran" time, Priority after). Each claim row:

- `[n.] [avatar] [username] [outcome]` on the first line. The outcome moves next to the name (M5).
- `[claim pill with icon] [dropping + is-dropped pill]` on the second line.
- A won claim's pill is default and a lost claim's is `is-muted`. The chip goes in the outcome text ("Won · Pick 7 chip").

### 4.11 Phone nominee card (every pill on a phone or a coarse pointer)

One behaviour for all season pills: on a tap, when the viewport is below 500 or the primary pointer is coarse, the pill opens the ceremony's phone nominee card.

- It is the existing centred `Modal` titled "Nominee details" (visually hidden title, 44 px Close, `trapFocus`, `returnFocus`), holding `NomineeTooltipCard`.
- It includes the points section when the context scores, and the context's actions in its `action` slot as 44 px full-width buttons:
  - Staging: Draft, Move, Remove.
  - Own roster: Drop.
  - Claims: Edit claim, Withdraw.
  - Elsewhere: none.
- Escape and Close return focus to the pill.

Desktop hover and focus keep the tooltip. This makes the D8 breakdown reachable on touch, which hover tooltips are not today (inventory 5).

### 4.12 Roster card (`SeasonRosterCard`, shared)

This is the page version of the ceremony roster card. It is used by the completed board By player, the ceremony points By player view and Final rosters.

- **Card.** `StandardCard` with `.fo-pillScope`, padding 12.
- **Header row.** Avatar (`AvatarToken`, sm), name (one line, ellipsis, `title`, "(you)"), and on the right the score cell (`min-width 3ch`, end-aligned, tabular, `--brand-font-numeral`, 16 px) holding the total or the count. Below it: a hairline (`--brand-rule`).
- **Rows.** Pills at 4 px gap, with an optional meta column (round-pick) aligned as the rails align (`--dr-meta-ch`).
- **Grid.** `repeat(auto-fill, minmax(min(100%, 14rem), 1fr))`, gap 12 down and 10 across. Phone: one column. No rotation track: pages scroll.

### 4.13 Ceremony points (D11)

**Header.** Unchanged: the ceremony name, the "Event · Nominations date · Winners date" subtitle, and "Back to standings".

**View switch.** Below the header: the `SegmentedControl` "By player" | "By category" (the board's control, the same order). Its `aria-label` is "Show points". The default is By player. The choice is kept in `?view=category`, so Back and shared links keep it.

**By player.** The players' `SeasonRosterCard`s in rank order:

- Header: rank and name ("1. pia"; tied ranks repeat), with the ceremony total in the score cell. Below the header, a muted line: "Nominations 6 pts · Wins 2 pts".
- Rows: one pill per pick that scored for them here, with icon. The pill's points are its ceremony total (nomination plus win), and it is gold if it won here.
- A pick the player has since dropped: `is-dropped` plus the caption "Dropped". It still counts.
- Order: points descending, then label.
- Empty card: "No points at this ceremony."

**By category.** One row per season category, in category order:

- Desktop grid `minmax(10rem, 14rem) 1fr 1fr`:
  - Cell 1: icon and category name (wraps).
  - Cell 2, "Nominations": the entries that scored a nomination here.
  - Cell 3, "Wins": the entries that scored a win here.
- The column headings appear once at the top, in the label voice (xs, muted).
- An entry: `[pill with icon and that kind's points] [player: avatar xs + name, one line, ellipsis, max 45%]`. A dropped-since entry gets `is-dropped`, and its player name is followed by "· dropped". Wins-column pills are gold.
- One contender owned by two players over time can appear twice in a column: once per player who scored.
- An empty cell shows "—" (muted, `aria-label="None"`). A category with no entries in either column stays, so the list is complete.
- Rows are separated by a hairline.
- **Phone:** each category becomes a block. The icon and name come first, then "Nominations" (label voice) with its entries, then "Wins" with its entries. Entries keep the pill and player on one line.

**States.** The loading skeleton and errors are unchanged. Live refresh on `score:update` is unchanged; add a polite `role=status` line under the switch, "Points updated", shown for 4 s after a refresh changes the data, so a reader knows why rows moved (inventory 6.6 notes the silent reorder). Ceremonies with no points: By player shows each card's empty text; By category shows every row with "—".

### 4.14 Final results (D12)

**Placement.** On `/standings` when the season is `COMPLETE`, a new section "Final results" sits between Leaderboard and By ceremony. It has a section title, the `SegmentedControl` "All scoring contenders" | "Final rosters" (`aria-label="Show final results"`; the default is All scoring contenders; the choice is kept in `?results=rosters`), and a divider. Before COMPLETE the section is absent. The season page's Standings button is unchanged.

**All scoring contenders.** One row per contender that scored in the season:

- Order: total points descending, then label. Tied totals share a rank number (1, 1, 3), as the leaderboard does.
- Row: `[rank] [pill with icon and season total] [players]`.
- Players: each player it scored for, as avatar xs, name and points ("pia +1"), in descending points, wrapping to further lines.
- Gold if it won at least once.
- Tooltip: the nominee card without the badge, plus the points section listing every ceremony where it scored, each line naming the player. Its total equals the row's total (see escalation (a)1 for the alternative).
- Empty (nothing scored): "Nothing scored this season."

**Final rosters.** Every player's `SeasonRosterCard`, in final rank order:

- Header: "1. pia" with the season total.
- Rows: the roster as it ended. Pills with icon and the season points scored for this player while they owned it; gold if it won for them.
- Under the rows, when non-zero: "Plus n pts from picks dropped during the season."
- Tooltip: per-player scope ("Points for pia").

**Phone.** One column. In All scoring contenders the players line wraps under the pill.

### 4.15 Season page: Add/drop (D6)

- **Placement.** The header button group gets **Add/drop** first, as the group's only primary (filled) button. It shows while the season is `IN_SEASON` and the viewer is a member. The rest of the group keeps its order and outline style (Draft board, Your roster, Transactions, Waivers, Standings, Rules, Back to league).
- **Destination**, decided by a pure `decisions/circuitAddDrop.ts` from the viewer's roster `free_agency` and the claims `locked` flag:
  - Free agency open: the roster page at `#add`.
  - Window open and not locked: the waivers page at `#claim` (focus on "Claim a contender").
  - Processing (the window has resolved or claims are locked, and claims have not yet run): the waivers page, where the locked note and the read-only claims live.
- **Processing wording.** The label stays "Add/drop". A `role=status` caption under the button group reads "Claims are being processed. Add/drop reopens once they have run." (muted, `baseline-textBody`), and the button is `aria-describedby` it. The button stays enabled, so players can watch their claims resolve.
- **Phone.** The group wraps as today. Add/drop leads and is full-width, 44 px; the rest wrap below.
- The roster and waivers pages' own header buttons are unchanged.

### 4.16 Transactions (D7)

**Desktop row** (one per transaction, 40 px minimum, hairline separators): `[avatar + username, 12rem] [moves, 1fr] [kind · time, auto, muted, right]`.

- Moves: "Added" (muted label) plus the pill with icon, then "Dropped" plus the `is-dropped` pill. Both wrap inside the cell.
- The time is a `time` element with the full date-time in `title`.
- Kinds: Draft, Supplemental draft, Waiver claim, Free agent, Drop (labels unchanged; the log is where the supplemental record belongs).

**Phone.** Username and kind · time on line 1, moves below.

Empty: "No transactions yet." (unchanged).

### 4.17 Loading, errors, empty

Skeletons and `CircuitPageError` are unchanged. New views reuse `CircuitPageSkeleton` ("Loading points", "Loading results"). If the points read fails on the roster page, the pills render without figures and a `FormStatus` reads "Couldn't load points. Try again." with a ghost "Try again" button. Rosters stay usable.

## 5. Interaction summary for QA (keyboard only)

| Action | Keyboard | Mouse | Touch / phone |
| --- | --- | --- | --- |
| Draft from queue or staged | Tab to pill; Enter or Space arms; Shift+Enter drafts; or the row menu's Draft | Double-click; or click, then the toast | Tap pill, then Draft in the card |
| Reorder queue | Grip: Space, arrows, Space; or menu Move up/down | Drag the grip | Drag the grip (44 px); or the card's buttons |
| Drop from roster | Tab to the drop icon, Enter, then confirm | Icon, then confirm | Icon or the card's Drop, then confirm |
| Add a free agent | Picker, then Tab to the add icon, Enter | Add icon | Add icon (44 px) |
| Edit or withdraw a claim | Icons (desktop) or the menu (phone) | Icons; pill click edits | Menu; pill tap edits |
| See a breakdown | Focus the pill (tooltip on focus) | Hover | Tap, then the card |
| Switch views | Arrow keys in the segmented control | Click | Tap (segments 44 px below 500) |

Every icon action has a visible tooltip and an accessible name that includes the contender. Focus rings are `--brand-focus-ring` (pills: the ceremony's pill ring). Phone targets are 44 px except the pills themselves, which keep the ceremony's allowlisted 22 px with spacing (their tap opens a card whose buttons are 44 px).

## 6. Deviations from the source (the ceremony experience)

There is no mockup, so these are departures from strict ceremony parity. None needs Claude Design.

1. **No category caption; tooltip on every pill** (4.1). Categories never share an icon (owner), so the icon names the category and the standard nominee tooltip covers the rest, as in the ceremony room.
2. **Film search results are not pills** (4.9). They are films, not contenders.
3. **Points inside pills are signed and may be fractional** (`+4.5`). Season weights can produce halves; the ceremony formatter is extended, not replaced.
4. **The board shows no points** (4.5). The ceremony's completed board shows scores, but a season board is a draft record that ownership changes overtake. Rosters and standings carry points.
5. **A new pill state, `is-dropped`**. The ceremony has no ownership change. It reuses the pending state's dash language (dashed means "not held now") without its opacity, so it stays fully legible.
6. **Staging pills are tab stops** (no roving tabindex as on the ceremony board). The lists are short and each row has a menu. Roving would hide the menu from the tab order.

## 7. Acceptance per screenshot

The screenshot tier captures only Home and the sample card (`tests/visual/matrix.ts`), and this package changes neither. **No baseline image changes.** The design reviewer judges the gallery (all 7 brands × 2 modes × 1280 and 390, captured by the tour and the assertion sweep). The assertion tier must pass for every row below.

**Every cell, every brand and mode:**

- Pills match the ceremony's pill in the same brand: radius, height, font and the edges of each state.
- No pill text clips without an ellipsis and `title`.
- No gold text anywhere.
- Dropped pills show a dash and a caption.
- Icon buttons show their tooltip on hover and focus.
- Phone pages have no horizontal scroll.

| Cells (existing SCREENS rows unless marked new) | Desktop 1280 | Phone 390 |
| --- | --- | --- |
| `circuit-draft-lobby` | Staging rows on one line (grip, rank, pill, ⋯); no Draft buttons; history pills with icons | n/a (desktop row) |
| `circuit-draft-room` (casey on the clock) | Staging note with the double-click hint; queue pills hover-lift on pointer; history shows the muted "Missed" plus icon pills; My roster rail one-line icon pills | n/a |
| new `circuit-draft-armed` (desktop) | One queue pill armed (ink inversion, check), the confirm toast "Draft "…"" | n/a |
| `circuit-draft-staging` (phone) | n/a | Staging pane rows `[grip 44][rank][pill][⋯ 44]`, note "Tap a contender, then Draft." |
| new `circuit-draft-card` (phone) | n/a | The nominee card modal over the room with 44 px Draft, Move to staged, Remove |
| `circuit-draft-board` | By player: roster cards with avatar, name and "n of 4", icon pills, supplemental pick in its slot, no Missed or From queue | One column of the same cards |
| new `circuit-draft-board-category` | Category cards with ledger rows (round-pick, avatar, pill with icon) | One column |
| `circuit-roster-own` (casey, full roster) | Compact category headings with icon; pills with points; drop icons with tooltip; "12 pts so far"; picker preview row with add icon; drop select placeholder "Select a pick to drop" | 44 px drop icons; the same rows |
| `circuit-roster-window` (blake, own roster, window open) | Free agency closed note in the right column; pills with points; drop icons still present (drops stay open in a window, as today) | same, 44 px icons |
| new `circuit-roster-other` | Another player's roster: pills with icons and points, no action icons, no panel | same |
| new `circuit-roster-tooltip` (desktop) | A pill's nominee card with the points section, two ceremony lines and a Total | n/a |
| `circuit-transactions` | Rows with avatar, "Added" icon pill, "Dropped" dashed pill, kind · time right | Two-line rows |
| `circuit-waivers` (no window) | Results claim rows with outcome beside the name and pills on line 2 | same, wrapped |
| `circuit-waivers-window` (blake) | Claim rows: pill, "dropping" dashed pill, chip meta, four icons with tooltips | Rows with a single ⋯ menu |
| new `circuit-waivers-processing` | Locked note, read-only claim pills | same |
| new `full-season-in-season` | Add/drop filled first in the header group | Add/drop full-width first |
| new `full-season-processing` | Same, with the processing caption under the group | same |
| new `circuit-points-player` | Switch on By player; roster cards in rank order; a dropped pick dashed with "Dropped" | One column |
| new `circuit-points-category` | Switch on By category; category rows with Nominations and Wins columns; gold pills in Wins; player chips | Category blocks with stacked Nominations and Wins |
| new `circuit-standings-final` | Final results section between Leaderboard and By ceremony; All scoring contenders rows with player chips | Wrapped player lines |
| new `circuit-standings-final-rosters` | Final rosters cards with the "Plus n pts from picks dropped" line where it applies | One column |

## 8. Escalations

### (a) Owner decisions to confirm at approval

1. **D12 open question: which ceremonies a contender's tooltip lists.** Recommendation: **list only the ceremonies where it scored for the player the pill belongs to** (your roster, Final rosters, By player). In the contender-level view (All scoring contenders), the row is not one player's, so it lists every ceremony where it scored, each line naming the player. The rule underneath: a tooltip's total always equals the figure on its pill, so the screen always adds up. Listing every ceremony on a per-player pill would show points that are not in that player's total.
2. **Default view on ceremony points.** Recommendation: By player. It is the current page's reading, ranks come first, and it matches the board's switch order. By category is one click away and kept in the URL.
3. **"From queue" leaves the board** (D5 spirit). Recommendation: drop it everywhere except the draft history, where the drafted chip in the nominee card reads "1-3 · from queue". Alternative: keep a tag on the board.
4. **Gold in season views** (4.2). Recommendation: gold means "won, in this view's scope", and never appears in the draft room, logs or claims.
5. **Categories without an icon** (owner rule 4.1: the category is never omitted). The icon is copied from the category template when an admin adds the category (migration 023), so a template without an icon gives a season category without one, and nothing lets an admin change a season category's icon afterwards. Recommendation: a neutral fallback glyph in the pill, plus an icon picker on the admin Circuit category row (one small write endpoint, reusing the template icon list), with the Circuit's readiness list flagging categories that have no icon. Categories never share an icon (owner, 2026-11-24): the picker refuses an icon already used by another category of the same Circuit (409), and readiness flags existing duplicates. This is the package's only API write. **Accepted by the owner, 2026-11-24, as were (a)1 to (a)4.**

### (b) Requests for Claude Design

None. There is no mockup, and every treatment reuses an existing ceremony component. If the owner later wants a richer Final results moment (a podium like the ceremony's tab), that is a design request, not part of this package.

### Suggestions for the owner, outside this package

- The waiver priority list could show chips as the neutral `StatusPill` family instead of helper text. Small, but it changes the waivers vocabulary, so it is left out here.
- The season page's seven header buttons could become a labelled "Season" menu on phones. That is navigation IA, so it is out of scope.

## 9. Build notes

### 9.1 Web: files and order

1. **Shared render pieces, no visual change.**
   - Move `NomineeTooltipCard`, `DraftCategoryIcon`, `nomineeTooltip.ts` and `useDraftPickConfirmToast` to a layer both features may import, per `docs/architecture/atomization.md` (for example `shared/nominee/`). Re-export from the old paths only if the rules allow; otherwise update imports.
   - Add the `pointsSection` prop and `.fo-tip-points` styles to the card.
   - Add `ContenderPill` (render only: icon, label, points, state classes, accessible name) and `SeasonRosterCard`.
   - CSS: `.fo-pillScope`, `.dr-pill.is-dropped`, `.dr-pill-caption`, `.fo-tip-points` in `styles.css` beside the pill rules. No raw colours (`pnpm run tokens:check`).
2. **Decisions (pure, unit-tested):**
   - `decisions/circuitAddDrop.ts` (target and processing).
   - Contender-to-tooltip mapping (ACTING maps to `PERFORMANCE`, FILM to `FILM`; hero film or person; poster from `film.poster_url`; profile from `person.profile_url`).
   - Points formatting (signed, two decimals).
   - Board rebuild without missed cells (supplementals take the original slot).
   - Ceremony points by category (group entries by category and kind).
   - Final results aggregation and the reconciliation sums.
   - Staging note wording per state.
3. **Draft room:** `CircuitDraftRailLists`, `CircuitStagingPanel` (gesture, menu, phone card), `CircuitDraftBoard`, `CircuitDraftPickPanel` (preview pill), `CircuitDraftScreen` glue (arming state, toast, clear-on-turn effect, announcement).
4. **Roster and free agency:** `CircuitRosterList`, `CircuitFreeAgentPanel`, `CircuitRosterScreen`; `orchestration/circuitRoster.ts` for the points read.
5. **Season page:** `CircuitLeagueScreen` (Add/drop, caption); it now reads the viewer's roster `free_agency` and the claims `locked` flag.
6. **Waivers and transactions:** `CircuitClaimList`, `CircuitClaimsSection`, `CircuitClaimModal`, `CircuitWaiverResults`, `CircuitPriorityList` (avatar), `CircuitTransactionList`.
7. **Points and results:** `CircuitScoreBreakdown` (two views), `CircuitScoreBreakdownScreen` (switch, URL state, "Points updated"), `CircuitStandingsScreen` (Final results), and a new `CircuitFinalResults` UI.
8. **Types:** `lib/types.ts`. Add `icon_code` and `icon_variant` to `CircuitLeagueCategory` (the API already returns them), plus the new read shapes below.

### 9.2 API: reads only (pure computation in `domain/`, IO in services and repositories, thin routes)

- **Roster read** (`GET /:id/roster`, `/members/:userId/roster`):
  - Each entry gains `points: { total, by_ceremony: [{ ceremony_id, ceremony_name, nomination, win }] }`, from the scoring ledger for (member, selection).
  - The roster gains `points_total` and `dropped_points` (ledger points for this member from selections not on the roster now).
- **Rosters read** (`GET /:id/rosters`, new): every member's roster in that shape, for Final rosters. One query, not N.
- **Ceremony breakdown** (`GET /:id/standings/ceremonies/:ceremonyId`): each entry gains `owned_now: boolean` (does this member own the selection today).
- **Season contenders** (`GET /:id/standings/contenders`, new): per selection, `total`, `members: [{ user_id, username, avatar_key, points }]` and `lines: [{ ceremony_id, ceremony_name, user_id, nomination, win }]`.
- **Selection owner:** the contender selection upsert response the picker already calls gains `owner: { user_id, username } | null`, for the picker preview's owned state. If that endpoint cannot carry it cleanly, the preview shows the default state and the server's existing "taken" error remains the guard. Record this in the PR.
- **Shared schemas:** add them in `packages/shared` where the web validates, and `docs/architecture/circuit.md` gains the reads.

### 9.3 Tests and visuals

- **Unit tests:** the decisions above; the reconciliation sums (roster pills plus dropped equals the member total; by-category and by-player totals equal the breakdown totals; all-contenders sum equals the leaderboard sum).
- **Integration tests:** ledger-backed reads for a seeded league with a drop between nomination and win (build acceptance).
- **E2E tests:** drafting from the queue by double-click, by Shift+Enter, and by the phone card; Add/drop going to free agency, to claims and in processing.
- **Visual:**
  - SCREENS rows: the new rows in section 7 join the sweep.
  - Seed: `tests/visual/support/seed.ts` needs a COMPLETE season with scores, a ceremony with winners and a dropped-since pick, and an in-window league whose claims are locked.
  - `assertions/pairs.json` regenerates. Allowlist: none expected; the pill's 22 px target is already allowlisted as `dr-pill`.
- **Tour:** update the steps for the removed Draft buttons, "Pick X" becoming the add icon, Add/drop, and the new views.

### 9.4 Risks

- **The `.dr-pill` styles assume the draft frame's variables.** Outside `.fo-pillScope`, pills lose ink. The sweep's contrast pairs catch it, and the builder must wrap every page list.
- **Room geometry assertions** (`room-rail-align`) now see icon pills in the season rails. The pill left edges must stay aligned: the meta column is unchanged.
- **Double-click versus the grip.** dnd-kit listeners must stay on the grip only (`useSortableNode` handle), never on the row.
- **Moving the tooltip card and confirm toast touches ceremony imports.** Ceremony pixels must not change, and the room's tolerance and assertion tiers prove it.
- **Points reads add ledger queries** per roster load. Compute in one grouped query per request.
- **Order of merges.** `season-status-lifecycle` (COMPLETE) and `waiver-results-and-claim-default` must be merged first (the build brief's `after`).

## 10. Marginal improvements

Each applies in every brand and mode.

| # | Current | Change | Benefit | Cells |
| --- | --- | --- | --- | --- |
| M1 | The staging row menu is a bare `expand_more` chevron (reads as "expand") with only a `title` | `more_horiz` icon, a visible "More actions" tooltip, `aria-label` with the contender | Correct affordance; tooltips on hover and focus | `circuit-draft-lobby`, `-room`, `-staging` |
| M2 | Drafting from a staging row needs knowing the double-click | A "Draft" item first in the row menu while on the clock | A discoverable, deliberate path for mouse and keyboard users | `circuit-draft-room`, `-armed` |
| M3 | Roster category headings are full section titles (display face, caps, divider), so the page shouts and scrolls (tour 068) | A compact 28 px heading row: icon, name, "n of max" meta in the label voice; no per-pick dividers | Denser and scannable; matches the room's category card | `circuit-roster-*` |
| M4 | The free agency drop select defaults to "Don't drop anyone" even with a full roster (the D3 problem in a second place) | Placeholder "Select a pick to drop" when full; "Don't drop anyone" as an explicit first option | Same behaviour as the claim modal; no failed adds | `circuit-roster-own` |
| M5 | Waiver result outcomes sit at the far right, about 1100 px from the name (tour 089) | Outcome beside the username on line 1 | Read in one glance | `circuit-waivers`, `-window` |
| M6 | Usernames in standings, priority, results and points appear without the avatar the room shows everywhere | `AvatarToken` (sm) before the username where the read carries `avatar_key` (standings, breakdowns, contenders; priority and results via the league's members) | Consistent identity cue across the season | standings, points, waivers cells |
| M7 | Claim rows on a phone squeeze long labels beside four icon buttons (inventory 4.2) | Phone: one ⋯ menu (44 px) with Move up, Move down, Edit claim, Withdraw; tapping the pill edits | Readable labels, fewer tiny targets | `circuit-waivers-window` (phone) |
| M8 | The claim list's icon buttons have `aria-label` but no visible tooltip | Visible tooltips with the same words | Mouse users learn the icons | `circuit-waivers-window` |
| M9 | Ceremony points reorder silently on a live refresh (inventory 6.6) | A 4 s polite "Points updated" status under the switch | Readers know why rows moved | `circuit-points-*` |
| M10 | A drafted contender silently disarms in the room (inventory 6.6) | A polite announcement "Selection cleared: X is no longer available" | Screen-reader and keyboard users know why | `circuit-draft-armed` |
