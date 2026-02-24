# Typography (Web)

Goal: keep the UI readable and consistent by using a small, explicit set of
semantic typography variants. Content chooses variants; the system chooses the
exact styling.

## Font Families (Hard Rule)

Only two font families are used:

- Serif (Cinzel): used ONLY for headings/titles and brand text.
- Sans (Inter): used for everything else.

If a string is not a title/header, it MUST be sans.

## Allowed Typography Variants

These are the only variants we use in the UI.

### Title Variants (serif)

Use `@ui/Title` with `variant=...`.

- `brand`: app name / wordmark
- `hero`: hero title only
- `page`: page titles
- `section`: section headers
- `card`: card titles and update headlines

### Text Variants (sans)

Use `@ui/Text` with `variant=...`.

- `body`: default body copy
- `meta`: dates, commissioner names, ceremony names in meta lines, status pill text
- `helper`: short helper line under headings (hero tagline, form helper copy)
- `muted`: rare de-emphasized informational copy (still body-sized)
- `danger`: inline errors only
- `success`: rare inline confirmations only
- `chromeHeading`: chrome/footer section labels (small, tracked, uppercase)
- `chromeFineprint`: footer fineprint and other small legal text

## Notes & Constraints

- Feature code should not use ad-hoc typography props (`size`, `fz`, `fw`, `c`)
  for hierarchy. If a new variant is needed, add it intentionally here and in
  the theme/CSS mapping.

## Legacy Note

Some older pages still use baseline CSS classes. Those should be migrated to
variants over time; do not introduce new baseline typography classes.

## Examples

```tsx
import { Text, Title } from "@ui";

<Title variant="page">Leagues</Title>
<Text variant="helper">Create and manage leagues.</Text>

<Title variant="section">Active Seasons</Title>
<Title variant="card">Create a league</Title>

<Text>Body copy stays default.</Text>
<Text variant="meta">Updated Jan 31, 2026</Text>
```
