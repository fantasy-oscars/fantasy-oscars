# Scoring strategies

- **Fixed (default)**: +1 point for each winning pick, ignores `results.points`.
- **Negative**: +points for winners, -points for non-winners. If `results.points` is provided per nomination, that magnitude is used; otherwise defaults to 1.
- Strategies are resolved via `scoreDraft` options:
  - `scoreDraft({ picks, results })` → fixed
  - `scoreDraft({ picks, results, strategyName: "negative" })` → negative
  - or pass a custom `strategy` implementing `{ score({ picks, results }) }`.

## Results ingestion + standings

- Results are stored per draft via `POST /drafts/:id/results` with payload:
  - `{ results: [{ nomination_id, won, points? }] }`
- Standings are computed via `GET /drafts/:id/standings`, returning draft state, results, and per-seat points + picks.
