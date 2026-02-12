# Scoring strategies

Seasons choose one scoring strategy. Scoring is applied at the season level once
ceremony winners are known.

- **Standard** (`fixed`, default): +1 point for each winning nominee drafted.
- **Negative** (`negative`): -1 point for each winning nominee drafted (avoid-winner mode).
- **Category-weighted** (`category_weighted`): points are based on the season's
  per-category weights (integer, may be negative or zero).
  - Weights are constrained to `[-99, 99]`.
  - A positive weight awards points for drafting the winner in that category.
  - A negative weight penalizes drafting the winner in that category.
  - Zero means the category does not contribute to the total score.

## Results ingestion + standings

- Ceremony winners are entered centrally (admin-only) and stored in `ceremony_winner` (one winning `nomination_id` per `category_edition`).
- Standings are derived from winners for the season's ceremony; all seasons for that
  ceremony see the same winner set (subject to ceremony lifecycle).
- `GET /drafts/:id/standings` computes per-seat totals using the season's scoring strategy.

## Category weights (category-weighted scoring)

- Stored on the season as a map: `category_edition_id -> integer weight`.
- When switching a season into `category_weighted`, a safe default weight (1) is
  seeded for each ceremony category if explicit weights are not provided.
