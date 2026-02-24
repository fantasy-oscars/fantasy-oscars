export function summarizeCandidateDataset(dataset: unknown): { films: number } {
  const films = Array.isArray((dataset as { films?: unknown[] })?.films)
    ? ((dataset as { films?: unknown[] }).films?.length ?? 0)
    : Array.isArray(dataset)
      ? dataset.length
      : 0;
  return { films };
}
