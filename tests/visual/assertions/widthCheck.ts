import type { Page } from "@playwright/test";
import { ROOM_WORK_FONTS } from "../../../apps/web/src/theme/brands";
import { MONTSERRAT_FACE_CSS } from "./stressRuns";

// The working-text width check of docs/design/prescriptions/06, section 5.6, run in
// real Chromium so ROOM_WORK_FONTS can never drift from the rule.

/** The stress theme's work font: measured and reported apart from the shipped list. */
export const STRESS_WORK_FONT = "Montserrat";
export const WIDTH_REFERENCE = "Inter";
export const SENTENCE = "Saint Marguerite of the Docks";
export const CAPITALS = "DRAFT HISTORY";

/** Bounds of 5.6. */
export const WIDTH_RULES = {
  sentenceMin: 0.85,
  sentenceMax: 1.1,
  capitalsMax: 1.1,
  xHeightMin: 0.49,
  xOverCapMax: 0.8
} as const;

export type FontMeasure = {
  family: string;
  /** Face files of the family that finished loading for weight 500 (zero means a fallback would be measured). */
  loadedFaces: number;
  /** True when the family's glyphs, not a fallback's, were measured. */
  isTheFamily: boolean;
  sentenceWidth: number;
  capitalsWidth: number;
  /** Heights in em at 100 px. */
  xHeight: number;
  capHeight: number;
};

export type WidthRow = FontMeasure & {
  sentenceRatio: number;
  capitalsRatio: number;
  xOverCap: number;
  problems: string[];
};

/** Measures families at 100 px, weight 500, kerning on, after loading them. Runs in the page. */
export async function measureFonts(
  page: Page,
  families: readonly string[]
): Promise<FontMeasure[]> {
  return page.evaluate(
    async ([names, sentence, capitals]) => {
      const sample = `${sentence} ${capitals} xH`;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) throw new Error("no 2d canvas");
      const measure = (css: string, text: string) => {
        ctx.font = css;
        ctx.fontKerning = "normal";
        ctx.letterSpacing = "0px";
        return ctx.measureText(text);
      };
      const covers500 = (weight: string) => {
        const [lo, hi = lo] = weight.split(/\s+/).map(Number);
        return lo! <= 500 && 500 <= hi!;
      };
      const out = [];
      for (const family of names) {
        const spec = `500 100px "${family}"`;
        await document.fonts.load(spec, sample);
        await document.fonts.ready;
        const loadedFaces = Array.from(document.fonts).filter(
          (f) =>
            f.family.replace(/["']/g, "") === family &&
            f.status === "loaded" &&
            covers500(f.weight)
        ).length;
        // A missing family is drawn in the fallback, which differs between serif and monospace.
        const isTheFamily =
          measure(`${spec}, serif`, sample).width ===
          measure(`${spec}, monospace`, sample).width;
        out.push({
          family,
          loadedFaces,
          isTheFamily,
          sentenceWidth: measure(spec, sentence).width,
          capitalsWidth: measure(spec, capitals).width,
          xHeight: measure(spec, "x").actualBoundingBoxAscent / 100,
          capHeight: measure(spec, "H").actualBoundingBoxAscent / 100
        });
      }
      return out;
    },
    [families, SENTENCE, CAPITALS] as const
  );
}

/** Adds the pinned Montserrat to the page, as the stress theme does. */
export async function addStressFont(page: Page) {
  await page.addStyleTag({ content: MONTSERRAT_FACE_CSS });
}

/** Judges measured families against Inter, which must be the first measure. */
export function judgeWidths(measures: readonly FontMeasure[]): WidthRow[] {
  const reference = measures.find((m) => m.family === WIDTH_REFERENCE);
  if (!reference) throw new Error(`${WIDTH_REFERENCE} was not measured`);
  const r = WIDTH_RULES;
  return measures.map((m) => {
    const sentenceRatio = m.sentenceWidth / reference.sentenceWidth;
    const capitalsRatio = m.capitalsWidth / reference.capitalsWidth;
    const xOverCap = m.xHeight / m.capHeight;
    const problems: string[] = [];
    if (m.loadedFaces === 0 || !m.isTheFamily)
      problems.push("the family did not load, so a fallback was measured");
    if (sentenceRatio < r.sentenceMin || sentenceRatio > r.sentenceMax)
      problems.push(
        `sentence width ${sentenceRatio.toFixed(3)} is outside ${r.sentenceMin} to ${r.sentenceMax}`
      );
    if (capitalsRatio > r.capitalsMax)
      problems.push(
        `capitals width ${capitalsRatio.toFixed(3)} is over ${r.capitalsMax}`
      );
    if (m.xHeight < r.xHeightMin)
      problems.push(`x-height ${m.xHeight.toFixed(3)} em is under ${r.xHeightMin}`);
    if (xOverCap > r.xOverCapMax)
      problems.push(
        `x-height over cap height ${xOverCap.toFixed(2)} is over ${r.xOverCapMax}`
      );
    return { ...m, sentenceRatio, capitalsRatio, xOverCap, problems };
  });
}

/** The families the check measures: Inter (reference), the shipped list, then the stress font. */
export const WIDTH_CHECK_FAMILIES = [
  ...new Set([WIDTH_REFERENCE, ...ROOM_WORK_FONTS, STRESS_WORK_FONT])
];

export function formatWidthTable(rows: readonly WidthRow[]): string {
  const head = "Font              | lc ratio | caps ratio | x-height | x/cap | result";
  const lines = rows.map(
    (row) =>
      `${row.family.padEnd(17)} | ${row.sentenceRatio.toFixed(3).padStart(8)} | ${row.capitalsRatio.toFixed(3).padStart(10)} | ${row.xHeight.toFixed(3).padStart(8)} | ${row.xOverCap.toFixed(2).padStart(5)} | ${row.problems.length === 0 ? "pass" : `FAIL: ${row.problems.join("; ")}`}`
  );
  return [head, ...lines].join("\n");
}
