import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { assertionCells, MODES, type Mode, SPECIMEN_SCREEN, VIEWPORTS } from "./matrix";
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
// viewports, with no baselines. One page per cell (a brand, a viewport and a slice of
// its screens) loads each screen once, scans it in the first mode, repaints it in the
// other and scans again.

// A screen that has not finished by now is a failure of that screen, not of the cell.
const SCREEN_BUDGET_MS = 90_000;

/** One line, with the repeated "name: name:" prefixes Playwright adds to a re-thrown error collapsed. */
function describeFailure(err: unknown) {
  const text = err instanceof Error ? err.message : String(err);
  const first = text.split("\n")[0] ?? "";
  return first.replace(/\b([\w.]+: )\1+/g, "$1").slice(0, 200);
}

function withBudget<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} did not finish within ${ms / 1000}s`)),
      ms
    );
  });
  // The abandoned work fails when its page is closed; that rejection is expected.
  work.catch(() => undefined);
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

for (const { brand, viewport: viewportName, part, parts, screens } of assertionCells()) {
  const label = parts > 1 ? ` part ${part + 1}` : "";
  test.describe(`assertions ${brand.id} ${viewportName}${label}`, () => {
    test.use({ viewport: VIEWPORTS[viewportName], colorScheme: MODES[0] });

    test("every screen, both modes", async ({ page: firstPage, context }) => {
      test.setTimeout(300_000);
      const seed = readSeed();
      const blocked = await installNetworkGuards(context);
      await setColorScheme(context, MODES[0]);
      await selectBrand(context, brand.slug);

      let page = firstPage;
      let inFlight = trackInFlight(page);
      await freezeClock(page);

      const failures: string[] = [];
      const seen: { screen: string; mode: Mode; finding: Finding }[] = [];
      const session: SessionState = { persona: undefined };
      for (const screen of screens) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const found: { mode: Mode; finding: Finding }[] = [];
          try {
            await withBudget(
              (async () => {
                await loadScreen(page, context, screen, seed, inFlight, session);
                for (const mode of MODES) {
                  if (mode !== MODES[0]) await repaintInMode(page, mode, inFlight);
                  for (const finding of await scanScreen(
                    page,
                    screen,
                    viewportName,
                    SPECIMEN_SCREEN.id
                  ))
                    found.push({ mode, finding });
                }
              })(),
              SCREEN_BUDGET_MS,
              `screen ${screen.id}`
            );
            for (const { mode, finding } of found)
              seen.push({ screen: screen.id, mode, finding });
            break;
          } catch (err) {
            const reason = describeFailure(err);
            // The page may be stuck or closed: continue on a fresh one so one screen
            // cannot take the rest of the cell with it.
            await page.close().catch(() => undefined);
            page = await context.newPage();
            inFlight = trackInFlight(page);
            await freezeClock(page);
            session.persona = undefined;
            if (attempt === 1) {
              console.error(
                `RETRY: ${brand.id} ${viewportName} ${screen.id} failed to load (${reason}); retrying once on a fresh page`
              );
            } else {
              seen.push({
                screen: screen.id,
                mode: MODES[0],
                finding: { check: "load", description: reason }
              });
            }
          }
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
          failures.push(`[${finding.check}] ${screen} (${mode}): ${finding.description}`);
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
        path.join(RESULTS_DIR, `${brand.id}-${viewportName}-${part}.json`),
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
