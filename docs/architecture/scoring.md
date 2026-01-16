# Scoring strategies

- **Fixed (default)**: +1 point for each winning pick, ignores `results.points`.
- **Negative**: +points for winners, -points for non-winners. If `results.points` is provided per nomination, that magnitude is used; otherwise defaults to 1.
- Strategies are resolved via `scoreDraft` options:
  - `scoreDraft({ picks, results })` → fixed
  - `scoreDraft({ picks, results, strategyName: "negative" })` → negative
  - or pass a custom `strategy` implementing `{ score({ picks, results }) }`.

## Results ingestion + standings

- Ceremony winners are entered centrally (admin-only) and stored in `ceremony_winner` (one winning `nomination_id` per `category_edition`).
- Standings are derived from ceremony winners for the draft’s season/corresponding ceremony; all drafts for that ceremony see the same winners.
- `GET /drafts/:id/standings` recomputes on demand using the season’s scoring strategy, returning draft state, per-pick results (won/lose), and per-seat points.
