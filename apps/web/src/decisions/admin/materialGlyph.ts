const DEFAULT_MATERIAL_ICON = "trophy";

export function materialGlyph(
  code: string | null | undefined,
  fallback: string = DEFAULT_MATERIAL_ICON
) {
  const raw = (code ?? "").trim();
  if (!raw) return fallback;
  if (/^[0-9a-f]{4}$/i.test(raw)) return String.fromCharCode(Number.parseInt(raw, 16));
  // Material Symbols ligature names are lowercase snake_case tokens.
  if (/^[a-z0-9_]+$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}
