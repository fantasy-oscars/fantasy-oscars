# 04 Home layouts (seven brands, light and dark)

Package: the per-brand composition of Home (`/`), the hero card (composition, display type, surface, ornament), the dark-mode hero fix, and the Home findings from the inventory (section 1.1). Built in two sessions: **brands A–D first** (step 0 shared mechanism with refined-gold's final values, step 0b carried items outside Home, then steps B, C, D), **then E–G** (steps E, F, G). Builder: implement this file, not the mockups. Section 8 is written so each step can be handed to a fresh builder.

Brand letters: A refined-gold, B red-carpet, C ballot, D noir, E festival, F technicolor, G lightbox. "Panel", "open", "column" and "masthead" are the variant names defined in 3.1. Contrast was computed by script from the token values on main (`apps/web/src/theme/brands/*`); fonts were measured in Chromium with the brands' real faces.

## 1. Scope

**In scope**

1. Home in every audience the suite captures (`home-logged-out`, `home-logged-in`, `home-new-user`), all seven brands, light and dark, at 1280 and 390, with the 768 behaviour stated (4.7).
2. The `homeLayout` slot is **replaced** by a small `home` slot group of closed enums plus two numbers (3.1). Components read derived CSS properties, never the enums, and never the brand id. Every brand keeps the same regions, content, DOM order and focus order.
3. The hero card: placement, surface, alignment, display size per brand (capped for long titles and for 390), tagline face, edge, and the hero gradients (removed). One new shadow slot (`shadows.hero`) and the tagline face proposal P3 from 02 (`type.accentFont`, `type.accentStyle`).
4. **The dark-mode hero fix (owner).** The hero no longer inverts to an ivory card in dark mode. In light mode it is either a dark panel, a brand-colour panel or open type on the page. In dark mode it is a dark surface with a brand-tinted edge, in every brand (3.3).
5. Ornaments that only Home uses: lightbox's grease-pencil ring (G), festival's laurel create-league tile (E), noir's and ballot's rule under an open hero (02 D17 is resolved here: the 2 px ink rule sits under the hero, not under section titles).
6. Inventory findings: the two h1s, `titleCase`, hero loading and error states, wrapping of season-card names, the "see all" question, dead CSS, and whether `doubleRules` reaches Home dividers (4.9).
7. Fifteen marginal improvements (section 9), same structure in every brand.
8. Step 0b: seven items carried from chunk 9 and dogfooding, outside Home, each separable (8.4).

**Shared components touched (called out)**

- `primitives/cards/HeroCard` CSS (`.baseline-heroCard`) and the `hero` Title variant: used only by Home and `/__specimen`, so the specimen's hero cell changes (6.3).
- `primitives/layouts/LandingLayout.tsx`: from two slots to three (`hero`, `updates`, `aside`). Only Home uses it.
- `ui/MarkdownRenderer.tsx`: an optional `headingBase` prop, default unchanged (banners and static pages render as today).
- `ui/Title.tsx`: the `hero` variant's default heading level becomes 2.
- `theme/brands/contract.ts`, `css.ts`, the seven brand files, `brandContract.test.ts`, `docs/architecture/brands.md`.

**Not changed**

- The header, nav, wordmark, footer, banners and every other screen. Card, button, chip and input skins (03) are reused as they are.
- What Home shows and in which order (hero, latest update, create league, active seasons). No new data, no polling, no new endpoints.
- `ActionCard`, `StandardCard`, `EmptyState` outside Home: Home-only treatments are scoped under `.baseline-landing`.
- The page width. At 390 the shell gives content `min(80vw, 1200px)` minus gutters, which is **288 px**; at 1280 it is 1000 px; at 768 it is 590 px. All sizes below are computed for these widths. Widening the phone column is a shell change (escalation a4).
- The picker and enabling brands (chunk 12).

## 2. Intent

**Package intent.** Home is the one screen where a brand can compose rather than only recolour. Each brand gets a recognisable opening (an inset panel, a poster band, a masthead of type) built from three shared choices, while the reading order, the controls and every state stay identical. The hero is a title card, not a control: it carries no link or button, so it can be bold without affecting operability.

| Brand          | What the design is trying to express                                                                                                                                                  | Incidental in the mockup, not carried over                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A Refined Gold | A quiet editorial page: one dark, warm title panel set into the reading column, cards for everything else. In dark mode the panel stays dark and is lifted by a thin gold-toned edge. | 16 px hero radius (14, the brand's `radiusLg`); the gold uppercase "Active seasons" label.         |
| B Red Carpet   | Premiere night: a velvet band across the top, Playfair headline with an italic voice, the content below set loose on the page rather than boxed.                                      | Full-bleed band; the create-league card inside the band; the gold rule above the update.           |
| C Ballot       | A broadsheet masthead: centred Bodoni title over a double ink rule, an unboxed lead story, a ruled side column with one boxed ballot (create a league).                               | 1 px rule under the masthead (the brand's double rule is used).                                    |
| D Noir         | A title card: enormous condensed uppercase type, a heavy white rule, everything below in ruled columns with no boxes.                                                                 | Three equal columns; 92 px phone type (does not fit 288 px).                                       |
| E Festival     | A programme of flat tiles: a black title tile and a laurel action tile side by side, then the update and seasons tiles.                                                               | The dark board's light hero; 76 px type in a column it does not fit; tile around the seasons list. |
| F Technicolor  | A poster: a teal panel with a chunky ink outline and offset shadow, centred Fraunces black, an italic serif tagline.                                                                  | Seasons column on the left of the update; cherry update title; gold second word.                   |
| G Lightbox     | A contact sheet: a black print with a white border in a frame, mono type, and the action circled in cherry grease pencil.                                                             | The dark board's light hero; updates spanning four columns; two tiles side by side at 390.         |

## 3. Token values

### 3.1 Contract change: `homeLayout` is replaced by `home`

`homeLayout: BrandId` named one of seven bespoke layouts and is read by nothing. Seven layouts are not needed: every board is one of two placements, three hero surfaces and two region treatments. The slot is removed and replaced by a closed set (all in `theme/brands/contract.ts`, emitted by `css.ts`, a value for every brand from step 0):

| Slot (`home.*`) | Type                                     | Meaning                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placement`     | `"column" \| "masthead"`                 | `column`: the hero is the top of the left (reading) column. `masthead`: the hero spans both columns above them.                                                                                                                          |
| `heroSurface`   | `"darkPanel" \| "accentPanel" \| "open"` | `darkPanel`: the brand's dark-mode `surface` in **both** modes, with dark-mode ink. `accentPanel`: the brand's light-mode `accent` in both modes, with light-mode `page` as ink. `open`: no fill; type on the page with a rule under it. |
| `heroAlign`     | `"start" \| "center"`                    | Text alignment inside the hero.                                                                                                                                                                                                          |
| `heroMax`       | px string                                | Largest display size of the hero title (desktop).                                                                                                                                                                                        |
| `heroFit`       | number (8–30)                            | Hero title size as a percentage of the hero's inner width (`cqi`); the smaller of this and `heroMax` wins, so the title scales with its container and never overflows the default title.                                                 |
| `regions`       | `"cards" \| "open"`                      | `cards`: the update is a card. `open`: the update sits on the page, and the side column is separated by the brand's section rule.                                                                                                        |
| `ctaSurface`    | `"card" \| "primary"`                    | `primary`: the create-league card is filled with `primary`, its button inverts to `onPrimary` (E only).                                                                                                                                  |

Also added, each with a value for every brand:

- `shadows.hero` (per mode; `SHADOW_SLOTS` becomes `card, raised, overlay, hero`), emitted as `--brand-shadow-hero` plus the explicit-mode copies. It is the hero's edge and depth. Same `0 0 0 0 transparent` convention.
- `type.accentFont`, `type.accentStyle` (`"normal" | "italic"`), emitted as `--brand-font-accent` and `--brand-accent-style`: the tagline face (02 proposal P3, values unchanged from 02).

Why the panel colours derive from existing slots instead of four new colour slots: 02 already guarantees the pairs. Dark `text` and dark `muted` pass 4.5 on dark `surface` (02 3.0, `muted` rule), and light `accent` passes 4.5 on light `page` (02 D1), so light `page` on light `accent` passes too. A new brand gets a valid hero by choosing an enum. The contract test asserts both (8.2).

`brands.md` changes: replace the `home-layout` bullet with the `home` group and the derived properties below; add `hero` to the shadow list and `accent-font`, `accent-style` to the type list.

### 3.2 Derived properties (`css.ts`, common block; components read only these)

| Property                           | Value by enum                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--brand-home-areas`               | column `"hero aside" "updates aside"`; masthead `"hero hero" "updates aside"` (a `grid-template-areas` value, quotes included)             |
| `--brand-home-hero-panel`          | darkPanel, accentPanel `1`; open `0` (multiplier for padding)                                                                              |
| `--brand-home-hero-bg`             | darkPanel `var(--brand-dark-surface)`; accentPanel `var(--brand-light-accent)`; open `transparent`                                         |
| `--brand-home-hero-fg`             | darkPanel `var(--brand-dark-text)`; accentPanel `var(--brand-light-page)`; open `var(--brand-text)`                                        |
| `--brand-home-hero-fg-rgb`         | darkPanel `var(--brand-dark-text-rgb)`; accentPanel `var(--brand-light-page-rgb)`; open `var(--brand-text-rgb)` (loading placeholder tint) |
| `--brand-home-hero-muted`          | darkPanel `var(--brand-dark-muted)`; accentPanel `rgba(var(--brand-light-page-rgb), 0.9)`; open `var(--brand-muted)`                       |
| `--brand-home-hero-radius`         | panels `var(--brand-radius-lg)`; open `0`                                                                                                  |
| `--brand-home-hero-rule`           | open: `3px double var(--brand-text)` when `ruleStyle` is `double`, else `2px solid var(--brand-text)`; panels `0 solid transparent`        |
| `--brand-home-hero-align`          | `start` or `center`                                                                                                                        |
| `--brand-home-hero-tagline-inline` | start `0`; center `auto` (tagline `margin-inline`)                                                                                         |
| `--brand-home-hero-max`            | `heroMax`                                                                                                                                  |
| `--brand-home-hero-fit`            | `heroFit` (unitless)                                                                                                                       |
| `--brand-home-open`                | regions open `1`; cards `0`                                                                                                                |
| `--brand-home-updates-bg`          | cards `var(--panel)`; open `transparent`                                                                                                   |
| `--brand-home-updates-shadow`      | cards `var(--brand-shadow-card)`; open `0 0 0 0 transparent`                                                                               |
| `--brand-home-aside-rule`          | open `var(--brand-section-rule)`; cards `0 solid transparent`                                                                              |
| `--brand-home-align`               | open `stretch`; cards `start` (grid `align-items`; stretch lets the column rule run the full row)                                          |
| `--brand-home-cta-bg`              | card `var(--panel)`; primary `var(--brand-primary)`                                                                                        |
| `--brand-home-cta-fg`              | card `var(--brand-text)`; primary `var(--brand-on-primary)`                                                                                |
| `--brand-home-cta-shadow`          | card `var(--brand-shadow-card)`; primary `0 0 0 0 transparent`                                                                             |
| `--brand-home-cta-button-bg`/`-fg` | card `var(--brand-primary)` / `var(--brand-on-primary)`; primary `var(--brand-on-primary)` / `var(--brand-primary)`                        |
| `--brand-home-cta-ring`            | card `var(--brand-focus-ring)`; primary `var(--brand-on-primary)`                                                                          |

Do not use the CSS-wide keyword `inherit` as a derived value (it makes the custom property itself inherit). `var(--panel)` is `--brand-raised` (`styles.css:5`).

### 3.3 Values per brand (final)

| Slot                   | A refined-gold                                                                    | B red-carpet                | C ballot                     | D noir                 | E festival               | F technicolor                            | G lightbox                                   |
| ---------------------- | --------------------------------------------------------------------------------- | --------------------------- | ---------------------------- | ---------------------- | ------------------------ | ---------------------------------------- | -------------------------------------------- |
| `placement`            | column                                                                            | masthead                    | masthead                     | masthead               | column                   | masthead                                 | column                                       |
| `heroSurface`          | darkPanel                                                                         | accentPanel                 | open                         | open                   | darkPanel                | accentPanel                              | darkPanel                                    |
| `heroAlign`            | start                                                                             | start                       | center                       | start                  | start                    | center                                   | start                                        |
| `heroMax`              | 44px                                                                              | 68px                        | 72px                         | 148px                  | 64px                     | 84px                                     | 50px                                         |
| `heroFit`              | 12.5                                                                              | 18                          | 16                           | 24                     | 19                       | 18.5                                     | 15                                           |
| `regions`              | cards                                                                             | open                        | open                         | open                   | cards                    | cards                                    | cards                                        |
| `ctaSurface`           | card                                                                              | card                        | card                         | card                   | primary                  | card                                     | card                                         |
| `accentFont` / `Style` | Inter / normal                                                                    | Playfair Display / italic   | Bodoni Moda / italic         | Bodoni Moda / italic   | Instrument Sans / normal | Playfair Display / italic                | Archivo / normal                             |
| Faces to add           | none                                                                              | Playfair Display italic 400 | none (has Bodoni italic 400) | Bodoni Moda italic 400 | none                     | Playfair Display italic 400              | none                                         |
| `shadows.hero` light   | `0 1px 2px rgba(60, 45, 10, 0.06), 0 8px 20px rgba(60, 45, 10, 0.08)`             | `0 0 0 1px #8e2a3a`         | `0 0 0 0 transparent`        | `0 0 0 0 transparent`  | `0 0 0 0 transparent`    | `0 0 0 2px #2a1a12, 0 5px 0 2px #2a1a12` | `inset 0 0 0 6px #ffffff, 0 0 0 1px #141414` |
| `shadows.hero` dark    | `0 0 0 1px #6b5a2a, 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.35)` | `0 0 0 1px #8e2a3a`         | `0 0 0 0 transparent`        | `0 0 0 0 transparent`  | `0 0 0 1px #1f6b4a`      | `0 0 0 2px #f3ddbb, 0 5px 0 2px #f3ddbb` | `inset 0 0 0 6px #4a3537, 0 0 0 1px #f2e6e4` |

Resulting hero colours:

| Brand | Light-mode hero                                                   | Dark-mode hero                                                                                                | Board check                                                                                                                |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A     | #26231f panel, #f3eee3 title, #a89f8e tagline, soft shadow        | **#26231f panel one step above the #12110f page, #f3eee3 ink, 1 px #6b5a2a edge, radius 14** (owner's values) | Matches `A-Home-Dark` (16 → 14 radius, D15). Light fill is the dark `surface` (#1c1a16 on the board)                       |
| B     | #6e1a26 velvet, #f7f0ea ink, ring #8e2a3a                         | same                                                                                                          | Matches `B-Home` and `B-Home-Light` (band colour and edge)                                                                 |
| C     | open on #f5f1e8, ink #1c1a16, 3 px double ink rule                | open on #14120f, ink #ede6d6, 3 px double rule                                                                | Matches both boards (rule weight D13)                                                                                      |
| D     | open on #f4f4f4, ink #111111, 2 px ink rule                       | open on #0b0b0b, ink #f2f2f2, 2 px rule                                                                       | Matches both boards                                                                                                        |
| E     | #181816 tile on white, #f5f5f2 ink                                | **#181816 tile on #0e0e0e with a 1 px laurel #1f6b4a edge**                                                   | `E-Home-Dark` inverts to a light tile; the owner's rule overrides it (D5, b1)                                              |
| F     | #0c6e6e teal, #fff6e5 ink, 2 px ink outline, 5 px offset          | #0c6e6e teal, cream outline and offset                                                                        | Matches both boards (the brand's accent #0c6e6e instead of the board's #0f7b7b, which is exactly the drafting status teal) |
| G     | #221718 print, #f2e6e4 ink, 6 px white inner band, 1 px ink frame | **#221718 print, 6 px #4a3537 inner band, 1 px #f2e6e4 frame**                                                | `G-Home-Dark` inverts to a light print; owner's rule overrides (D5, b1)                                                    |

**No gradients.** All 21 boards draw flat heroes, and the radial spotlight was the only reader of `accent` in dark mode and the source of the ivory inversion. Removing it fixes the owner's note and halves the contrast surface (no gradient extremes).

**Colour roles.** F's teal panel is the brand's `accent` #0c6e6e, close to the drafting status teal #0f7b7b. Status hues on Home appear only on chip borders and marks, always with a glyph and an ink label, so a large decorative panel does not read as a status. E's laurel tile equals `--fo-status-complete` (02 already accepted laurel as E's primary). No hero or tile uses win gold.

### 3.4 Step 0 interim values (B–G until their own step)

Step 0 lands the mechanism and refined-gold's final values, and the dark-mode fix for every brand. So that the E–G session owns its own composition, B–G get these interim values in step 0: **final** `heroSurface` and `shadows.hero` (the dark fix), **final** `heroFit`; `placement: column`, `heroAlign: start`, `regions: cards`, `ctaSurface: card`, `heroMax` = the brand's `h1Size` (B 36, C 40, D 40, E 38, F 38, G 32 px), `accentFont` = the brand's `bodyFont`, `accentStyle: normal`. These brands are not enabled (`ENABLED_BRAND_IDS` is refined-gold only), so the interim look ships to nobody.

### 3.5 Display sizes and how they were derived

Measured advance widths (Chromium, real faces, display weight and the brand's hero tracking; em per string): "Fantasy Oscars" A 8.59, B 7.14, C 7.14, D 6.25 (uppercase), E 7.79, F 7.71, G 8.40; "Fantasy" A 4.35, B 3.59, C 3.69, D 3.21, E 4.00, F 4.01, G 4.20; "Cinematography" A 9.45, B 7.79, C 7.98, D 6.52, E 8.34, F 8.54, G 8.40.

Inner widths: panel hero at 390 is 288 − 2 × 16 = **256 px**; open hero 288. At 1280 the column hero is 605 − 64 = 541 px; a masthead panel 1000 − 64 = 936; open masthead 1000. At 768: column 356 − 48 = 308; masthead panel 542; open 590.

Rule used: `heroFit` is the smaller of (a) the size at which an 8-letter word plus 10 % fits the phone inner width and (b) the board's phone size; `heroMax` is the board's desktop size, reduced where the default title would not fit one line in its 1280 container.

| Brand | 1280                                                | 768                          | 390                                  | Board 1280 / 390 |
| ----- | --------------------------------------------------- | ---------------------------- | ------------------------------------ | ---------------- |
| A     | 44 px, one line (378 of 541 px)                     | 38 px, two lines             | 32 px, two lines ("Fantasy" 139 px)  | 44 / 32          |
| B     | 68 px, one line (486 of 936)                        | 68 px, one line (486 of 542) | 46 px, two lines (165 px per word)   | 68 / 46          |
| C     | 72 px, one line, centred (514 of 1000)              | 72 px, one line (514 of 590) | 46 px, two lines                     | 72 / 46          |
| D     | **148 px, one line "FANTASY OSCARS" (925 of 1000)** | 142 px, two lines            | **69 px, two lines** ("FANTASY" 222) | 148 / 92 (D8)    |
| E     | 64 px, one line (499 of 541)                        | 58 px, two lines             | 49 px, two lines                     | 76 / 50 (D8)     |
| F     | 84 px, one line, centred (648 of 936)               | 84 px, two lines             | 47 px, two lines                     | 84 / 52 (D8)     |
| G     | 50 px, one line (420 of 541)                        | 46 px, two lines             | 38 px, two lines                     | 50 / 38          |

### 3.6 Contrast (14 palettes)

Text needs 4.5 (3.0 for 24 px+ or 18.66 px bold); non-text 3.0. The hero title is at least 24 px in every tier, so it is large text. The tagline is 18 px regular, so it needs 4.5. Hero edges and rules are decorative (the hero holds no control and is not the only cue to anything), given for the record.

**3.6.1 Hero**

| Brand, mode | Surface             | Title on hero | Tagline on hero | Hero fill vs page | Edge vs page (decorative)                      |
| ----------- | ------------------- | ------------- | --------------- | ----------------- | ---------------------------------------------- |
| A light     | darkPanel #26231f   | 13.52         | 5.97            | 14.75             | soft shadow only                               |
| A dark      | darkPanel #26231f   | 13.52         | 5.97            | 1.21              | #6b5a2a 2.80 (2.32 vs the fill)                |
| B light     | accentPanel #6e1a26 | 10.12         | 8.45            | 10.12             | #8e2a3a 7.32                                   |
| B dark      | accentPanel #6e1a26 | 10.12         | 8.45            | 1.71              | #8e2a3a 2.37                                   |
| C light     | open on #f5f1e8     | 15.41         | 6.53            | n/a               | double ink rule 15.41                          |
| C dark      | open on #14120f     | 15.04         | 6.71            | n/a               | double ink rule 15.04                          |
| D light     | open on #f4f4f4     | 17.17         | 6.27            | n/a               | 2 px ink rule 17.17                            |
| D dark      | open on #0b0b0b     | 17.58         | 7.80            | n/a               | 2 px ink rule 17.58                            |
| E light     | darkPanel #181816   | 16.28         | 7.19            | 17.78             | none                                           |
| E dark      | darkPanel #181816   | 16.28         | 7.19            | 1.09              | #1f6b4a 3.00 (2.76 vs the fill)                |
| F light     | accentPanel #0c6e6e | 5.64          | **4.89**        | 5.64              | ink outline 15.59                              |
| F dark      | accentPanel #0c6e6e | 5.64          | **4.89**        | 3.02              | cream outline 13.81                            |
| G light     | darkPanel #221718   | 14.30         | 6.66            | 14.84             | ink frame 15.68; white band 17.45 vs fill      |
| G dark      | darkPanel #221718   | 14.30         | 6.66            | 1.08              | frame #f2e6e4 15.48; band #4a3537 1.54 vs fill |

The accent-panel tagline alpha is 0.9 because 0.85 gives F only 4.54 and 0.8 fails (4.22). The A dark edge is the owner's value and stays below 3:1; the panel is told apart from the page by its edge and its 1.21 step, and nothing depends on seeing its boundary. If the owner wants the edge to read as a boundary, #7a6631 reaches 3.05 (not recommended: it starts to look like a control ring).

Loading placeholders inside panels (`rgba(fg, 0.18)`): 1.42–1.71 against the fill; placeholders carry no requirement.

**3.6.2 Open regions (B, C, D: the update and side column sit on `page`)**

| Brand, mode | Body text | Date (`muted`) | Links in the update | Section rule (decorative) |
| ----------- | --------- | -------------- | ------------------- | ------------------------- |
| B light     | 15.95     | 5.70           | 5.37                | 1 px `rule` 1.30          |
| B dark      | 16.90     | 8.52           | 11.27               | 1.44                      |
| C light     | 15.41     | 6.53           | 5.37                | 3 px double ink 15.41     |
| C dark      | 15.04     | 6.71           | 8.53                | 15.04                     |
| D light     | 17.17     | 6.27           | 17.17               | 1 px `rule` 1.40          |
| D dark      | 17.58     | 7.80           | 17.58               | 1.45                      |

Season cards, the create-league card, chips, alerts and buttons keep their 03 pairs; in open mode they still sit on `page`, which 02 and 03 already checked.

**3.6.3 E laurel tile (`ctaSurface: primary`, both modes #1f6b4a with #ffffff)**

| Pair                                             | Light                             | Dark |
| ------------------------------------------------ | --------------------------------- | ---- |
| Title and helper text (`onPrimary` on `primary`) | 6.44                              | 6.44 |
| Inverted button label (#1f6b4a on #ffffff)       | 6.44                              | 6.44 |
| Inverted button hover (#1f6b4a on #e4ede9)       | 5.41                              | 5.41 |
| Button edge (white fill on the tile)             | 6.44                              | 6.44 |
| Focus ring inside the tile (local `onPrimary`)   | 6.44                              | 6.44 |
| Brand focus ring if not overridden (ink on tile) | 3.00 (why the ring is overridden) | 5.90 |
| Tile vs page                                     | 6.44                              | 3.00 |

**3.6.4 G grease pencil (decorative):** accent #b8213a on the white card 6.33; #f0566a on #221718 5.19.

**3.6.5 New controls on the page:** "See all" and "Log in" are ghost and secondary buttons (03 pairs). Their labels are `text` on `page` or `raised`: 15.04–19.30 in every palette.

## 4. Component rules

### 4.1 Page grid (`primitives/layouts/LandingLayout.tsx`, `primitives/baseline.css`)

`LandingLayout` takes three nodes, `hero`, `updates`, `aside`, and renders:

```
.baseline-landing > .baseline-landing-grid
  > .baseline-landing-hero    (grid-area: hero)
  > .baseline-landing-updates (grid-area: updates)
  > .baseline-landing-aside   (grid-area: aside)
```

DOM and focus order are fixed for every brand: hero, update, create league, active seasons. No CSS `order`, no `row-reverse`.

| Width         | Grid                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 900         | `grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr)`; `grid-template-rows: auto 1fr`; `grid-template-areas: var(--brand-home-areas)`; `column-gap: calc(var(--fo-space-sm) + var(--brand-home-open) * (var(--fo-space-md) - var(--fo-space-sm)))` (16 cards, 24 open); `row-gap: var(--fo-space-md)`; `align-items: var(--brand-home-align)`; `padding-top: var(--fo-space-sm)` as today |
| 500–899 (768) | Same areas and columns; `column-gap` 12 cards / 16 open, `row-gap: var(--fo-space-sm)`                                                                                                                                                                                                                                                                                                       |
| < 500 (390)   | `grid-template-columns: minmax(0, 1fr)`; `grid-template-areas: "hero" "updates" "aside"`; `row-gap: var(--fo-space-md)` (24, so open regions have room for their rule)                                                                                                                                                                                                                       |

Column placement: the aside spans both rows; the update starts under the hero; extra height goes to the second row, and with `align-items: start` the update card keeps its own height. Masthead: the hero spans both columns; update and aside share the second row.

Side column (`.baseline-landing-aside`): a `Stack` with gap `var(--fo-space-md)`. In open mode at ≥ 500 it has `border-inline-start: var(--brand-home-aside-rule)` and `padding-inline-start: calc(var(--brand-home-open) * var(--fo-space-md))`. Below 500 the inline rule is removed and replaced by `border-block-start: var(--brand-home-aside-rule)` with `padding-block-start: calc(var(--brand-home-open) * var(--fo-space-md))`. In cards mode both resolve to nothing.

The two `Divider`s (after the hero, before "Active seasons") are **removed** in every brand: the row gap separates cards, and in open mode the brand's rules do the job. This also answers whether `doubleRules` reaches Home dividers: Home has no plain dividers any more; its rules read `--brand-section-rule` and `--brand-home-hero-rule`, which already render ballot's double rule.

### 4.2 Hero (`HeroCard`, `.baseline-heroCard`, `Title variant="hero"`)

**Construction**

```
<HeroCard>                       .baseline-heroCard
  <Title variant="hero" data-tier={tier}>   h2 (ui/Title default for hero becomes 2)
  tagline slot                   Text variant="helper" .baseline-heroTagline | Skeleton
</HeroCard>
```

`.baseline-heroCard` (replaces both scheme-specific blocks, `baseline.css` 181–207):

- `container-type: inline-size`;
- `background: var(--brand-home-hero-bg)`; `color: var(--brand-home-hero-fg)`; `--fo-typo-muted: var(--brand-home-hero-muted)`;
- `box-shadow: var(--brand-shadow-hero)`; `border-radius: var(--brand-home-hero-radius)`; `border-bottom: var(--brand-home-hero-rule)`;
- `text-align: var(--brand-home-hero-align)`;
- padding with a local `--hero-pad` of `var(--fo-space-lg)` (32) at ≥ 900, `var(--fo-space-md)` (24) at 500–899; below 500 the block padding is 24 and the inline padding 16. Panel: `padding: calc(var(--brand-home-hero-panel) * <block>) calc(var(--brand-home-hero-panel) * <inline>)`. Open: inline 0, top 0, bottom `var(--fo-space-md)` above the rule, i.e. `padding-bottom: calc(var(--brand-home-hero-panel) * <block> + (1 - var(--brand-home-hero-panel)) * var(--fo-space-md))`;
- gap between title and tagline `var(--fo-space-xs)` (12);
- no gradient, no `--fo-alpha-75` mix, no scheme selector.

**Title** (`.mantine-Title-root[data-fo-typo="hero"]`, replaces the rule at `styles.css:260`):

- `font-family: var(--brand-font-display)`, weight, case, hero tracking and word spacing as today;
- display and medium tiers: `font-size: max(var(--fo-font-size-lg), min(calc(var(--brand-home-hero-max) * var(--hero-tier)), calc(var(--brand-home-hero-fit) * var(--hero-tier) * 1cqi)))` with `--hero-tier` 1 (display) or 0.62 (medium); `line-height: 1` (display), `1.1` (medium);
- long tier: `font-size: var(--fo-heading-h1-size)`; `line-height: 1.1`;
- `text-wrap: balance`; `overflow-wrap: anywhere`; `max-width: 100%`. No `hyphens` (dictionary availability differs between the CI browser and real ones).

**Tier decision** (new, pure: `decisions/landing.ts`, `computeHeroTitleTier(title)`, unit-tested):

| Tier      | Rule (code points, words split on `\s+`) | Examples                                                    |
| --------- | ---------------------------------------- | ----------------------------------------------------------- |
| `display` | length ≤ 24 and longest word ≤ 8         | "Fantasy Oscars", "Fantasy Oscars 2027"                     |
| `medium`  | length ≤ 40 and longest word ≤ 12        | "The Ninety-Ninth Academy Awards" (31; longest 12)          |
| `long`    | anything else                            | a 61-character title; "Cinematography" (one 14-letter word) |

At 390 a medium title in the widest face (A) still fits a 12-letter word (194 of 256 px); a long title falls to the page-title size (32–40 px) and breaks anywhere rather than overflow.

**Tagline** (`.baseline-heroTagline`, the dead rule of that name is replaced): `font-family: var(--brand-font-accent)`; `font-style: var(--brand-accent-style)`; weight 400; `font-size: var(--fo-font-size-md)` (18) at every width; `line-height: 1.4`; `max-width: 60ch`; `margin-inline: var(--brand-home-hero-tagline-inline)`; colour from `--fo-typo-muted`. Not clamped (it is admin-authored content and has no other home).

**States**

| State                        | Hero shows                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blurb loading                | Title "Fantasy Oscars" (display tier). Tagline slot: one `Skeleton` bar, height `calc(var(--fo-font-size-md) * 1.4)`, width 60 %, colour `rgba(var(--brand-home-hero-fg-rgb), 0.18)` via a local override (on open heroes the default skeleton), `role="status"`, `aria-label="Loading"`. The hero keeps its final height, so nothing below moves. |
| Ready, tagline present       | Title from content, tier from the decision; tagline                                                                                                                                                                                                                                                                                                |
| Ready, empty first paragraph | Title only; no empty paragraph (render nothing, so no gap)                                                                                                                                                                                                                                                                                         |
| Error                        | Title "Fantasy Oscars", tagline `HERO_FALLBACK_TAGLINE` = "Draft night, but for awards." (constant in `decisions/landing.ts`). No error is shown: there is nothing the user can do, and the update and seasons regions report their own errors                                                                                                     |
| Long title                   | medium or long tier as above; wraps, balanced                                                                                                                                                                                                                                                                                                      |
| Long tagline                 | wraps to 60ch; hero grows                                                                                                                                                                                                                                                                                                                          |

**Variants at a glance**

| Variant                       | 1280                                             | 390                                    |
| ----------------------------- | ------------------------------------------------ | -------------------------------------- |
| column + darkPanel (A, E, G)  | Top of the left column, 541 px inner, padding 32 | Full width, first block, padding 24/16 |
| masthead + accentPanel (B, F) | Spans 1000 px, padding 32; F centred             | Full width, padding 24/16; F centred   |
| masthead + open (C, D)        | Spans 1000 px, no fill, rule under; C centred    | Full width, rule under; C centred      |

### 4.3 Latest update (`StandardCard.baseline-updatesCard`)

Construction for every brand:

- Date: `Text variant="meta" component="time" dateTime={published_at}` formatted by a new pure `formatUpdateDate(iso)` = `Intl.DateTimeFormat(undefined, { dateStyle: "medium" })` ("Jan 31, 2026").
- Title: `Title variant="page" order={3} className="baseline-wrapAnywhere"`, so it renders at the brand's `h2Size` (A 24, B 28, C 30, D 32, E 28, F 28, G 24) in the display font, as every board shows; heading level 3 under the hero's 2.
- Body: `Markdown` with `headingBase={4}` inside a `Box className="baseline-wrapAnywhere"` (long URLs and words wrap).
- Gap: `var(--fo-space-dense-2)` between date and title, `var(--fo-space-xs)` before the body.

Surface (`.baseline-landing .baseline-updatesCard`, replaces the rule at `baseline.css:176`):

| `regions` | Treatment                                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cards     | `background: var(--brand-home-updates-bg)`; `box-shadow: var(--brand-home-updates-shadow)`; padding `var(--fo-space-md)` at ≥ 900 (24, the board's reading card), `var(--fo-space-sm)` below (was 12 everywhere) |
| open      | Transparent, no ring, padding 0: the text sits on the page                                                                                                                                                       |

States:

| State             | Rendering                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading           | Skeleton as today (date 25 %, title 70 % at `--fo-heading-h2-size` height, three body bars), `role="status"`, "Loading updates"; in open mode on the page                                                                                                                        |
| Ready             | As above                                                                                                                                                                                                                                                                         |
| Empty             | Title "It's quiet… too quiet" (no date: there is no publish date to show), then `EmptyState` "No updates have been published yet."                                                                                                                                               |
| Error             | `PageError` with the message (error glyph, `role="alert"`), then `Button variant="secondary"` "Try again" calling `refresh.updates` (passed from `HomePage`). The button is disabled with a loader while the retry runs (`state === "loading"` again shows the skeleton instead) |
| Long title        | Wraps; four lines at 390 are acceptable                                                                                                                                                                                                                                          |
| Markdown headings | `#`, `##` render as h4 at `h3Size` (`variant="section"`); `###` and deeper render as bold text, as `#####` does today                                                                                                                                                            |

`MarkdownRenderer` change: optional `headingBase` (default 2). Mapping: level = `max(depth, 1) + (headingBase − 2)`, with `#` first remapped to 2 as today; levels 5 and 6 use the existing bold `Text`. When `headingBase` is given, titles use `variant="section"`. Without it, nothing changes.

### 4.4 Create league (`ActionCard`)

- Title: `Title variant="section" order={3}` "Create a league" (h3Size, was the 14 px card title).
- Text: unchanged copy.
- Button: `Button variant="primary" fullWidth component={Link}`; `to="/leagues/new"` when signed in; when signed out `to="/login"` with `state={{ from: "/leagues/new" }}` (M8). Disabled while the session loads, as today.
- Padding on Home: `var(--fo-space-md)` at ≥ 900, `var(--fo-space-sm)` below (scoped `.baseline-landing .baseline-actionCard`; `ActionCard` elsewhere unchanged).

`ctaSurface` (scoped `.baseline-landing .baseline-actionCard`):

| Value   | Treatment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| card    | `background: var(--brand-home-cta-bg)`, `box-shadow: var(--brand-home-cta-shadow)`: identical to today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| primary | Fill `primary`, text `onPrimary` (`color: var(--brand-home-cta-fg)`, and `.mantine-Title-root, .mantine-Text-root { color: inherit }` inside). The primary button inverts: `--button-bg: var(--brand-home-cta-button-bg) !important`, `--button-color: var(--brand-home-cta-button-fg) !important`, `--button-hover: color-mix(in srgb, var(--brand-home-cta-button-bg) 88%, var(--brand-home-cta-button-fg)) !important`, `--button-bd: var(--fo-border-width) solid var(--brand-home-cta-button-bg) !important` (the 03 skin sets these with `!important`, so match its selector and add the card class). Local `--brand-focus-ring: var(--brand-home-cta-ring)` on the card. No shadow (E is flat) |

States: signed out (link to login, return state), signed in, session loading (disabled, `aria-disabled`, opacity 0.6 per 03). Hover and press per 03 (inverted colours for primary).

**Grease pencil (G; `decorations.greasePencil`, multiplier `--brand-deco-grease-pencil`).** The New league button is wrapped in `<span className="baseline-ctaMark">` in every brand:

- `.baseline-ctaMark { position: relative; display: block; isolation: isolate; padding: calc(var(--brand-deco-grease-pencil) * var(--fo-space-8)) calc(var(--brand-deco-grease-pencil) * (var(--fo-space-4) + var(--fo-space-2))); }` (8 px block, 6 px inline);
- `::before`: `content: ""; position: absolute; inset: -2px -8px` (tokens: `calc(-1 * var(--fo-space-2))` and `calc(-1 * var(--fo-space-8))`); `border: 2px solid var(--brand-accent)`; `border-radius: 50%`; `transform: rotate(-3deg)`; `opacity: var(--brand-deco-grease-pencil)`; `pointer-events: none`; `z-index: -1` (behind the button, above the card).
- In A–F the span adds no padding and the ring is invisible. The ring never covers the button label, never changes the 44 px target and is not a focus indicator (the ink focus ring with its 2 px gap still draws on the button). The 8 px overhang stays inside the card's 16–24 px padding, so no overflow at 390.

### 4.5 Active seasons (aside, below the create card)

Heading row: `Group justify="space-between" align="center" wrap="wrap"` with `row-gap: var(--fo-space-4)` with `Title variant="section"` **"Active seasons"** (sentence case, M13) and, when signed in with at least one season shown, `Button variant="ghost" component={Link} to="/seasons" aria-label="See all seasons"` with the visible label "See all" (M6). At 390 the ghost button is 44 px tall per 03.

| Audience or state                  | Rendering                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session loading (`authLoading`)    | The two-card seasons skeleton (not the signed-out card, so a signed-in user no longer sees "Log in" flash) (M11)                                                                                                                                                                                               |
| Signed out (`idle`)                | `StandardCard`: `Text` "Log in to see your active seasons." and `Button variant="secondary" component={Link} to="/login"` "Log in" (no return state needed: login returns to `/`). At 390 the header has no Log in button, so this is the visible route in (M7)                                                |
| Loading                            | **Two** skeleton cards (was three; at most two are ever shown), `role="status"`, "Loading seasons"                                                                                                                                                                                                             |
| Error                              | `PageError` with the message, then secondary "Try again" (`refresh.seasons`); no card wrapper (M9)                                                                                                                                                                                                             |
| Empty (new user, or only inactive) | `EmptyState` "No active seasons yet. Start one with New league, or accept an invite from a commissioner." (M15)                                                                                                                                                                                                |
| One or two seasons                 | Interactive `StandardCard` links as today, title (ceremony) then meta row                                                                                                                                                                                                                                      |
| Long names                         | Ceremony title gets `baseline-wrapAnywhere`. Meta row stays `nowrap`; the league name `Text` gets `baseline-wrapAnywhere` (wraps inside its flex item) and the `StatusPill` gets `flex: none`, so a long or unbroken league name wraps under itself and the chip stays whole at the end of the first line (M5) |
| Chip labels                        | `titleCase` fixed (`/\s+/`), so brands with `labelCase: none` (E, F) read "Draft Live", "Draft Not Started"; uppercase brands are unchanged                                                                                                                                                                    |

Card surfaces, hover, focus (4 px offset ring) and press are 03's and identical in cards and open modes.

### 4.6 Headings and focus order

Outline: wordmark h1 (unchanged, the one h1 on every screen), hero h2, update title h3, update body headings h4, "Create a league" h3, "Active seasons" h3, season cards h4. This fixes the two h1s without touching the shell.

Focus order (every brand): skip link, header controls, nav, then in `main`: links inside the update, Try again (update error only), New league, Log in (signed out) or See all (signed in), each season card, Try again (seasons error only), footer. The hero has no focus stop.

### 4.7 Layout at 768 (not captured; verified by gallery captures, 6.4)

- Two columns (590 px: 356 and 222 px). Column brands (A, E, G): hero at the top of the 356 px column, title 38/58/46 px, two lines. Masthead brands: hero full width (B and C keep one line, D and F break into two balanced lines).
- The 222 px side column is the tightest place: the create card (button full width) and the season cards fit; league names wrap under themselves (4.5). In open brands the side column loses 16 px to its rule padding, so in C ("Active seasons" about 160 px plus "See all" about 70 px) the heading row wraps and "See all" drops under the title, start-aligned; it never truncates.
- Open brands keep their column rule (16 px gap plus 16 px padding).

### 4.8 Phone (390)

Single column in DOM order: hero, update, create league, active seasons. Hero heights for the default content: A about 150 px, B 170, C 150, D 200, E 170, F 170, G 160, so the first screen (844 px, header about 110 px) shows the hero and the start of the update in every brand. The update is the long block; New league follows it. This order is shared by every brand (see a1 for the owner's choice about moving the aside up).

### 4.9 Inventory findings, decided

| Finding                                | Decision                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two h1s                                | Hero becomes h2 (`ui/Title.tsx` default for `hero` = 2). The wordmark stays h1, as on every other screen whose page title is h2                                                                                                                                                |
| `titleCase` never splits               | Fix the regex to `/\s+/`; unit test ("draft not started" → "Draft Not Started")                                                                                                                                                                                                |
| Hero has no loading or error state     | Skeleton tagline while loading; fallback title and tagline on error (4.2)                                                                                                                                                                                                      |
| League names lack wrap protection      | `baseline-wrapAnywhere` on league name and ceremony title, chip `flex: none` (4.5)                                                                                                                                                                                             |
| Only two seasons, no "see all"         | Add "See all" (to the existing `/seasons` index) whenever at least one season is shown. It is a link to an existing page already in the nav, so it is a marginal improvement, not new scope. Not conditional on `total > 2`, so it is visible and testable in `home-logged-in` |
| Dead CSS                               | Delete `.baseline-updates-prose` (both rules). `.baseline-heroTagline` is redefined (4.2). Delete the two scheme-scoped hero blocks                                                                                                                                            |
| Does `doubleRules` reach Home dividers | Dividers are removed; open-mode rules read `--brand-section-rule` (double for C). No Home rule reads `--brand-deco-double-rules` directly                                                                                                                                      |

## 5. Deviations from the mockups

| #   | Mockup                                                                                                                      | Built                                                                | Reason                                                                                                                              | Designer? |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| D1  | B's band is full-bleed                                                                                                      | Content width, radius 6                                              | The shell owns the gutters; a `100vw` breakout overflows with classic scrollbars and fails the overflow assertion                   | No        |
| D2  | B puts the create-league card inside the band                                                                               | Card at the top of the side column                                   | All brands share one DOM and focus order (hero, update, create, seasons)                                                            | Yes (b2)  |
| D3  | E, G put create before the update; F puts the side column left of the update; G spans the update across four columns        | Shared order and two columns; the side column is always on the right | Same reason; visual order must follow DOM order                                                                                     | Yes (b2)  |
| D4  | D has three equal columns                                                                                                   | Two columns (1.6 : 1)                                                | A third of 1000 px is too narrow for a long markdown update; fewer variants                                                         | No        |
| D5  | E and G dark boards invert the hero to a light panel                                                                        | Dark panel with a brand-tinted edge                                  | Owner's dark-mode rule (dogfooding)                                                                                                 | Yes (b1)  |
| D6  | B, C, E (stop), F, G style the hero's second word ("Fantasy _Oscars_")                                                      | Single-tone hero title                                               | The hero title is CMS content; splitting it would mean guessing words. The wordmark already carries the two-tone mark in the header | Yes (b3)  |
| D7  | (Today's build) radial spotlight gradients                                                                                  | Flat fills                                                           | Every board is flat; the gradient caused the inversion                                                                              | No        |
| D8  | E 76 px at 1280; D 92, E 50, F 52 px at 390                                                                                 | E 64; D 69, E 49, F 47 px                                            | E's column is 541 px; phone content is 288 px (not the board's 358), and an 8-letter word must fit                                  | No        |
| D9  | Taglines 16–26 px                                                                                                           | 18 px everywhere                                                     | One rule; D's 26 px under 148 px type adds little                                                                                   | No        |
| D10 | E and G heroes have a minimum height with bottom-aligned type                                                               | Height from content                                                  | Fewer slots; the difference at the default content is under 30 px                                                                   | No        |
| D11 | E and G box the seasons list in a tile; A, C, F style the "Active seasons" heading (gold label, mono label with rule, teal) | 03 section title on the page                                         | Nested cards in E would need `tone="nested"` (02 3.0c); one heading treatment                                                       | No        |
| D12 | B separates update and side column with top rules (gold on the update)                                                      | Section rule on the side column's inline start (on top at 390)       | One open-mode rule for B, C, D; no colour role for a gold rule                                                                      | No        |
| D13 | C's masthead rule is 1 px                                                                                                   | 3 px double ink                                                      | The brand's rule style (`ruleStyle: double`)                                                                                        | No        |
| D14 | F's update title is cherry                                                                                                  | Ink                                                                  | `primary` as text is avoided (02 4.6)                                                                                               | No        |
| D15 | A hero radius 16, F 28                                                                                                      | `radiusLg`: 14, 24                                                   | Existing shape slots                                                                                                                | No        |
| D16 | G puts create and seasons side by side at 390                                                                               | Single column                                                        | 2 × 133 px tiles cannot hold season cards with chips                                                                                | No        |
| D17 | D leaves the create-league block unboxed                                                                                    | Card                                                                 | The one primary action keeps the same container in every brand                                                                      | No        |
| D18 | A light fill #1c1a16; E, G hero ink #ffffff                                                                                 | Dark `surface` (#26231f, #181816, #221718) and dark `text`           | Derived from slots with guaranteed contrast                                                                                         | No        |

## 6. Acceptance per screenshot

Layers (ADR 0003): **layout tier** (refined-gold, light, both viewports; dark only for `home-logged-in`), **brand-screens tier** (`home-logged-out`, `home-logged-in` per brand in its primary mode, both viewports), **specimen tier** (`/__specimen`, every brand, both modes at desktop, primary mode at 390), **assertion tier** (no baselines; overflow, clipped text, overlap, 44 px at 390, axe contrast on every screen × brand × mode × viewport).

Regions used below: **header band** (wordmark row and nav), **content** (hero, update, side column), **footer band**. Home steps never change the header band; the footer band only shifts vertically. Triage first tries a pure vertical offset of the footer band.

### 6.1 Expectations shared by every Home cell (all brands, modes, viewports, audiences)

- No divider under the hero or above "Active seasons".
- Hero: flat (no gradient). In every **dark** capture the hero is dark (never ivory), in the colours of 3.3.
- Update: date "Jan 31, 2026"; title at the brand's page-title size; body as today; in open brands no card fill or ring.
- "Create a league" at section-title size; full-width New league.
- "Active seasons" in sentence case.
- `home-logged-out`: the seasons card reads "Log in to see your active seasons." with a secondary "Log in" button.
- `home-logged-in`: "See all" ghost button at the end of the heading row; two season cards; chips per 03 (E and F now read "Draft Live", "Draft Not Started").
- `home-new-user`: dashed box with the new wording; no "See all".
- Header band pixel-identical to the baseline.

### 6.2 Per brand

| Cells                                                                               | What the reviewer sees in the content region                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: `home-logged-out`, `home-logged-in`, `home-new-user` light desktop (layout tier) | Hero at the top of the left column: #26231f, radius 14, padding 32, soft shadow, no ring; Cinzel 44 px "Fantasy Oscars" on one line in #f3eee3; Inter 18 px tagline in #a89f8e. Update card below with padding 24. Side column: create card, then heading row and seasons                    |
| A: same, light mobile                                                               | Hero full width, padding 24/16, Cinzel 32 px on two lines; then update, create card, seasons                                                                                                                                                                                                 |
| A: `home-logged-in` dark desktop and mobile (layout tier)                           | **The owner's fix:** the hero is #26231f on the #12110f page with a 1 px #6b5a2a edge, ink #f3eee3, tagline #a89f8e; one step brighter than the #1c1a17 cards, not an ivory card                                                                                                             |
| B: `home-logged-out`, `home-logged-in` dark desktop                                 | Velvet #6e1a26 masthead across the full content width, radius 6, 1 px #8e2a3a ring; Playfair 600 68 px on one line in #f7f0ea; Playfair italic 18 px tagline. Below: update text directly on the page (no card), side column with a 1 px #3a2a2d rule on its left edge, create card, seasons |
| B: same, dark mobile                                                                | Velvet panel, 46 px, two lines; update on the page; a 1 px rule above the side column                                                                                                                                                                                                        |
| C: `home-logged-out`, `home-logged-in` light desktop                                | Centred Bodoni 600 72 px title with no panel, Bodoni italic tagline centred, a 3 px double ink rule across the full width under it. Update on the page; side column separated by a 3 px double ink rule; create card with 1 px ink ring, square                                              |
| C: same, light mobile                                                               | Centred 46 px, two lines; double rule; update on the page; double rule above the side column                                                                                                                                                                                                 |
| D: `home-logged-out`, `home-logged-in` dark desktop                                 | Barlow Condensed 700 uppercase **148 px "FANTASY OSCARS" on one line**, no panel, Bodoni italic tagline in #a3a3a3, a 2 px #f2f2f2 rule across the full width. Update on the page; 1 px #2e2e2e rule left of the side column; create card square                                             |
| D: same, dark mobile                                                                | 69 px, two lines ("FANTASY" / "OSCARS"), nothing clipped; 2 px rule; update; 1 px rule above the side column                                                                                                                                                                                 |
| E: `home-logged-out`, `home-logged-in` light desktop                                | Hero tile #181816, radius 20, no edge, Archivo 800 64 px on one line. Create card is a **laurel #1f6b4a tile** with white title and text and a white pill button with laurel text. Update and seasons in flat #f5f5f2 cards                                                                  |
| E: same, light mobile                                                               | 49 px, two lines; laurel tile after the update                                                                                                                                                                                                                                               |
| F: `home-logged-out`, `home-logged-in` light desktop                                | Teal #0c6e6e masthead, radius 24, 2 px ink outline and 5 px offset; centred Fraunces 800 84 px on one line in #fff6e5; centred Playfair italic tagline. Update and side-column cards with ink outlines                                                                                       |
| F: same, light mobile                                                               | 47 px, two lines, centred                                                                                                                                                                                                                                                                    |
| G: `home-logged-out`, `home-logged-in` light desktop                                | Hero #221718, square, 6 px white inner band and 1 px ink frame, Plex Mono 600 50 px. Create card: a cherry elliptical pencil ring behind the New league button, tilted, crossing the button's corners but never its label                                                                    |
| G: same, light mobile                                                               | 38 px, two lines; ring intact inside the card, no horizontal scroll                                                                                                                                                                                                                          |

### 6.3 Specimen tier

The hero cell (and everything below it in the Cards section, shifted) changes in all 21 specimen captures in step 0: flat hero in the brand's surface; in every **dark-desktop** specimen the hero is dark (this is where each brand's dark hero gets a baseline). In each brand's own step its three specimen captures change again in the hero cell only (size, alignment, tagline face). The specimen's update and action cards do not change (Home-only treatments are scoped to `.baseline-landing`).

### 6.4 Non-primary modes, 768 and states (no new baselines)

No baseline is added (the count stays 122). A brand's non-primary mode (B and D light; C, E, F, G dark) is verified by: the specimen's dark-desktop hero (6.3); the assertion tier (axe contrast on Home for every brand × mode × viewport; no new findings); the computed table in 3.6; and **gallery-only captures** the builder takes and does not commit:

- `home-logged-in` in each brand's non-primary mode, desktop and mobile (12 images);
- `home-logged-in` at 768 × 1024 in each brand's primary mode (7);
- refined-gold desktop and mobile with route rewrites: a 61-character hero title and a 300-character tagline; `landing_blurb` aborted (fallback tagline); `home_main` aborted (error and Try again); seasons aborted; a 70-character unbroken league name (8).

`home-new-user` gets no per-brand cells: it differs from `home-logged-in` only in the side column, whose `EmptyState` is in every brand's specimen, and the layout tier covers its structure.

### 6.5 Assertion tier

No new allowlist entries for Home. In particular: the hero title never overflows at 390 in any brand (D's 69 px "FANTASY" is 222 of 288 px); "See all", "Log in" and "Try again" are at least 44 px tall at 390; the grease ring creates no overlap finding (pseudo-element, `pointer-events: none`); the laurel tile passes axe (6.44).

## 7. Escalations

### (a) Owner

| #   | Question                                                                                                                                                                                                                                                                               | Recommendation and default                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a1  | Four boards (B, E, F, G) put create-league and seasons before the update on phone. Moving the side column above the update for **every** brand would let returning members reach their seasons without scrolling past the update. It changes what Home shows first, so it is your call | Keep today's order in this package (default, built). If you want it, it is a one-line DOM order change in `LandingLayout` for all brands, done as a follow-up with its own layout-tier diff                                                                     |
| a2  | Phone countdown (carried from chunk 9): in the red phase the clock text stays dark ink, 3.31:1 on #b34b42 in refined-gold (16 px black text needs 4.5)                                                                                                                                 | Ink flips with the fill: light #f7f8fc on red (4.94), dark on gold. This is the default and is fixed in 0b (item 5); the alternative (one constant ink) cannot pass on both fills                                                                               |
| a3  | Countdown ring on light pages (carried): the inner ring is inside the buckle or bar, so on an ivory page the buckle's outer edge is soft (gold vs page 1.98)                                                                                                                           | No change (default). The cue is the glyph, the words and the inner ring, each at least 4.94:1 against the fill they sit on; the buckle sits in the header, whose shape is not a control boundary. Add an outer `ruleStrong` ring only if you see it fail in use |
| a4  | Suggestion, outside this package: at 390 the shell uses 80 % of the width (288 px content, 51 px margins). Using the full width minus the 12 px gutter (366 px) would give every phone screen 27 % more room                                                                           | Yes, as its own small package (every layout-tier phone baseline changes). Hero sizes here scale with the container and need no change                                                                                                                           |

### (b) Designer

1. **Dark heroes for E and G.** The dark boards invert both heroes to light panels; the owner's rule is that a dark-mode hero stays dark. Please confirm the built versions (E: #181816 tile with a 1 px laurel edge; G: #221718 print with a 6 px #4a3537 inner band and an ink frame) or propose dark-mode alternatives that stay dark.
2. **One reading order for all brands.** B's CTA inside the band, and E, F and G's create-before-update order, cannot be built while every brand shares one DOM and focus order. Please accept the shared order (hero, update, create league, active seasons) for these boards, or propose a single order that all seven boards can use.
3. **Hero two-tone.** Five boards style the hero's second word, but the hero title is admin-authored and can be any length. Please accept single-tone hero titles (the header wordmark keeps the two-tone mark), or describe a treatment that works for any title.

## 8. Build notes

### 8.1 Files likely touched

- `theme/brands/contract.ts` (remove `homeLayout`; add `HomeSlots` and enums; `SHADOW_SLOTS` + `"hero"`; `TypeSlots.accentFont/accentStyle`), `css.ts` (derived declarations 3.2), the seven brand files, `stacks.ts` (none new), `fontCatalog.ts` (italic Playfair if not catalogued as italic).
- `apps/web/tests/unit/brand/brandContract.test.ts` (replace the `homeLayout` check; enum checks; `heroFit` in 8–30; `heroMax` px; contrast assertions: darkPanel brands dark `text`/`muted` vs dark `surface` ≥ 4.5; accentPanel brands light `page` and its 0.9 mix vs light `accent` ≥ 4.5), the css.ts snapshot test, `fonts.test.ts` (new faces).
- `primitives/layouts/LandingLayout.tsx`, `primitives/baseline.css`, `styles.css` (hero Title rule at ~260).
- `features/home/screens/LandingScreen.tsx`, `app/pages/HomePage.tsx` (pass `refresh`), `decisions/landing.ts` (+ tests: `titleCase`, `computeHeroTitleTier`, `formatUpdateDate`, `HERO_FALLBACK_TAGLINE`), `ui/Title.tsx`, `ui/MarkdownRenderer.tsx` (+ test for `headingBase`).
- `docs/architecture/brands.md` (3.1).

### 8.2 Step 0: shared mechanism, refined-gold final, dark-hero fix (A–D session, first)

1. Contract and generator: 3.1–3.2, with **refined-gold's final values** and B–G's **step-0 values** (3.4). Unit tests as 8.1.
2. `LandingLayout` three slots and the grid (4.1). `LandingScreen` restructured into `hero`, `updates`, `aside`; dividers removed.
3. Hero (4.2): flat surface from derived properties, scheme blocks deleted, container sizing, tiers, tagline face, loading and error states.
4. Update (4.3), create card (4.4, `card` path only; `primary` CSS waits for step E), seasons (4.5), headings (4.6), inventory fixes (4.9), marginal improvements M1–M15 (section 9).
5. `brands.md`.

Cells changed (regions):

| Layer           | Cells                                                                                                                | Regions                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Layout          | `home-logged-out`, `home-new-user` light desktop and mobile; `home-logged-in` light and dark, desktop and mobile (8) | content; footer band shifts                 |
| Brand-screens   | `home-logged-out`, `home-logged-in` × B, C, D, E, F, G × desktop and mobile (24), at interim composition             | content; footer band shifts                 |
| Specimen        | all 21                                                                                                               | hero cell, and the rest of the page shifted |
| Everything else | unchanged (`maxDiffPixels: 0`)                                                                                       |                                             |

Header-height dependency: none introduced. If another change alters a brand's header height in the same PR, every Home cell's content shifts; triage with the offset search.

### 8.3 Steps B, C, D (A–D session, after step 0; any order)

Each step sets the brand's final `home` values (3.3) and `accentFont`/`accentStyle`, and adds its font face.

| Step | Values                                                           | Faces                       | Cells changed (regions)                                                                                                      |
| ---- | ---------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| B    | masthead, start, 68px / 18, regions open; accent Playfair italic | Playfair Display italic 400 | `red-carpet-dark-*` of `home-logged-out`, `home-logged-in` (4): whole content region. Specimen `red-carpet-*` (3): hero cell |
| C    | masthead, center, 72px / 16, regions open; accent Bodoni italic  | none                        | `ballot-light-*` of both Home screens (4): whole content region. Specimen `ballot-*` (3): hero cell                          |
| D    | masthead, start, 148px / 24, regions open; accent Bodoni italic  | Bodoni Moda italic 400      | `noir-dark-*` of both Home screens (4): whole content region. Specimen `noir-*` (3): hero cell                               |

Step A is part of step 0 (refined-gold's values land with the mechanism, since its layout-tier cells change there anyway). The A–D session ends with the gallery captures for A–D (6.4).

### 8.4 Step 0b: carried items outside Home (independent; A–D session, any time)

| #   | Item                                                          | Pointer                                                                                                                                                                                                | Fix                                                                                                                                                                                                                                                                                   | Acceptance                                                                                                                                                                                                                                                  | Layers                                                                                 |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Phone keyboard drafting                                       | `features/draft/screens/mobile/MobileDraftRoom.tsx:206` (`isKeyboardMode={false}`, `setKeyboardMode={() => {}}`, `firstPillRef={null}`)                                                                | Hold `keyboardCategoryId` in `MobileDraftRoom` state and pass it as `DraftMasonryBoard` does (`isKeyboardMode={id === c.id}`, `setKeyboardMode`, a first-pill ref per card). Enter or Space on a pill opens the nominee sheet (the phone's arm step); the sheet's Draft button drafts | At 390 with a keyboard: Tab reaches a category title row; Enter focuses its first pill; Tab and Shift+Tab stay within the category; Enter opens the sheet with focus inside; Escape closes it and returns focus to the pill. Unit test for the state wiring | none (focus states are not captured); functional QA                                    |
| 2   | Member 403s on the season page (the draft room's back link)   | `orchestration/seasons/seasonOrchestration.ts` 64–90 (`/seasons/:id/invites`) and `orchestration/seasons/loadLeagueContextForSeason.ts:71` (`/leagues/:id/members`), both commissioner-only in the API | Read the season members first, derive "can manage" with a pure decision (viewer's season or league role is OWNER or CO_OWNER, or super admin), and request invites and league members only then; otherwise use `[]`                                                                   | As `blake`, opening `/seasons/:id` and going to and from the draft room makes no 403 request; as `avery` the participants and invites modals work as before. Unit test for the decision                                                                     | none                                                                                   |
| 3   | Phone toasts cover the draft rail bar                         | `ui/AppProviders.tsx:18` (`position="bottom-right"`), `.dr-mobileBottomBar`                                                                                                                            | `body:has(.dr-mobileBottomBar) .mantine-Notifications-root[data-position^="bottom"] { bottom: calc(<bar height token> + var(--fo-space-xs) + env(safe-area-inset-bottom)) }`; add a `--fo-db-mobileBottomBar-height` token if the bar has none                                        | At 390 in the draft room a pick-failure toast and the confirm toast sit fully above the bar; the bar stays operable                                                                                                                                         | none                                                                                   |
| 4   | Stepper active bar sits left of the icon column               | `styles.css` `.wizard-step.is-active::before` (~4350)                                                                                                                                                  | Give `.wizard-step` `padding-inline-start: calc(<bar width> + var(--fo-space-8))` and keep the bar at `inset-inline-start: 0`, so the bar has its own column and every step's icon moves by the same amount                                                                           | Bar's right edge 8 px left of every icon's left edge; icons aligned in one column                                                                                                                                                                           | layout: `admin-ceremony-nominees` light desktop and mobile (stepper region)            |
| 5   | Phone countdown clock ink on red                              | `styles.css` 480–600 (`.drm-clockText`, `.drm-miniNumber`, `.drm-miniLabel`, glyph, icon buttons)                                                                                                      | Find the element still painted with `--brand-on-primary` in `.pulse-red` and give it `--fo-danger-on` (a2 default). The ring needs no change (a3 default)                                                                                                                             | Red phase: every glyph and text in the bar is #f7f8fc on #b34b42 (4.94)                                                                                                                                                                                     | layout: `draft-live-countdown` light mobile (bar region), if the captured phase is red |
| 6   | 03 §6.3 omits the auth card corners                           | `docs/design/prescriptions/03-component-treatments.md` §6.3, first bullet                                                                                                                              | Change it to: "Any `login` and `register` cell, except the footer band and the auth card's corners (radius-md, 4.9)."                                                                                                                                                                 | Doc only                                                                                                                                                                                                                                                    | none                                                                                   |
| 7   | Long username truncated on `draft-completed` with no recourse | `.dr-card-title`, `.drh-buckleCenter`, `.drm-podiumText` renderers in `features/draft`                                                                                                                 | Put the full username in `title` on the truncating element (or its closest wrapper); the accessible name already carries it. Then delete the three `clipped-text` entries for `draft-completed` in `tests/visual/assertions/allowlist.ts`                                             | Hover shows the full name; assertion tier passes without those entries                                                                                                                                                                                      | assertion tier only (no pixels)                                                        |

### 8.5 Steps E, F, G (E–G session)

| Step | Work                                                                                                                                                                                 | Faces                       | Cells changed (regions)                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E    | The `ctaSurface: primary` CSS (4.4), then festival's values: column, start, 64px / 19, cards, **primary**; accent Instrument Sans normal                                             | none                        | `festival-light-*` of both Home screens (4): hero card and create card; the update and seasons shift. Specimen `festival-*` (3): hero cell                                                             |
| F    | technicolor's values: masthead, center, 84px / 18.5, cards; accent Playfair italic                                                                                                   | Playfair Display italic 400 | `technicolor-light-*` (4): whole content region. Specimen `technicolor-*` (3): hero cell                                                                                                               |
| G    | The `.baseline-ctaMark` wrapper and ring (4.4), then lightbox's values: column, start, 50px / 15, cards; accent Archivo normal. Check A–F show no ring and no extra padding (deco 0) | none                        | `lightbox-light-*` (4): hero card and create card; the update and seasons shift. Specimen `lightbox-*` (3): hero cell. **Must not change** any other brand's cell (the wrapper is zero-size at deco 0) |

The E–G session ends with the gallery captures for E–G (6.4).

### 8.6 Order and risks

Order: 0 → 0b (independent) → B, C, D → (next session) E, F, G.

- **Container sizing.** `cqi` needs the hero to get its width from its parent. Grid areas and the specimen's flex column both give a definite width; never put the hero in a shrink-to-fit parent, or inline-size containment collapses it.
- **Custom property holding `grid-template-areas`.** The generator must emit the quotes verbatim; the css.ts snapshot catches mistakes.
- **Explicit-mode slots in derived values** (`--brand-dark-surface`, `--brand-light-accent`) resolve on the root, as `--brand-nav-indicator` already does; they must exist in both mode blocks (they do).
- **Interim composition** for B–G between step 0 and their steps is visible only in the suite (brands disabled). A merged A–D PR carries E–G at interim values; that is expected.
- **Fonts.** Three new face files (Playfair italic, Bodoni italic) are downloaded only on Home in those brands. Check the bundle budget script ignores or allows font assets.
- **Specificity.** The E tile's inverted button must beat the 03 primary skin's `!important` variables; scope with `.baseline-landing .baseline-actionCard` plus the skin's own selector.
- **Removing `homeLayout`** touches every brand file and a unit test; the inventory and `brands.md` must not mention it afterwards (cartographer after the package).
- **Date format** depends on the browser locale; Playwright's default is `en-US`, so captures read "Jan 31, 2026".
- **Ready signal.** `home-logged-out` waits for "Fantasy Oscars", which the wordmark also matches. The suite already waits for in-flight requests, so the blurb has loaded; if a capture ever shows the tagline skeleton, change the ready text to the tagline.

## 9. Marginal improvements (all brands, same structure)

| #   | Current state                                                                                                                          | Change                                                                                       | Reason (user benefit)                                                                              | Cells affected                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| M1  | Two h1s; update title h4 below an h3; markdown headings can outrank the card                                                           | Hero h2, update and create titles h3, markdown headings h4 and below (4.6)                   | Screen-reader users get one page title and a correct outline                                       | none (structure only)                       |
| M2  | The update title is a 14 px card title; "Create a league" likewise                                                                     | Update title at `h2Size`, create title at `h3Size`                                           | The latest update reads as the lead item; hierarchy matches every board                            | all Home cells (content)                    |
| M3  | Plain dividers between stacked cards                                                                                                   | Removed; spacing or the brand's rules separate regions                                       | Less visual noise; one rhythm                                                                      | all Home cells (content)                    |
| M4  | `titleCase` never splits, so chips read "Draft live" in brands without uppercase labels                                                | Fixed split                                                                                  | Consistent chip labels                                                                             | E and F `home-logged-in` (chips)            |
| M5  | A long league name in the nowrap meta row can push the chip out                                                                        | Name wraps under itself; chip never shrinks                                                  | Long names stay readable and the status stays visible                                              | gallery capture only (seed names are short) |
| M6  | Home shows two seasons and no way to the rest                                                                                          | "See all" ghost button (name "See all seasons") in the heading row, to `/seasons`            | A direct path from the preview to the full list                                                    | `home-logged-in` (heading row)              |
| M7  | Signed out, the seasons card is a dead sentence; at 390 the header has no Log in button                                                | Sentence plus a secondary "Log in" button                                                    | A visible way in on phone                                                                          | `home-logged-out`                           |
| M8  | Signed-out New league goes to login and then drops the user on Home                                                                    | Passes `state.from = "/leagues/new"`                                                         | After logging in the user lands where they meant to go                                             | none (behaviour)                            |
| M9  | Update and seasons errors are bare text with no retry                                                                                  | `PageError` (glyph, alert role) plus "Try again"                                             | Errors look like errors and are recoverable without a reload                                       | gallery capture only                        |
| M10 | The hero shows no tagline while loading and silently on failure                                                                        | Skeleton while loading; fallback tagline on error                                            | No layout jump; never an empty-looking hero                                                        | gallery capture only                        |
| M11 | While the session loads, signed-in users briefly see the signed-out card; the skeleton shows three cards when at most two appear       | Two-card skeleton during session and seasons loading                                         | No "Log in" flash; the placeholder matches the result                                              | none captured                               |
| M12 | Dates in browser short format ("1/31/2026", ambiguous across locales); the empty state shows today's date as if it were a publish date | Medium date in a `<time>` element; no date on the empty state                                | Unambiguous, and no fake date                                                                      | all Home cells (date line)                  |
| M13 | "Active Seasons" in title case while other section titles use sentence case                                                            | "Active seasons"                                                                             | Consistent labels                                                                                  | all Home cells (heading)                    |
| M14 | Long URLs or words in an update can overflow the card                                                                                  | The update body wraps anywhere                                                               | No horizontal scroll on phone                                                                      | none captured (seed has no long URL)        |
| M15 | Empty seasons says only "No active seasons yet."                                                                                       | "No active seasons yet. Start one with New league, or accept an invite from a commissioner." | Tells a new user the two ways to get started, using controls already on the page and in the header | `home-new-user`                             |
