import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  BRANDS,
  MODES,
  SCREENS,
  SPECIMEN_SCREEN,
  VIEWPORTS,
  type ViewportName
} from "./matrix";
import { ALLOWLIST, entryMatches } from "./assertions/allowlist";
import { RESULTS_DIR, type ResultFile } from "./assertions/results";
import {
  contrastFindings,
  structuralFindings,
  type Finding
} from "./assertions/pageChecks";
import {
  freezeClock,
  installNetworkGuards,
  readSeed,
  selectBrand,
  setColorScheme,
  settle,
  signIn,
  trackInFlight
} from "./support/page";

// Assertion tier: every screen and the specimen in every brand, both modes, both
// viewports, with no baselines. One page per brand/mode/viewport navigates between screens.
const SCREEN_LIST = [...SCREENS, SPECIMEN_SCREEN];
const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[];

for (const brand of BRANDS) {
  for (const mode of MODES) {
    for (const viewportName of VIEWPORT_NAMES) {
      test.describe(`assertions ${brand.id} ${mode} ${viewportName}`, () => {
        test.use({ viewport: VIEWPORTS[viewportName], colorScheme: mode });

        test("every screen", async ({ page, context }) => {
          test.setTimeout(900_000);
          const seed = readSeed();
          const blocked = await installNetworkGuards(context);
          await setColorScheme(context, mode);
          await selectBrand(context, brand.slug);
          const inFlight = trackInFlight(page);
          await freezeClock(page);

          const failures: string[] = [];
          const seen: { screen: string; finding: Finding }[] = [];
          const screens = SCREEN_LIST.filter(
            (s) => !s.viewports || s.viewports.includes(viewportName)
          );
          for (const screen of screens) {
            const found: Finding[] = [];
            try {
              await context.clearCookies();
              if (screen.persona) await signIn(context, seed.tokens[screen.persona]);
              await screen.beforeNavigate?.(page, seed);
              await page.goto(screen.path(seed));
              const marker =
                "text" in screen.ready
                  ? page.getByText(screen.ready.text).first()
                  : page.locator(screen.ready.selector).first();
              await expect(marker).toBeVisible();
              await screen.prepare?.(page);
              await settle(page, inFlight, { quietPolls: 3, networkIdle: false });
              await page.addStyleTag({ path: "tests/visual/support/freeze.css" });
              found.push(
                ...(await structuralFindings(page, viewportName === "mobile")),
                // Colour contrast does not depend on width: axe runs on every screen at
                // desktop, and on the specimen at both widths.
                ...(viewportName === "desktop" || screen.id === SPECIMEN_SCREEN.id
                  ? await contrastFindings(page)
                  : [])
              );
            } catch (err) {
              found.push({ check: "load", description: String(err).slice(0, 200) });
            } finally {
              await page.unrouteAll({ behavior: "ignoreErrors" });
            }
            for (const finding of found) seen.push({ screen: screen.id, finding });
          }

          const scope = (screen: string) => ({
            screen,
            brand: brand.id,
            mode,
            viewport: viewportName
          });
          const matchedEntries = new Set<number>();
          const touch: string[] = [];
          for (const { screen, finding } of seen) {
            const index = ALLOWLIST.findIndex((e) =>
              entryMatches(e, scope(screen), finding)
            );
            if (index >= 0) matchedEntries.add(index);
            if (finding.check === "touch-target") {
              touch.push(
                `${screen}: ${finding.description}${index >= 0 ? " (allowlisted)" : ""}`
              );
            }
            if (index < 0) {
              failures.push(`[${finding.check}] ${screen}: ${finding.description}`);
            }
          }

          const result: ResultFile = {
            brand: brand.id,
            mode,
            viewport: viewportName,
            matched: [...matchedEntries],
            touchTargets: touch,
            findings: seen.map(({ screen, finding }) => ({
              screen,
              check: finding.check,
              description: finding.description,
              allowlisted: ALLOWLIST.some((e) => entryMatches(e, scope(screen), finding))
            }))
          };
          mkdirSync(RESULTS_DIR, { recursive: true });
          writeFileSync(
            path.join(RESULTS_DIR, `${brand.id}-${mode}-${viewportName}.json`),
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
}
