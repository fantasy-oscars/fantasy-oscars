import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { foTokens } from "@/theme/tokens";

const WEB_ROOT = path.resolve(__dirname, "../../..");
const CIRCUIT_UI = path.join(WEB_ROOT, "src/features/circuitLeagues");
const STYLES = readFileSync(path.join(WEB_ROOT, "src/styles.css"), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/** Innermost CSS rules (comments stripped), so `@media` blocks are read too. */
function cssRules(css: string): Array<{ selector: string; body: string }> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!.trim()
  }));
}

describe("standard contender pill width", () => {
  it("is one token, defined once", () => {
    const widths = Object.keys(foTokens).filter((key) =>
      key.startsWith("--fo-pill-width")
    );
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.length).toBeLessThanOrEqual(3);
    expect(STYLES).toMatch(
      /\.dr-pill\.dr-pill-standard\s*\{[^}]*width:\s*var\(--fo-pill-width\)/
    );
  });

  it("is taken by every full-season pill", () => {
    const offenders = sourceFiles(CIRCUIT_UI)
      .filter((file) => /["'`]dr-pill["'`]/.test(readFileSync(file, "utf8")))
      .filter((file) => !readFileSync(file, "utf8").includes("dr-pill-standard"))
      .map((file) => path.relative(WEB_ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("is not overridden by a screen's own pill width", () => {
    const widthDeclaration =
      /(^|;|\s)(width|min-width|max-width|flex|flex-grow|flex-basis)\s*:/;
    const offenders = cssRules(STYLES)
      .filter(
        ({ selector }) => selector.includes(".dr-pill") && !selector.includes(".mi-icon")
      )
      .filter(({ selector }) =>
        /circuit-|seasonRosterCard|fo-pillScope|season-/.test(selector)
      )
      .filter(({ body }) =>
        widthDeclaration.test(body.replace(/min-width:\s*0\s*;?/g, ""))
      )
      .map(({ selector }) => selector);
    expect(offenders).toEqual([]);
  });

  it("leaves no fixed rem column for a pill in a roster, points or staging row", () => {
    const offenders = cssRules(STYLES)
      .filter(({ selector }) =>
        /circuit-(rosterRow|contenderRow|stageRow)/.test(selector)
      )
      .filter(({ body }) => /grid-template-columns:[^;]*\d+(\.\d+)?rem/.test(body))
      .map(({ selector }) => selector);
    expect(offenders).toEqual([]);
  });
});

describe("staging row menu", () => {
  const rules = cssRules(STYLES);

  it("is revealed on row hover and focus, and is never removed from the tab order", () => {
    const base = rules.find((r) => r.selector.endsWith(".circuit-stageMenu"));
    expect(base?.body).toMatch(/position:\s*absolute/);
    expect(base?.body).toMatch(/opacity:\s*0/);
    expect(base?.body).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    const reveal = rules.find((r) => r.selector.includes(".circuit-stageRow:hover"));
    expect(reveal?.selector).toContain(".circuit-stageRow:focus-within");
    expect(reveal?.selector).toContain('[aria-expanded="true"]');
    expect(reveal?.body).toMatch(/opacity:\s*1/);
  });
});
