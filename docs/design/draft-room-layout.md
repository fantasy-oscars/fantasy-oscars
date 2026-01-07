# Draft Room Layout Constraints

Milestone: Playable Draft MVP  
Scope: Layout constraints only (not a full design system spec)

## Density Assumptions

- Desktop-first grid with two primary columns in the draft view: left = summary + seats, right = picks + actions. Keep total width under ~1100px to avoid horizontal scroll on common laptop widths.
- Nominee pill baseline from #41: single-line truncation; pill height ~36–40px; horizontal padding ~12px; icon/flag optional without changing height.
- List density: pick list and seat list use 8–12px vertical spacing; avoid card-within-card padding bloat.
- Status/pill rows should remain readable at 14–16px body text; headings 16–18px; avoid larger than 20px in the draft panel to preserve density.

## Non‑Negotiable Sizing Constraints

- **Seat list**: row height ≤ 44px; text truncates, not wraps. Seat number + member id/name must fit within ~220px container.
- **Pick list**: each pick row height ≤ 48px; pick number, seat, nomination id/name on a single line with ellipsis for long names.
- **Nominee pills**: height 36–40px; max width ~240px before truncation; must remain stable when state changes (default/active/picked/disabled).
- **Control cluster**: Load/Refresh/Start/Pick buttons stay on a single line on ≥1024px; buttons max width 140px; min touch target 40px height.
- **Draft summary**: status + current pick text fits within 320px width; no wrapping of the “Current pick / Version” line.
- **Error/success toasts** (inline status blocks): max height 2 lines; text truncates; avoid pushing core controls below the fold.

## Interaction Notes

- Start Draft: only visible when snapshot status = PENDING; stays above the fold in the summary area; shows inline success/error state without navigating away.
- Pick entry: nomination id input + submit button on one line at desktop; stack vertically on <640px.
- Refresh/Retry actions must remain visible without scrolling the pick list.

## Mobile/Responsive Guardrails (MVP)

- Below 768px: stack columns (summary/seats above picks/actions); maintain 16px outer padding.
- Text sizes may drop to 14px; keep buttons ≥40px height and full‑width within their stacked section.

## Accessibility/Robustness

- All truncation uses `text-overflow: ellipsis`; no hidden content without a tooltip or title attribute.
- Avoid horizontal scroll in the draft card; vertical scroll is acceptable inside pick lists.
