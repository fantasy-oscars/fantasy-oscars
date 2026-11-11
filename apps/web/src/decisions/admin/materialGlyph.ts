const DEFAULT_MATERIAL_ICON = "trophy";
const PRIVATE_USE_START = 0xe000;
const PRIVATE_USE_END = 0xf8ff;

export function materialGlyph(
  code: string | null | undefined,
  fallback: string = DEFAULT_MATERIAL_ICON
) {
  const raw = (code ?? "").trim();
  if (!raw) return fallback;
  if (/^[0-9a-f]{4}$/i.test(raw)) {
    // Material Symbols code points live in the Private Use Area. Words that happen to be
    // four hex letters ("face", "cafe", "fade") are ligature names, not code points.
    const codePoint = Number.parseInt(raw, 16);
    if (codePoint >= PRIVATE_USE_START && codePoint <= PRIVATE_USE_END) {
      return String.fromCharCode(codePoint);
    }
  }
  // Material Symbols ligature names are lowercase snake_case tokens.
  if (/^[a-z0-9_]+$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}
