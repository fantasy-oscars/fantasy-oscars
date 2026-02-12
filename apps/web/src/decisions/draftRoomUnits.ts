const DRAFT_UNIT_MIN_PX = 140;
const DRAFT_UNIT_MAX_PX = 200;
const DRAFT_UNIT_TARGET_PX = 170;
const DRAFT_DIVISOR_MIN = 4.75; // three open rails (3.75) + one category column (1.0)
const DRAFT_DIVISOR_DEFAULT = 7.75;

export function buildAllowedDraftDivisors(args: { viewportWidthPx: number }) {
  // Ensure we include a divisor large enough to bring the unit under the max.
  const neededMax = args.viewportWidthPx / DRAFT_UNIT_MAX_PX;
  const maxDivisor = Math.max(
    DRAFT_DIVISOR_DEFAULT,
    DRAFT_DIVISOR_MIN + Math.ceil(Math.max(0, neededMax - DRAFT_DIVISOR_MIN))
  );

  const ds: number[] = [];
  for (let d = DRAFT_DIVISOR_MIN; d <= maxDivisor + 1e-6; d += 1) {
    ds.push(Number(d.toFixed(2)));
  }
  return ds;
}

export function pickDraftDivisor(viewportWidthPx: number) {
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0)
    return DRAFT_DIVISOR_DEFAULT;

  const candidates = buildAllowedDraftDivisors({ viewportWidthPx });
  const valid = candidates.filter((d) => {
    const u = viewportWidthPx / d;
    return u >= DRAFT_UNIT_MIN_PX && u <= DRAFT_UNIT_MAX_PX;
  });

  // If nothing fits, clamp toward the closest supported end. (Mobile layout is handled later.)
  if (valid.length === 0) {
    const uAtMin = viewportWidthPx / DRAFT_DIVISOR_MIN;
    if (uAtMin < DRAFT_UNIT_MIN_PX) return DRAFT_DIVISOR_MIN;
    return candidates[candidates.length - 1] ?? DRAFT_DIVISOR_DEFAULT;
  }

  // Choose the unit size closest to our target for visual stability.
  let best = valid[0]!;
  let bestDelta = Math.abs(viewportWidthPx / best - DRAFT_UNIT_TARGET_PX);
  for (const d of valid.slice(1)) {
    const delta = Math.abs(viewportWidthPx / d - DRAFT_UNIT_TARGET_PX);
    if (delta < bestDelta) {
      best = d;
      bestDelta = delta;
    }
  }
  return best;
}
