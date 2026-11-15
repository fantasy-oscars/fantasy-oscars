import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { BRANDS, MODES, VIEWPORTS, type Mode } from "./matrix";
import {
  freezeClock,
  installNetworkGuards,
  selectAppearance,
  settle,
  switchAppearance,
  trackInFlight
} from "./support/page";
import { measureCell } from "./tolerances/measure";
import { usedFonts } from "./tolerances/fonts";
import { judgeCell, type AxeFinding, type Failure } from "./tolerances/judge";
import { allowanceMatches, TOLERANCE_ALLOWLIST } from "./tolerances/allowlist";
import { writeToleranceResult } from "./tolerances/results";

// Tolerance tier: the specimen measured in every brand, mode and viewport against the
// declarative spec (tolerances/spec.ts). One page per brand and viewport; the second
// mode is repainted in place. Every failure of a cell is reported in one message.
//
// Triage and the mutation pass, both inert unless set:
//   VISUAL_TOLERANCE_MUTATION       CSS text injected after the specimen loads, before it is
//                                   measured (a throwaway mutation: shrink a button, drop a
//                                   focus ring, swap a font). Use `!important`.
//   VISUAL_TOLERANCE_MUTATION_FILE  the same, read from a file.
//   VISUAL_TOLERANCE_DUMP           directory to write each cell's raw measurements to.

const SETTLE = { quietPolls: 3, networkIdle: false, pollMs: 60 } as const;

/** axe color-contrast over the hooked elements only, each node mapped back to its hook. */
async function axeFindings(page: Page): Promise<AxeFinding[]> {
  const results = await new AxeBuilder({ page })
    .include("[data-spec]")
    .withRules(["color-contrast"])
    .analyze();
  const out: AxeFinding[] = [];
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const selector = node.target[0];
      const owner =
        typeof selector === "string"
          ? await page.evaluate((sel) => {
              const hook = document.querySelector(sel)?.closest("[data-spec]");
              return hook
                ? [hook.getAttribute("data-spec"), hook.getAttribute("data-spec-state")]
                : null;
            }, selector)
          : null;
      out.push({
        hook: owner?.[0] ?? "unknown",
        state: owner?.[1] ?? "default",
        detail: `${node.failureSummary?.split("\n")[1]?.trim() ?? "contrast below threshold"} | ${node.html.slice(0, 80)}`
      });
    }
  }
  return out;
}

for (const brand of BRANDS) {
  for (const viewportName of ["desktop", "mobile"] as const) {
    test.describe(`tolerances ${brand.id} ${viewportName}`, () => {
      test.use({ viewport: VIEWPORTS[viewportName], colorScheme: MODES[0] });

      test("every component in range, both modes", async ({ page, context }) => {
        const blocked = await installNetworkGuards(context);
        await selectAppearance(context, brand.slug, MODES[0]);
        const inFlight = trackInFlight(page);
        await freezeClock(page);
        await page.goto("/__specimen");
        await page.locator('[data-specimen-ready="true"]').waitFor();

        const mutation =
          process.env.VISUAL_TOLERANCE_MUTATION ??
          (process.env.VISUAL_TOLERANCE_MUTATION_FILE
            ? (await import("node:fs")).readFileSync(
                process.env.VISUAL_TOLERANCE_MUTATION_FILE,
                "utf8"
              )
            : undefined);
        if (mutation) await page.addStyleTag({ content: mutation });

        const failures: Failure[] = [];
        for (const mode of MODES as readonly Mode[]) {
          if (mode !== MODES[0]) await switchAppearance(page, brand.slug, mode);
          await settle(page, inFlight, SETTLE);
          const cell = await measureCell(page);
          const fonts = await usedFonts(page, context, cell.samples);
          const axe = await axeFindings(page);
          failures.push(
            ...judgeCell(
              { brand: brand.id, mode, viewport: viewportName },
              cell,
              fonts,
              axe
            )
          );
          const dump = process.env.VISUAL_TOLERANCE_DUMP;
          if (dump) {
            mkdirSync(dump, { recursive: true });
            writeFileSync(
              path.join(dump, `${brand.id}-${mode}-${viewportName}.json`),
              JSON.stringify({ ...cell, fonts: [...fonts] })
            );
          }
        }

        const matched = new Set<number>();
        const open: string[] = [];
        const all: { message: string; allowlisted: boolean }[] = [];
        for (const failure of failures) {
          const index = TOLERANCE_ALLOWLIST.findIndex((a) =>
            allowanceMatches(a, failure.key)
          );
          if (index >= 0) matched.add(index);
          else open.push(failure.message);
          all.push({ message: failure.message, allowlisted: index >= 0 });
        }
        writeToleranceResult(`${brand.id}-${viewportName}`, {
          brand: brand.id,
          viewport: viewportName,
          matched: [...matched],
          failures: all
        });

        expect(blocked, "requests that left the machine").toEqual([]);
        expect(open, `${open.length} tolerance failures not in the allowlist`).toEqual(
          []
        );
      });
    });
  }
}
