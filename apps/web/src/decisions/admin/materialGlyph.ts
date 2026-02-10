export function materialGlyph(code: string | null | undefined) {
  const raw = (code ?? "").trim();
  if (!raw) return "";
  if (/^[0-9a-f]{4}$/i.test(raw)) return String.fromCharCode(Number.parseInt(raw, 16));
  return raw;
}
