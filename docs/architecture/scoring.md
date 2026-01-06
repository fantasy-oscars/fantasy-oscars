# Scoring strategies

- **Fixed (default)**: +1 point for each winning pick, ignores `results.points`.
- **Negative**: +points for winners, -points for non-winners. If `results.points` is provided per nomination, that magnitude is used; otherwise defaults to 1.
- Strategies are resolved via `scoreDraft` options:
  - `scoreDraft({ picks, results })` → fixed
  - `scoreDraft({ picks, results, strategyName: "negative" })` → negative
  - or pass a custom `strategy` implementing `{ score({ picks, results }) }`.
