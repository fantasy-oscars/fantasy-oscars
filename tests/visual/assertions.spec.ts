import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  BRANDS,
  MODES,
  type Mode,
  SCREENS,
  SPECIMEN_SCREEN,
  VIEWPORTS,
  type ViewportName
} from "./matrix";
import { ALLOWLIST, entryMatches } from "./assertions/allowlist";
import { RESULTS_DIR, type ResultFile } from "./assertions/results";
import type { Finding } from "./assertions/pageChecks";
import {
  loadScreen,
  repaintInMode,
  scanScreen,
  type SessionState
} from "./assertions/screenScan";
import {
  freezeClock,
  installNetworkGuards,
  readSeed,
  selectBrand,
  setColorScheme,
  trackInFlight
} from "./support/page";

// Assertion tier: every screen and the specimen in every brand, both modes, both
// viewports, with no baselines. One page per brand and viewport loads each screen once,
// scans it in the first mode, repaints it in the other and scans again.
const SCREEN_LIST = [...SCREENS, SPECIMEN_SCREEN];
const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[];

for (const brand of BRANDS) {
  for (const viewportName of VIEWPORT_NAMES) {
    test.describe(`assertions ${brand.id} ${viewportName}`, () => {
      test.use({ viewport: VIEWPORTS[viewportName], colorScheme: MODES[0] });

      test("every screen, both modes", async ({ page, context }) => {
        test.setTimeout(900_000);
        const seed = readSeed();
        const blocked = await installNetworkGuards(context);
        await setColorScheme(context, MODES[0]);
        await selectBrand(context, brand.slug);
        const inFlight = trackInFlight(page);
        await freezeClock(page);

        const failures: string[] = [];
        const seen: { screen: string; mode: Mode; finding: Finding }[] = [];
        const session: SessionState = { persona: undefined };
        const screens = SCREEN_LIST.filter(
          (s) => !s.viewports || s.viewports.includes(viewportName)
        );
        for (const screen of screens) {
          try {
            await loadScreen(page, context, screen, seed, inFlight, session);
            for (const mode of MODES) {
              if (mode !== MODES[0]) await repaintInMode(page, mode, inFlight);
              const found = await scanScreen(
                page,
                screen,
                viewportName,
                SPECIMEN_SCREEN.id
              );
              for (const finding of found)
                seen.push({ screen: screen.id, mode, finding });
            }
          } catch (err) {
            seen.push({
              screen: screen.id,
              mode: MODES[0],
              finding: { check: "load", description: String(err).slice(0, 200) }
            });
          }
        }

        const scope = (screen: string, mode: Mode) => ({
          screen,
          brand: brand.id,
          mode,
          viewport: viewportName
        });
        const matchedEntries = new Set<number>();
        const touch: string[] = [];
        for (const { screen, mode, finding } of seen) {
          const index = ALLOWLIST.findIndex((e) =>
            entryMatches(e, scope(screen, mode), finding)
          );
          if (index >= 0) matchedEntries.add(index);
          if (finding.check === "touch-target") {
            touch.push(
              `${screen}: ${finding.description}${index >= 0 ? " (allowlisted)" : ""}`
            );
          }
          if (index < 0) {
            failures.push(
              `[${finding.check}] ${screen} (${mode}): ${finding.description}`
            );
          }
        }

        const result: ResultFile = {
          brand: brand.id,
          viewport: viewportName,
          matched: [...matchedEntries],
          touchTargets: touch,
          findings: seen.map(({ screen, mode, finding }) => ({
            screen,
            mode,
            check: finding.check,
            description: finding.description,
            allowlisted: ALLOWLIST.some((e) =>
              entryMatches(e, scope(screen, mode), finding)
            )
          }))
        };
        mkdirSync(RESULTS_DIR, { recursive: true });
        writeFileSync(
          path.join(RESULTS_DIR, `${brand.id}-${viewportName}.json`),
          JSON.stringify(result)
        );

        expect(blocked, "requests that left the machine").toEqual([]);
        expect(
          failures
            .slice(0, 25)
            .concat(
              failures.length > 25
                ? [`... and ${failures.length - 25} more (see ${RESULTS_DIR})`]
                : []
            ),
          `${failures.length} assertion failures not in the allowlist`
        ).toEqual([]);
      });
    });
  }
}
