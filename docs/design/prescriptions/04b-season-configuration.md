# 04b Season configuration

Package: `series-04b-season-choice`. Players should see a full awards season as one kind of season among others: Create season offers a choice of kind, the full-season settings are a short screen with a summary for each area and a modal behind each one, and the league page lists both kinds in one list. There are no mockups. The intent comes from the owner (2026-11-17) and the app's existing design language. Nothing here adds a token, a slot or a new visual treatment.

Brand letters as in earlier prescriptions: A refined-gold, B red-carpet, C ballot, D noir, E festival, F technicolor, G lightbox. "Ink" is `--brand-text`. Paths are relative to `apps/web/src` unless they start with `apps/`, `packages/`, `docs/` or `tests/`.

Vocabulary (ADR 0006): code and admin say Circuit. Player copy says "season" for both kinds, "awards season" for the Circuit itself (for example "2026–27 Awards Season", its admin-given name), and names an event only by its admin-given name. No string in this prescription contains "circuit".

## 1. Scope

**In scope**

- League page (`/leagues/:leagueId/:leagueSlug`), Seasons section only: one list for both kinds, a kind label on each card, the order of the list, and the Create season button. The startable cards go.
- Create season (`/leagues/:leagueId/:leagueSlug/seasons/new`): the kind choice, the single-ceremony form under it (visual alignment only, 5.4), and the full awards season form (5.3).
- The four settings modals: Events, Scoring, Roster, Draft (5.5 to 5.9), in edit, apply-locally and read-only modes.
- The full season's page (today `CircuitLeagueScreen`, moving to `/leagues/:leagueId/:leagueSlug/seasons/full/:id`): the settings card is replaced by the same summary rows and modals. Edited in setup, partly frozen after the season is locked, read-only after the draft starts and for players (5.10).
- Every brand (A to G) and mode, at 1280 and 390 (768 follows the desktop rules), keyboard only included.

**Not changed**

- The single-ceremony form's fields, defaults, validation and request (`LeagueSeasonCreateScreen` stays functionally as is).
- The full season page's header, membership bar, Members section and Lock season control; roster and transactions screens; Home; `/seasons`; admin Circuit screens.
- Single-ceremony season dashboard and its modals (`SeasonDraftSettingsModal`, `SeasonCategoryWeightsModal`).
- Tokens, brand definitions and the contract in `docs/architecture/brands.md`.
- Draft type: snake is the only draft; auction is not offered (ADR 0005 section 6).

## 2. Intent

The package expresses one idea: **a full awards season is just another season**. A commissioner picks a kind of season in plain words, and if they want the defaults they press Create once. The detail is still there for those who want it, in a modal sized for it, so a long, flat form does not set every decision at the same level.

Visually it should look like it was always part of the app. It uses the same cards, rows, buttons, switches, number inputs and modal frame as the rest of the app in every brand. Brand character comes only from the existing slots (surfaces, ink, rules, radii, button shape, shadows, label treatment).

## 3. Kind names and descriptions

| Kind | Name (radio label, card label) | Description (one line under the radio) |
| -- | -- | -- |
| Ceremony season | **Single ceremony** | Draft from one awards night's nominees, like the Oscars, and score when your picks win. |
| Circuit | **Full awards season** | Draft once and score across the whole awards season, from the first nominations to the final ceremony. Add and drop contenders along the way. |

The names are the brief's. I changed both descriptions, for these reasons:

- Single ceremony: the brief's "Score on that night's nominations and winners" is wrong. A ceremony season scores only wins (`apps/api/src/domain/scoring.ts`: standard is a point per winning pick, negative is plus or minus), and its nominations are already known when the draft runs.
- Full awards season: "score across" says what makes it different, scoring at every event, nominations and wins alike. "To the final ceremony" stays true for an admin-defined Circuit whose last event is not the Oscars. "Add and drop contenders" is kept, because "contender" is already the player word (roster screen, `ContenderPicker`).

The owner may adjust the wording before the build (escalation A1).

## 4. Token values

This package adds and changes no slot or value. Every brand keeps its 02, 03 and 06 values. The table gives the pairs that the new surfaces use, computed from the brand files at `origin/main` (WCAG 2.x relative luminance). Cards and modals both paint `--brand-raised` (`--panel` = `--brand-raised`; `.mantine-Modal-content` is `--brand-raised`), and inputs paint `--brand-sunken`.

| Brand, mode | Ink on raised (summary line 1, labels) | Muted on raised (summary line 2, helper, reasons) | Ink on sunken (input values) | Muted on sunken (placeholder "None") | Rule-strong on raised (radio ring, input edge; 3:1) | Page on ink (checked radio dot; 3:1) | On-primary on primary (Create) |
| -- | -- | -- | -- | -- | -- | -- | -- |
| A light | 17.37 | 6.03 | 15.01 | 5.21 | 3.59 | 16.38 | 8.26 |
| A dark | 15.01 | 6.63 | 13.52 | 5.97 | 3.42 | 16.31 | 10.87 |
| B light | 18.00 | 6.43 | 14.40 | 5.14 | 3.86 | 15.95 | 8.76 |
| B dark | 15.90 | 8.02 | 14.63 | 7.38 | 3.35 | 16.90 | 10.61 |
| C light | 16.51 | 6.99 | 13.96 | 5.91 | 3.69 | 15.41 | 15.41 |
| C dark | 13.97 | 6.23 | 12.90 | 5.75 | 3.37 | 15.04 | 15.04 |
| D light | 18.88 | 6.90 | 15.55 | 5.68 | 3.84 | 17.17 | 17.17 |
| D dark | 16.16 | 7.17 | 14.55 | 6.46 | 3.45 | 17.58 | 17.58 |
| E light | 17.67 | 5.95 | 16.17 | 5.45 | 3.33 | 19.30 | 6.44 |
| E dark | 16.28 | 7.19 | 14.60 | 6.45 | 3.43 | 17.67 | 6.44 |
| F light | 16.45 | 6.85 | 14.03 | 5.84 | 3.59 | 15.59 | 5.19 |
| F dark | 15.00 | 8.72 | 12.89 | 7.49 | 4.47 | 16.42 | 5.19 |
| G light | 18.42 | 7.25 | 14.56 | 5.73 | 3.97 | 15.68 | 18.42 |
| G dark | 14.30 | 6.66 | 13.00 | 6.05 | 3.38 | 15.48 | 15.48 |

Every pair passes (text 4.5:1, non-text 3:1). One finding drives a rule. **`--brand-primary` on `--brand-raised` is below 3:1 in A light (2.10), B light (2.10) and E dark (2.76), and F dark is exactly 3.00.** So no selected or checked state in this package may rest on a primary-coloured edge or fill. The radio skin (5.2) uses ink, like the existing Switch skin. Mantine's default radio would paint primary.

Error text and the warning Alert are the existing app-wide treatments (Mantine red, the 03 Alert with glyph and inline-start border), already covered by the axe tier.

## 5. Component rules

### 5.1 Shared building blocks

| Block | Rule |
| -- | -- |
| Page frame | `baseline-page` > `baseline-pageInner` > `Stack gap="md"`, header `Group` (hero title, body subtitle, secondary "Back to league" at the end, wraps), as both screens do today. |
| Card | `StandardCard`, inner `Stack gap="sm"`. Section headings inside a card are `Title order={3} variant="section"`; fieldset legends use the same title (the existing `.fieldset` reset from `CircuitLeagueSettingsForm.module.css`). |
| Settings row ("summary row") | One `li` per area in a `ul.fo-listReset`, separated by `Divider`. The row is a `Group justify="space-between" align="flex-start" wrap="nowrap" gap="md" py="sm"`. On the left is a `Box` with `miw="var(--fo-space-0)"` and `flex: 1`: the area name (`Text className="baseline-textBody" fw={600}`), summary line 1 (`Text className="baseline-textBody baseline-wrapAnywhere"`) and optional summary line 2 (`Text variant="meta" className="baseline-wrapAnywhere"`). On the right is a `Button variant="secondary"` with `flex: none`, label "Edit" or "View", and its accessible name completed with `VisuallyHidden` ("Edit<VisuallyHidden> events</VisuallyHidden>"), so the visible label begins the name (WCAG 2.5.3). Phone keeps the same row: the button stays on the right and the text wraps beside it. No lineClamp: summaries are capped in copy (5.11), not by CSS. |
| Read-only row | The existing `ReadOnlyRows` (`dl`, label left, value right, ruled rows), moved out of `CircuitLeagueSettingsForm.tsx` into the new settings folder unchanged. |
| Status line | A one-line `Text variant="meta" role="status"` at the end of a card's heading row, with its height reserved so nothing moves (the Appearance pattern, inventory 3.3). It reads "Events updated." (create) or "Scoring saved." (edit) for 3 s after a modal applies or saves, otherwise it is empty. |
| Buttons | Semantic variants only in everything this package touches: `primary` (Create season, Done, Save), `secondary` (Edit, View, Back to league, Reset, Close), `ghost` (Cancel, Reset to defaults). `filled` and `outline` become `primary` and `secondary`, which renders the same pixels (`ui/Button.tsx` maps them to the same skin). |

### 5.2 Radio skin (new rule, existing tokens)

Radio has no skin today. Add one to `styles.css` beside the Switch skin, mirroring it:

- Unchecked: fill `--brand-sunken`, `--fo-border-width` ring in `--brand-rule-strong`.
- Checked: fill and ring `--brand-text`, inner dot `--brand-page` (Mantine `--radio-icon-color`).
- Focus-visible: `outline: var(--fo-focus-ring-width) solid var(--brand-focus-ring)`, offset `--fo-focus-ring-offset`.
- Disabled: the control at `--fo-alpha-50`. Its label and description keep **full-strength** `--brand-muted` (not faded) and the cursor is `not-allowed`, the Appearance floor-option precedent: a faded label would drop below 4.5:1, and the reason must stay readable.
- Label: body size, weight 600, ink. Description: `--fo-font-size-sm`, `--brand-muted`, `margin-top: var(--fo-space-dense-2)`.

The admin duplicates screen (`AdminFilmDuplicatesScreen`) also uses Radio and picks up the same skin. That is intended.

### 5.3 Create season page

Header: title "Create season", subtitle "Create a new season for {league name}." and "Back to league", all unchanged.

**Card 1, kind of season.** A `Radio.Group` rendered as a `fieldset`, legend "Kind of season", with two `Radio` items in this order: Single ceremony, then Full awards season. Each has the name as its label and the 3. description, in a `Stack gap="sm"`. The whole label and description area is the click target, at least 44 px tall at 390.

| Availability | Rule (pure decision, `decisions/seasonKinds.ts`) | What the option shows |
| -- | -- | -- |
| Single ceremony available | `/ceremonies/published` returns at least one ceremony (today's rule, unchanged) | Enabled, 3. description |
| Single ceremony unavailable | None returned | Disabled; the description is replaced by "No ceremonies are open for leagues right now." |
| Full available | At least one public Circuit with status `ACTIVE` has no competition in this league (today's `startableCircuits`) | Enabled, 3. description |
| Full unavailable, none open | No `ACTIVE` Circuit | Disabled; "No full awards season is open right now." |
| Full unavailable, all taken | Every `ACTIVE` Circuit already runs in this league | Disabled; with one: "This league already plays {name}."; with several: "This league already plays every open awards season." |
| Full unknown | The Circuit list failed to load | Disabled; "Couldn't check for open awards seasons." followed by a ghost "Try again" button that refetches |

- **Selection.** When both kinds are available, neither is preselected. Below card 1 the page shows nothing else until one is chosen. When exactly one is available, it is preselected. The choice is mirrored in `?kind=ceremony|full` (router `replace`, so no history entries), so reload and Back keep it. A `kind` value that is unknown or unavailable is ignored.
- **One unavailable.** The fieldset gets `aria-describedby` pointing at the disabled option's reason, so a screen reader hears it on entering the group (disabled radios are skipped by arrow keys).
- **Neither available.** Both are disabled with their reasons, and a meta line under the group reads "Check back when the next ceremony or awards season opens." There is no card 2.
- **Keyboard.** Tab enters the group on the checked radio, or the first enabled one. The arrow keys move and select (native). Choosing a kind reveals card 2 directly after the group in DOM order, so the next Tab goes into it. Focus never moves on its own.
- Switching kind keeps each kind's unsaved values in memory while the page is open.

**Card 2, full awards season** (when Full is chosen). From top to bottom:

1. **Awards season.** With one open Circuit, a single read-only row: "Awards season" and its name. With several, a `Select` labelled "Awards season" listing their names in API order (newest first), defaulting to the first. Names wrap in the static row, and in the Select they end in an ellipsis with the full name in the option list. If a change discards event or category edits (5.11), a meta `role="status"` line under the Select reads "Event and category settings are back to their defaults for this awards season."
2. `Divider`.
3. A heading row: "Settings" (section title), then the status line (5.1) at the end.
4. Helper (`Text variant="helper"`): "The defaults suit most leagues. You can change these until you lock the season."
5. Four summary rows in this order: **Events, Scoring, Roster, Draft**. That is the order of the decisions: what counts, how it scores, what each player holds, how the draft runs. All rows read "Edit". Copy in 5.11.
6. Actions: a `Group` that wraps, aligned to the start, holding `primary` "Create season" (label "Creating..." while working) and `secondary` "Reset". Reset sets the awards season back to the default and every area back to its defaults, with no confirmation, the same as the single form.
7. `FormStatus` for the create request.

The card is a `form`. "Create season" is `type="submit"`, so Enter in the Select submits. The modals render as siblings of the form, not inside it (5.5).

- **Loading the Circuit's events and categories** (`/circuits/:id` or `/:id/events` plus `/:id/categories`): the Events, Scoring and Roster rows show two `Skeleton` lines (60 % and 40 % width) in place of their summaries, and their Edit buttons are disabled. Draft needs no data. Create stays enabled, because the defaults are server-side.
- **That load fails:** `FormStatus` error above the rows, "Couldn't load this awards season's events and categories.", with a ghost "Try again". The three dependent rows read "Not loaded" with Edit disabled. Create stays enabled.
- **Create.** One request. The commissioner's modal values go with `circuit_id` in the same POST, so the season is created in one step; the brief allows extending the start route. On success: the toast "Season created" (the single form's), the league and season queries invalidated, and navigation to the new season's page. On error: `FormStatus` with the server message (for example "This league already plays this season").

**Card 2, single ceremony** (when Single is chosen): today's card, with the alignments in 5.4.

**Loading the page:** today's skeleton, with one extra card skeleton at the top: a 20 % title line and two 44 px rows. Forbidden and error states are unchanged.

### 5.4 Single-ceremony form: what changes visually

Only these four things change. Fields, labels, options, defaults and request stay the same.

1. It renders as card 2 under the kind card (new position).
2. The pick timer: "Seconds per pick" sits directly under the "Pick timer" switch, aligned to the start, `maw="var(--fo-layout-fieldBasis-sm)"`, in a `Stack gap="xs"`. Today a `Group justify="space-between"` pushes it to the far edge of the card, away from the switch that controls it (M4). This matches the Draft modal (5.9).
3. Button variants become semantic (`filled` to `primary`, `outline` to `secondary`): no pixel change.
4. The card becomes a `form` with "Create season" as `type="submit"` (M6). Reset stays `type="button"`.

The "No ceremonies are open for leagues yet." line stays in the code, but the kind choice now catches that case first.

### 5.5 Settings modal frame (shared by the four modals)

A wrapper component (`SettingsModal`) around the existing `Modal` from `@ui`, inheriting the theme defaults (close label "Close dialog", overlay opacity, raised fill, `--brand-shadow-overlay`, 44 px buttons, inputs and close button below 500).

| Property | Desktop and 768 | Phone (below 500, `FO_BP_MOBILE_MAX_PX`) |
| -- | -- | -- |
| Size | Events, Scoring, Roster: `size="lg"` (620 px). Draft: `size="md"` (440 px, Mantine's default) | `fullScreen`, `radius={0}`, fade transition (the reduced-motion clamp already applies) |
| Position | `centered`; content capped at the viewport height minus Mantine's offsets; the body scrolls | Fills the viewport; the body scrolls |
| Header | Title is the area name ("Events", "Scoring", "Roster", "Draft"), with the close button. Mantine's header is sticky | Same; close button 44 px |
| Footer | **Sticky** to the bottom of the dialog: full dialog width, `--brand-raised` fill, a hairline `--brand-rule` top border, `--fo-space-sm` vertical padding. The list scrolls under it | Same, plus `padding-bottom: max(var(--fo-space-sm), env(safe-area-inset-bottom))` |

The media query uses `useMediaQuery` from `@ui/hooks` with `getInitialValueInEffect: false`, so a phone never flashes the centred layout.

**Body**, from top to bottom: helper text (`Text variant="helper"`), any top fields, then a section heading with a right-aligned meta count, a column header row, and the list.

- **List rows:** a `ul.fo-listReset` with a `Divider` between rows. Each row is a `Group justify="space-between" align="center" wrap="nowrap" gap="md" py="xs"`: the name on the left (`baseline-textBody baseline-wrapAnywhere`, with `miw` 0 and `flex: 1`), the number input on the right (the existing `.numberCell`, 7rem).
- **Column header row:** `Text variant="meta"`, the column name over the inputs ("Weight" or "Limit"), with `aria-hidden="true"`. It replaces today's visible "Weight" and "Limit" label on every row (M7). Each input keeps an `aria-label` of "{name} weight" or "{name} limit".
- **Number inputs:** `hideControls` (the steppers are 22 px), `inputMode="decimal"` for weights, `inputMode="numeric"` for whole numbers.

**Footer:** a `Group justify="space-between" wrap="wrap" gap="sm"`. It holds an optional status line (`FormStatus`, `role="alert"`, full width, first) for save errors, then ghost "Reset to defaults" on the left, then a right-aligned group of ghost "Cancel" and primary "Done" (create) or "Save" (edit). In read-only mode the footer has a single secondary "Close", aligned to the end.

**Modes:**

| Mode | Where | Primary button | On primary |
| -- | -- | -- | -- |
| Apply locally | Create page | "Done": always enabled | Validate. If valid, copy the values into the page state and close; the summary and status line update. Nothing is sent. |
| Save | Season page, area editable | "Save": disabled until a value differs from the saved one | Validate. If valid, send the area's writes (5.10). While sending, the label is "Saving...", the buttons are disabled and the inputs are `readOnly`, not `disabled` (disabling the focused control would drop focus). On success, close and update the summary from the response. On failure, stay open with the error in the footer and focus back on Save. |
| Read-only | Season page, area frozen, or viewer not a commissioner | "Close" only | Close |

**Shared behaviour:**

- **Reset to defaults** puts this area's fields back to their defaults (5.11) inside the modal. Nothing is saved until Done or Save. It stays enabled always, because disabling it once it is pressed would drop focus. A visually hidden polite live region says "Defaults restored."
- **Closing with unsaved changes.** Cancel, Escape, the close button and an overlay click all go through one guarded close. With no changes it closes. With changes it opens the existing `confirm` dialog: title "Discard changes?", message "Your changes to {area} haven't been {applied|saved}.", buttons "Keep editing" and "Discard". Keep editing returns focus inside the settings modal.
- **Validation.** A field validates on blur, and every field validates on Done or Save. An invalid top-level field shows Mantine's `error` under it. An invalid **list** input gets `error` (red edge, `aria-invalid`), and its message renders full width under the row (`Text` in the error colour, `--fo-font-size-sm`), linked by `aria-describedby`, because a 7rem column cannot hold the message. On Done or Save with errors, nothing closes and focus moves to the first invalid field.
- **Enter.** The body is a `form` whose submit is Done or Save, so Enter in any input applies. Because the modal is in a portal, its React submit event would bubble to an ancestor form, so render the modals outside the page form and also call `stopPropagation` in the modal's submit handler.
- **Focus.** On open, `data-autofocus` goes on the first field: the first event's switch, Points per nomination, Roster size, or the Pick timer switch. In read-only mode focus lands on the close button (Mantine's default). On close, focus returns to the row's Edit or View button (Mantine `returnFocus`). Tab order: close, top fields, list rows (for each event: switch, then weight), then Reset to defaults, Cancel, Done or Save.

### 5.6 Events modal (`lg`)

- Helper: "Choose which events count. A weight multiplies every point an event awards: 2 doubles it, 0.5 halves it."
- Section heading "Events" with the meta "{k} of {n} on" on the right, updated live. Column header "Weight".
- One row per event in admin order (`sort_index`). On the left, a `Switch` labelled with the event's admin name. A grouped event gets its ceremonies as the switch description (`circuitLeagueEventDescription`, comma-separated, wrapping in full). On the right, the weight input. When an event is off, its weight input is `disabled` and keeps its value.
- **Zero on:** a warning `Alert` (existing, with glyph) above the list: "No events are on, so nothing will score." It does not block Done or Save, because the API allows it.
- **Validation:** weight greater than 0 and at most 100, decimals allowed. Message: "Enter a weight above 0, up to 100."
- **Defaults:** every event on, weight 1.
- **Extremes:** with 1 event there is one row. With 15 events the body scrolls and the footer stays visible. Long names ("Producers, Directors, Writers and Actors Guild Awards") wrap beside the weight. A group of 6 ceremonies has a three-line description.
- **No events:** the Edit button is disabled and the summary explains why (5.11). If the modal is reached anyway, it shows `EmptyState` "This awards season has no events yet."

### 5.7 Scoring modal (`lg`)

- Helper: "Picks score when they're nominated or win at an event that counts. Points are multiplied by the event's weight and the category's weight."
- **Points:** `SimpleGrid cols={2} spacing="sm"`, two columns at 390 as well. "Points per nomination" and "Points per win", each whole numbers 0 to 100. Points per win has the description "On top of the nomination points." Messages are the schema's: "Nomination points must be between 0 and 100" and "Win points must be between 0 and 100".
- **Both 0:** a warning `Alert` above the categories: "With no points for nominations or wins, nothing will score." It does not block.
- **Category weights:** section heading "Category weights", with the meta "Every category counts equally" or "{k} weighted" on the right. Column header "Weight". One row per category in admin order. Same validation and message as event weights.
- **Defaults:** 1, 2, every category weight 1.
- **Extremes:** 30 categories scroll under the sticky footer. "Best International Feature Film" wraps at 390.

### 5.8 Roster modal (`lg`)

- Helper: "How many contenders each player holds. The draft has one round per roster spot."
- "Roster size", a whole number from 1 to 64, `maw="var(--fo-layout-fieldBasis-sm)"`, description "From 1 to 64." Message: the schema's "Roster size must be between 1 and 64".
- **Category limits:** section heading "Category limits", with the meta "No limits" or "{k} limited" on the right. A helper under it: "The most contenders one player may hold in a category. Leave it empty for no limit." Column header "Limit". Inputs have the placeholder "None", whole numbers 1 to 64 or empty. Message: "Enter a whole number from 1 to 64, or leave it empty."
- **Limits that cannot fill a roster:** when every category has a limit and their sum is below the roster size, a warning `Alert` reads "These limits allow {sum} contenders, fewer than the roster size of {size}." It does not block.
- **Defaults:** 16, no limits.

### 5.9 Draft modal (`md`)

- A first line in body text: "Snake draft: the order reverses each round." It is plain text, not a control.
- "Pick timer" `Switch`, then "Seconds per pick" directly under it (`maw="var(--fo-layout-fieldBasis-sm)"`, `step={5}`), with the description "Up to 86,400 (one day)." It is disabled when the timer is off and keeps its value. Validation: a whole number from 1 to 86,400; message "Enter a whole number of seconds from 1 to 86,400."
- "Auto-draft" `Switch` with today's description: "When a player's clock runs out, pick the next contender from their queue."
- **Defaults:** timer on at 90 seconds, auto-draft on.
- This is the only modal that stays editable after the season is locked.

### 5.10 Full season page: settings card

This replaces `CircuitLeagueSettingsForm` in the left column of `baseline-grid2Wide`. The card has `aria-label="Season settings"`. From top to bottom:

1. A heading row: "Settings" (section title) and the status line.
2. A helper chosen by state, shown to commissioners only:

| Status (label) | Commissioner helper | Events, Scoring, Roster rows | Draft row |
| -- | -- | -- | -- |
| SETUP (Open) | "You can change these until you lock the season." | Edit | Edit |
| INITIALIZED (Pre-draft) | "The season is locked, so events, scoring and the roster are fixed. Draft settings can change until the draft starts." | View | Edit |
| DRAFTING, IN_SEASON, COMPLETE | "Settings are fixed now that the draft has started." | View | View |
| Any status, viewer not a commissioner | none | View | View |

3. The four summary rows (same component and copy as the create page).

There is no page-level Save or Reset: each modal saves its own area. Writes per modal, built from the latest saved detail:

- **Events:** `PUT /events` with the full enabled set.
- **Scoring:** a `PATCH /settings` for the points that changed, then a `PUT /categories` for the categories whose weight changed, **sending each one's saved `max_owned`**.
- **Roster:** a `PATCH /settings` for `roster_size`, then a `PUT /categories` for the categories whose limit changed, **sending each one's saved weight**.
- **Draft:** a `PATCH /settings` for `pick_timer_seconds` (null when off) and `auto_draft_enabled`.

If the second write of a pair fails, the modal stays open with "Some changes weren't saved: {message}", reloads the detail into its fields, and Save re-enables.

A 409 because the season was locked meanwhile (`CIRCUIT_LEAGUE_SETTINGS_LOCKED`, `CIRCUIT_LEAGUE_LOCKED`) shows the server message, refreshes the page detail and turns the modal read-only. The skeleton (`CircuitLeagueSkeleton`) and error states are unchanged.

Read-only modals use `ReadOnlyRows`:

- **Events:** name, with the grouped ceremonies as detail, and the value "On · weight 1.5" or "Off".
- **Scoring:** "Points per nomination" and "Points per win", then one row per category, value "Weight 2".
- **Roster:** "Roster size", then one row per category, value "Limit 2" or "No limit".
- **Draft:** "Draft: Snake", "Pick timer: 90 seconds" or "Off", "Auto-draft: On" or "Off".

### 5.11 Summary copy (pure functions in `decisions/fullSeasonSummary.ts`, unit-tested)

Defaults: roster 16, 1 point per nomination, 2 per win, every event on at weight 1, every category weight 1, no limits, timer 90 s, auto-draft on (`CIRCUIT_LEAGUE_DEFAULTS`). Lists follow admin order. Weights print as typed, after a multiplication sign ("×2", "×1.5", "×0.25"). Names join with ", ", the last item joins with " and ", and there is no Oxford comma.

**Events** (n events in the awards season, k on, w of those on with weight other than 1):

| Case | Line 1 | Line 2 (meta) |
| -- | -- | -- |
| Default, n = 6 | All 6 events count equally. | Guild Awards, Golden Globes, Critics' Choice, BAFTA, Independent Spirit, Oscars |
| Some off | 4 of 6 events count equally. | Guild Awards, BAFTA, Independent Spirit, Oscars |
| Weighted | All 6 events count; 2 weighted differently. | Guild Awards, Golden Globes, Critics' Choice, BAFTA ×1.5, Independent Spirit, Oscars ×3 |
| Many (15, all weighted) | All 15 events count; 15 weighted differently. | the first 6 events that are on, with weights, then " and 9 more" |
| n = 1 | 1 event counts. | Oscars (or "Oscars ×2") |
| k = 0 | No events count, so nothing will score. | (none) |
| n = 0 | This awards season has no events yet. | (none; Edit disabled, `aria-describedby` the summary) |

Line 2 lists only the events that are on, at most 6, then "and {m} more".

**Scoring:**

| Case | Line 1 | Line 2 (meta) |
| -- | -- | -- |
| Default | 1 point per nomination, 2 per win. | Every category counts equally. |
| Nominations 0 | No points for nominations, 2 per win. | as below |
| Wins 0 | 1 point per nomination, none for wins. | |
| Both 0 | No points for nominations or wins. | |
| 1 to 3 categories weighted | | Weighted: Best Picture ×2, Best Director ×1.5. |
| More than 3 (every weight changed, 24) | | Weighted: Best Picture ×2, Best Director ×2, Best Actor ×1.5 and 21 more. |
| No categories | | This awards season has no categories yet. |

"point" is singular only for 1 ("1 point per nomination", "3 points per nomination"; the win clause never repeats the unit).

**Roster:**

| Case | Line 1 | Line 2 (meta) |
| -- | -- | -- |
| Default | 16 contenders per player. | No category limits. |
| Size 1 | 1 contender per player. | |
| 1 to 3 limited | | Limits: Best Picture 2, Best Actor 3. |
| More than 3 | | Limits: Best Picture 2, Best Actor 3, Best Actress 3 and 4 more. |
| Limits cannot fill | | the limits line, then " Limits allow only 12." |
| No categories | | This awards season has no categories yet. |

**Draft:**

| Case | Line 1 | Line 2 (meta) |
| -- | -- | -- |
| Default | Snake draft, 90 seconds per pick. | Auto-draft on. |
| Timer off | Snake draft, no pick timer. | Auto-draft on. / Auto-draft off. |
| Durations | 1 second; 45 seconds; 2 minutes (120); 1 hour (3600); 1 day (86400); 90 minutes (5400) | |

A duration uses the largest unit that divides it exactly: days, then hours, then minutes (60 or more), then seconds.

**Changing the awards season on the create page** resets the event and category values only. Roster size, points and draft settings are kept.

### 5.12 League page Seasons list

- **One list** (`ul.fo-listReset`, `Stack gap="sm"`) of `StandardCard interactive` links, one card style for both kinds. Each card: the title (`baseline-textCardTitle baseline-wrapAnywhere`; the ceremony label, or the awards season's name), the kind label as `Text variant="meta"`, and the `StatusPill` on the right (today's construction).
  - Single ceremony: meta "Single ceremony".
  - Full awards season: meta "Full awards season · {n} member(s)". The member count stays: anyone may join while it is Open.
  - Cancelled single seasons stay non-links, as today.
- **Order** (pure, `decisions/seasonList.ts`, unit-tested):
  1. By status rank: 0 for Drafting and Paused (live now); 1 for In progress and Draft complete; 2 for Pre-draft and Open; 3 for Complete and Closed.
  2. Within a rank, by `created_at`, newest first.
  3. Then by kind (full before single) and id, descending, for stability.
- **No startable cards**, no "Not started in this league yet", no Start button, and no `FormStatus` for starting.
- **Empty:** `EmptyState` "No seasons yet." For a commissioner, the helper under the heading row reads "Create one for a single ceremony or the full awards season." Players see only the empty state.
- **Create season:** a primary button at the end of the heading row, shown **only to commissioners**. Players no longer see a disabled button with "Commissioner permission required." (M2).
- **Phone:** the cards stack, the title wraps above the pill (`Group wrap="wrap"`, as today), and the meta wraps.

### 5.13 Keyboard-only paths (for functional QA)

- **Create with the defaults:** Tab to Create season on the league page, Enter. Tab into the kind group, arrow to Full awards season. Tab past the Select (Enter would submit) to Create season, Enter.
- **Edit one area:** Tab to "Edit scoring", Enter. Focus is on Points per nomination; type a value. Enter applies. Focus returns to "Edit scoring" and the status says "Scoring updated."
- **Discard:** Escape with changes opens "Discard changes?"; Enter on Keep editing returns to the modal; Discard closes it and returns focus to the Edit button.

## 6. Deviations

There is no mockup. These are the deviations from the brief's background and acceptance wording.

| # | Brief says | This prescription | Reason | Claude Design? |
| -- | -- | -- | -- | -- |
| D1 | Acceptance: "a collapsed scoring summary that expands to events and categories" | Four summary rows, each opening a modal. Events are their own area; category weights sit in Scoring and category limits in Roster | The owner's standing preference (modals, not long forms) and the real content. Events are on/off plus a weight, which is a different decision from points. Category weights and limits are two different decisions (score versus hold) over the same list, and each modal stays one list long | No. The orchestrator should change the acceptance line to "summaries that open modals" (escalation C1) |
| D2 | Single ceremony description: "Score on that night's nominations and winners" | "…and score when your picks win." | A ceremony season scores wins only | No |
| D3 | "Basics up front" | The only basic is the awards season. Roster size, timer and points sit in their areas | Each has a working default, and a lone roster-size field on the page would split the Roster area | No |
| D4 | "Same structure edits settings in setup" | Same rows and modals, but edit modals save per area right away. There is no page-level Save | One commit per decision matches modal semantics, and avoids a dirty page state hidden behind closed modals | No |

## 7. Acceptance per screenshot

Every cell holds in every brand (A to G), in light and dark, at 1280 and 390, unless it says otherwise. 768 must look like 1280 with tighter wrapping. Across all cells:

- no horizontal scroll;
- no text clipped except the Select value's ellipsis;
- targets at least 44 px at 390 (the Radio input may need the same allowlist reason as `Checkbox-input`: the label is the target);
- axe passes at desktop;
- no "circuit" anywhere on screen or in a URL.

| Cell (suggested id) | Persona and data | The reviewer should see |
| -- | -- | -- |
| `league-detail` | avery (commissioner), main league | One Seasons list: the ceremony seasons and "Awards Season 2035" in the same card style, each with a kind meta line ("Single ceremony" / "Full awards season · 4 members"), ordered as in 5.12; no card with a Start button; the primary Create season at the end of the heading row |
| `league-detail-member` (new) | casey, main league | The same list; no Create season button and no permission note |
| `season-create-choice` (new) | avery, a league with an open awards season and open ceremonies | Card 1 "Kind of season", two enabled radios with name and description, neither checked; nothing below; skinned radios (sunken fill, rule-strong ring) |
| `season-create-full-unavailable` (new) | avery, main league (already plays the only awards season) | Single ceremony preselected; Full awards season disabled, its control faded, the label and "This league already plays Awards Season 2035." in full-strength muted ink; card 2 is the single form |
| `season-create-ceremony` (new) | avery, Single ceremony chosen | Today's fields in today's order; "Seconds per pick" directly under the Pick timer switch at field-basis width; Create season (primary) and Reset (secondary) at the start |
| `season-create-full` (new) | avery, a league without a full season, one open awards season | A static "Awards season" row, Divider, "Settings" heading, helper, four rows with the default summaries (5.11) and Edit buttons on the right; the actions row |
| `season-create-full-select` (new) | as above, with two open awards seasons | The "Awards season" Select, defaulted to the newest |
| `season-create-full-scoring-open` (new, desktop and phone) | Scoring modal open | Desktop: a centred 620 px dialog on the overlay, title "Scoring", helper, two point fields side by side, "Category weights" with the meta on the right, the "Weight" column header, rows of name and 7rem input, and a sticky footer (Reset to defaults left; Cancel and Done right) with a top hairline. Phone: full screen, no radius, the same structure, the footer above the safe area, every control 44 px |
| `season-create-full-events-open` (new, phone) | Events modal, a grouped event | The switch label wraps, the ceremonies show as the description, the weight stays on the right; the "{k} of {n} on" meta |
| `season-create-full-roster-error` (functional, not a baseline) | Limit 0 typed, Done pressed | The input's red edge; a full-width message under the row; focus in that input; the modal still open |
| `full-season-setup` (renamed from `circuit-league-setup`) | avery, main league, Open | The header, membership bar and Members unchanged; the Settings card with its helper and four rows reading Edit; no Save or Reset at the bottom |
| `full-season-member` (renamed from `circuit-league-member`) | casey | The same card with no helper and four View buttons; a View modal shows read-only rows and a single Close |
| `full-season-locked` (component test or seed) | Pre-draft, commissioner | The locked helper; Events, Scoring and Roster read View; Draft reads Edit |

The seed needs a league where avery commissions and plays no full season, and a second `ACTIVE` Circuit for the Select cell (build notes).

## 8. Marginal improvements

All of these apply in every brand.

| # | Current | Change | Benefit | Cells |
| -- | -- | -- | -- | -- |
| M1 | Ceremony season card titles do not wrap anywhere; Circuit titles do | Both use `baseline-wrapAnywhere` | Long names never overflow on phone | `league-detail*` |
| M2 | Every member sees a disabled Create season button and "Commissioner permission required." | Shown only to commissioners | Players see no control they can never use | `league-detail-member` |
| M3 | Settings actions do not exist (long form) | "Edit" or "View" buttons with full accessible names ("Edit scoring") | Clear affordance; the name matches the visible label | all settings cells |
| M4 | On the single form, "Seconds per pick" sits at the far edge of the card from its switch | Directly under the switch, at field-basis width, on both forms | The control and its dependent field read as one | `season-create-ceremony`, Draft modal |
| M5 | Transitional `filled` and `outline` variants on the create form | Semantic `primary` and `secondary` | One vocabulary; no pixel change | create cells |
| M6 | Create forms submit only by clicking the button | `form` with a submit button; Enter applies in the modals too | Faster keyboard use | create cells, modals |
| M7 | Every weight and limit input repeats a visible "Weight" or "Limit" label | One column header; `aria-label` per input | Less noise; rows align | all list modals |
| M8 | Event weights allow 0 in the input, but the API rejects it | Inputs and messages say "above 0, up to 100" | Errors caught before saving | Events and Scoring modals |
| M9 | Lock copy: "Settings are locked." and "Events, roster and scoring are locked…" | The 5.10 helpers, using the same "lock" and "draft" words as the Lock season control | Says what is fixed and why | `full-season-*` |
| M10 | Save feedback is a `FormStatus` at the bottom of a long card | A reserved status line in the card heading ("Scoring saved.") | Visible and announced next to where the user is | settings cells |
| M11 | Category limits can silently make a roster impossible to fill | A non-blocking warning in the Roster modal and summary | Prevents a misconfigured draft | Roster modal |
| M12 | The Radio control is unskinned (Mantine primary) | The ink skin (5.2) | A checked state that passes 3:1 in every brand | kind choice, admin duplicates |

## 9. Escalations

**(a) Owner (taste), two questions**

- **A1. Kind wording.** "Single ceremony" and "Full awards season", with the 3. descriptions. Recommendation: approve as written. The single-ceremony description is a factual fix (D2).
- **A2. No preselected kind when both are available.** The alternative is to preselect Single ceremony, today's behaviour. Recommendation: no preselection. The kind is the most consequential choice on the page and should be made deliberately; it costs one click.

**(b) Claude Design:** none. The app's existing language covers every surface here.

**(c) For the orchestrator (not taste)**

- **C1.** Amend the brief's acceptance line, "a collapsed scoring summary that expands to events (by admin name) and categories", to "a settings summary per area (events by admin name, scoring, roster, draft) that opens a modal; the same component edits settings in setup".
- **C2.** The create step needs an API extension: optional initial settings, events and categories on `POST /leagues/:id/circuits`, applied in the same transaction. The brief already allows it.

## 10. Build notes

**Files likely touched**

- Web decisions:
  - `decisions/seasonKinds.ts` (availability and reasons);
  - `decisions/fullSeasonSummary.ts` (5.11);
  - `decisions/seasonList.ts` (order and kind labels);
  - `decisions/circuitLeague.ts` (`startableCircuits` is reused by availability; the form type is split per area, and `circuitLeagueChanges` per area).
  - Unit tests for each, including every row of the 5.11 tables.
- Web UI:
  - `features/leagues/ui/LeagueSeasonsSection.tsx` and `features/leagues/screens/LeagueDetailScreen.tsx`;
  - `features/seasons/screens/LeagueSeasonCreateScreen.tsx`, split into `SeasonKindChoice`, `CeremonySeasonForm` (today's card, moved) and `FullSeasonForm`;
  - a settings folder (code may say circuit), for example `features/circuitLeagues/ui/settings/`: `SettingsSummaryRows`, `SettingsModal`, `EventsModal`, `ScoringModal`, `RosterModal`, `DraftModal`, `ReadOnlyRows`, and the module CSS (`fieldset`, `numberCell`, `readList`, plus `stickyFooter`);
  - `CircuitLeagueSettingsForm.tsx` is retired;
  - `styles.css`: the Radio skin next to the Switch skin.
- Orchestration: `orchestration/seasons/leagueSeasonCreateOrchestration.ts` (kind, Circuit list, the Circuit's events and categories, full create), and `orchestration/circuitLeague` (per-area saves).
- API and shared:
  - `packages/shared/src/schemas/circuitLeague.ts`: `circuitLeagueCreateBody` gains optional `settings`, `events` and `categories`, reusing the existing pieces;
  - `apps/api/src/routes/leagues/circuitLeagues.ts`;
  - `services/circuit/circuitLeagues.ts` `createCircuitLeague`: apply them in the transaction, after `insertCircuitLeague`;
  - integration tests.
- Tests and visual:
  - `tests/visual/matrix.ts` (the cells in 7);
  - `tests/visual/support/seed.ts` (a league without a full season for avery, a second `ACTIVE` Circuit);
  - `tests/visual/assertions/allowlist.ts` (the Radio input, if flagged);
  - the "circuit" wording scan from the brief.

**Order**

1. Decisions and their tests.
2. Seasons list.
3. Radio skin and kind choice.
4. Modal frame, then the four modals in apply mode.
5. Full create, with the API extension.
6. The season page in save and read-only modes.
7. Visual cells and seed.

**Risks**

- Portal submit bubbling (5.5): render the modals outside the forms and stop propagation.
- The nested `confirm` over a settings modal: check that focus returns inside the settings modal after Keep editing.
- Non-atomic two-write saves (5.10): always send the other column's saved value in `PUT /categories`.
- `useMediaQuery` first render on phone: use `getInitialValueInEffect: false`.
- The Radio skin also changes the admin duplicates screen (intended).
- The seed currently gives the main league the only Circuit, so the full form needs new seed data before its cells can render.
