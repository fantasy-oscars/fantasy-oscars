# Draft Room Layout

This document captures the *structural* layout constraints for the draft room UI.
It is not a visual style guide.

## Core frame

- The draft room is full-width.
- The header and footer are fixed in-frame.
- The area between header and footer ("draft area") scrolls vertically.
- Each rail and each major body region should be able to scroll vertically *independently*.

## Unit grid (desktop)

We express horizontal layout in "units".

- A unit is: `frameWidth / divisor`
- Base divisor: `7.75`
- Minimum divisor before switching to a mobile layout: `4.75`

### Rails

There are three rails:

- Draft history (left)
- My roster (right)
- Auto-draft (rightmost)

Rail widths are expressed in units:

- Expanded: `1.25u`
- Collapsed: `0.25u`

With 3 rails expanded, the remaining center area is `4.0u` (four category columns).
Each time a rail collapses, exactly `+1.0u` is freed into the center area.

### Spacing (padding comes from allocation)

Spacing is subtracted from each unit's allocation (it is not additive).

For a reference padding of 10px:

- Left rail: subtract 5px from the **right** edge.
- Category columns: subtract 5px from **both** left and right edges (10px total).
- First right rail ("My roster"): subtract 5px from the **left** edge.
- Final right rail ("Auto-draft"): no horizontal padding subtraction.

Net effect:

- Gap between rails and the body is larger than the gap between body columns.
- Gap between columns is smaller and consistent.

## Category board (masonry)

- The board renders one category card per category.
- Category cards are placed into N columns using a masonry strategy:
  - Each card is placed at the top of the column with the lowest current height.
  - Column count is derived from available center units (rails expanded/collapsed).

## Responsive behavior (non-mobile)

- The header composition is independent from the body layout.
- When the header cannot fit the full control cluster, it switches to a compact header
  pattern (burger/gear), even if the body can still render multiple columns.

## Mobile layout (high level)

Mobile uses a different interaction model:

- Rails are opened via a 3-button bottom bar (one per rail).
- Only one rail is visible at a time on mobile; a selected rail fills the screen.
- With rails closed, categories render in a single column.
  - The mobile header becomes a compact top bar:
    - Left: burger menu
    - Middle: round/time/pick (time is emphasized)
    - Right: gear menu
