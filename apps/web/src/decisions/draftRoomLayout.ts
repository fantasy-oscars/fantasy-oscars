export type MasonryItem = { estimatePx: number };

export function estimateCategoryCardHeightPx(pillCount: number) {
  // Intentionally approximate; it should remain stable across small style tweaks.
  const padY = 20; // top+bottom
  const title = 22; // line-height-ish
  const titleGap = 10; // space under title
  const pillH = 22;
  const pillGap = 6;
  const count = Math.max(1, pillCount);
  const pills = count * pillH + Math.max(0, count - 1) * pillGap;
  return padY + title + titleGap + pills;
}

export function computeMasonry<T extends MasonryItem>(colCount: number, items: T[]) {
  const cols: T[][] = Array.from({ length: colCount }, () => []);
  const heights = Array.from({ length: colCount }, () => 0);

  for (const item of items) {
    let minIdx = 0;
    for (let i = 1; i < heights.length; i += 1) {
      if (heights[i] < heights[minIdx]) minIdx = i;
    }
    cols[minIdx].push(item);
    heights[minIdx] += item.estimatePx;
  }

  return cols;
}

export function formatSignedInt(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n > 0) return `+${Math.trunc(n)}`;
  return String(Math.trunc(n));
}
