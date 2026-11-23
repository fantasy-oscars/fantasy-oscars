import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  MODES,
  SPECIMEN_SCREEN,
  SWEEP_BRAND,
  VIEWPORTS,
  type ViewportName
} from "./matrix";
import { ALLOWLIST, CONTRAST_EXCEPTIONS, entryMatches } from "./assertions/allowlist";
import { RESULTS_DIR, UPDATE_PAIRS, type ResultFile } from "./assertions/results";
import {
  contrastFindings,
  isDraftRoomScreen,
  structuralFindings,
  type Finding
} from "./assertions/pageChecks";
import {
  loadScreen,
  repaintInMode,
  scanLayout,
  type SessionState
} from "./assertions/screenScan";
import {
  addStressFont,
  formatWidthTable,
  judgeWidths,
  measureFonts,
  WIDTH_CHECK_FAMILIES
} from "./assertions/widthCheck";
import { applyStressTheme } from "./assertions/stressRuns";
import { sweepCells } from "./assertions/sweep";
import {
  loadRegistry,
  observedKey,
  observedUncheckedKey,
  recordPairs,
  REGENERATE_COMMAND,
  REGISTRY_PATH,
  registryKeys,
  type ObservedPair,
  type ObservedUnchecked
} from "./assertions/pairs";
import { evaluateTheme } from "./assertions/contrastRule";
import {
  fontSlots,
  fontWidthProblems,
  measureFontSlots,
  slotLimitProblems
} from "./assertions/geometryLimits";
import { THEMES, type Theme } from "./assertions/themes";
import { parseColor, resolveColor, themeDeclarations } from "./assertions/colors";
import {
  COLOR_TOKENS,
  probeStressBrand,
  probeStressCss
} from "./fixtures/probeStressTheme";
import {
  freezeClock,
  installNetworkGuards,
  readSeed,
  selectAppearance,
  trackInFlight
} from "./support/page";

// Assertion tier (docs/adr/0008-rule-based-visual-assertions.md). Screens are checked
// once, in the probe-stress theme; themes are checked through rules on their values:
// - sweep: every screen at both viewports, layout checks once and the contrast pairs it
//   paints in each mode, compared with the committed registry;
// - contrast rule: every registry pair in every theme, in Node;
// - geometry limits: every theme's geometry slots inside the probe-stress theme's;
// - specimen: every theme's specimen at both viewports, with real colours, as a backstop.

// A screen that has not finished by now is a failure of that screen, not of the cell.
const SCREEN_BUDGET_MS = 90_000;

const PROBE_CSS = probeStressCss(0);

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

function capped(failures: string[], where: string) {
  return failures
    .slice(0, 25)
    .concat(
      failures.length > 25 ? [`... and ${failures.length - 25} more (see ${where})`] : []
    );
}

const registry = loadRegistry();
const registered = registryKeys(registry);

for (const { viewport: viewportName, part, parts, screens } of sweepCells()) {
  test.describe(`sweep ${viewportName} part ${part + 1} of ${parts}`, () => {
    test.use({ viewport: VIEWPORTS[viewportName], colorScheme: MODES[0] });

    test("layout once, contrast pairs in each mode", async ({
      page: firstPage,
      context
    }) => {
      test.setTimeout(300_000);
      const seed = readSeed();
      const blocked = await installNetworkGuards(context);
      await selectAppearance(context, SWEEP_BRAND.slug, MODES[0]);

      let page = firstPage;
      let inFlight = trackInFlight(page);
      await freezeClock(page);

      const failures: string[] = [];
      const seen: { screen: string; finding: Finding }[] = [];
      const pairs: ObservedPair[] = [];
      const unchecked: ObservedUnchecked[] = [];
      const timings: ResultFile["timings"] = [];
      const session: SessionState = { persona: undefined };
      for (const { def: screen, label } of screens) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const found = await withBudget(
              (async () => {
                const t0 = Date.now();
                await loadScreen(page, context, screen, seed, inFlight, session);
                const draftRoom = isDraftRoomScreen(screen.id);
                await applyStressTheme(page, inFlight, PROBE_CSS, { draftRoom });
                const t1 = Date.now();
                const layout = await scanLayout(
                  page,
                  screen,
                  viewportName,
                  SPECIMEN_SCREEN.id
                );
                const t2 = Date.now();
                // Pairs are recorded where the old tier ran axe: every screen at desktop,
                // and the specimen at both widths.
                const recorded =
                  viewportName === "desktop" || screen.id === SPECIMEN_SCREEN.id
                    ? await recordPairs(page, label, draftRoom, MODES, (mode) =>
                        repaintInMode(page, SWEEP_BRAND.slug, mode, inFlight)
                      )
                    : { pairs: [], unchecked: [], problems: [] };
                const ms = { load: t1 - t0, layout: t2 - t1, record: Date.now() - t2 };
                return { layout, recorded, ms };
              })(),
              SCREEN_BUDGET_MS,
              `screen ${label}`
            );
            for (const finding of found.layout) seen.push({ screen: screen.id, finding });
            pairs.push(...found.recorded.pairs);
            unchecked.push(...found.recorded.unchecked);
            for (const problem of found.recorded.problems)
              failures.push(`[contrast-probe] ${label}: ${problem}`);
            timings.push({ screen: label, ...found.ms });
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
                `RETRY: sweep ${viewportName} ${label} failed to load (${reason}); retrying once on a fresh page`
              );
            } else {
              seen.push({
                screen: screen.id,
                finding: { check: "load", description: reason }
              });
            }
          }
        }
      }

      const matchedEntries = new Set<number>();
      const touch: string[] = [];
      const findings: ResultFile["findings"] = [];
      for (const { screen, finding } of seen) {
        const scope = { screen, viewport: viewportName };
        const index = ALLOWLIST.findIndex((e) => entryMatches(e, scope, finding));
        if (index >= 0) matchedEntries.add(index);
        if (finding.check === "touch-target") {
          touch.push(
            `${screen}: ${finding.description}${index >= 0 ? " (allowlisted)" : ""}`
          );
        }
        if (index < 0)
          failures.push(`[${finding.check}] ${screen}: ${finding.description}`);
        findings.push({ screen, ...finding, allowlisted: index >= 0 });
      }

      if (!UPDATE_PAIRS) {
        const missing = new Map<string, string>();
        for (const p of pairs) {
          const key = observedKey(p);
          if (!registered.has(key)) missing.set(key, p.screen);
        }
        for (const u of unchecked) {
          const key = observedUncheckedKey(u);
          if (!registered.has(key)) missing.set(key, u.screen);
        }
        for (const [key, screen] of missing) {
          failures.push(
            `[contrast-registry] ${screen}: ${key} is not in ${REGISTRY_PATH}; regenerate it with ${REGENERATE_COMMAND} and review the diff`
          );
        }
      }

      const result: ResultFile = {
        viewport: viewportName,
        part,
        matched: [...matchedEntries],
        touchTargets: touch,
        findings,
        pairs,
        unchecked,
        timings,
        failures
      };
      mkdirSync(RESULTS_DIR, { recursive: true });
      writeFileSync(
        path.join(RESULTS_DIR, `sweep-${viewportName}-${part}.json`),
        JSON.stringify(result)
      );

      expect(blocked, "requests that left the machine").toEqual([]);
      expect(
        capped(failures, RESULTS_DIR),
        `${failures.length} sweep failures not in the allowlist or registry`
      ).toEqual([]);
    });
  });
}

// The contrast rule: one test per theme, no browser.
test.describe("contrast rule", () => {
  for (const theme of THEMES) {
    test(theme.id, () => {
      const { failures, checked } = evaluateTheme(registry, theme);
      expect(checked, `pairs checked in ${theme.id}`).toBeGreaterThan(0);
      const exceptions = CONTRAST_EXCEPTIONS.filter(
        (e) => e.theme === "*" || e.theme === theme.id
      );
      const used = new Set<number>();
      const open = failures.filter((f) => {
        const index = exceptions.findIndex((e) => f.key.includes(e.pair));
        if (index >= 0) used.add(index);
        return index < 0;
      });
      expect(
        capped(
          open.map(
            (f) =>
              `${theme.id}: ${f.key} is ${f.ratio.toFixed(2)}:1, needs ${f.threshold}:1 (e.g. ${f.screen})`
          ),
          REGISTRY_PATH
        ),
        `${open.length} registry pairs miss their contrast threshold in ${theme.id}`
      ).toEqual([]);
      expect(
        exceptions.filter((_, i) => !used.has(i)).map((e) => `${e.theme} ${e.pair}`),
        "stale contrast exceptions (no longer failing; delete them from tests/visual/assertions/allowlist.ts)"
      ).toEqual([]);
    });
  }
});

/** Loads the login page and the pinned Montserrat, where every catalog family can be measured. */
async function fontPage(page: Page) {
  await page.goto("/login");
  await expect(page.getByText("Sign in").first()).toBeVisible();
  await addStressFont(page);
}

// Geometry limits: one test per theme.
test.describe("geometry limits", () => {
  for (const theme of THEMES) {
    test(theme.id, async ({ page, context }) => {
      const blocked = await installNetworkGuards(context);
      await fontPage(page);
      const own = await measureFontSlots(page, fontSlots(theme.definition));
      const stress = await measureFontSlots(page, fontSlots(probeStressBrand));
      expect(blocked, "requests that left the machine").toEqual([]);
      expect([
        ...slotLimitProblems(theme.definition),
        ...fontWidthProblems(own, stress)
      ]).toEqual([]);
    });
  }
});

/**
 * The contrast rule resolves colour properties in Node; here the browser resolves the same
 * properties for the theme it is showing, and the two must agree to a channel level.
 */
async function resolverMismatches(page: Page, theme: Theme): Promise<string[]> {
  const computed = await page.evaluate((tokens) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    const out = tokens.map((token) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    return out;
  }, COLOR_TOKENS);
  const decls = themeDeclarations(theme.definition, theme.mode);
  let compared = 0;
  const out = COLOR_TOKENS.flatMap((token, i) => {
    const rule = resolveColor(`var(${token})`, decls);
    const browser = parseColor(computed[i]!);
    if (rule === "inherit" || rule === null || !browser) return [];
    compared++;
    const off =
      Math.max(
        Math.abs(rule.r - browser.r),
        Math.abs(rule.g - browser.g),
        Math.abs(rule.b - browser.b)
      ) > 1.01 || Math.abs(rule.a - browser.a) > 0.01;
    return off
      ? [
          `[resolver] ${token}: the browser paints ${computed[i]}, the contrast rule resolves rgba(${[rule.r, rule.g, rule.b].map(Math.round).join(", ")}, ${rule.a})`
        ]
      : [];
  });
  return compared > COLOR_TOKENS.length / 2
    ? out
    : [
        `[resolver] only ${compared} of ${COLOR_TOKENS.length} colour properties could be compared`
      ];
}

// The specimen backstop: every theme with its real colours and geometry, both viewports.
test.describe("specimen", () => {
  for (const theme of THEMES) {
    test(theme.id, async ({ context }) => {
      test.setTimeout(180_000);
      const seed = readSeed();
      const blocked = await installNetworkGuards(context);
      await selectAppearance(context, theme.brand.slug, theme.mode);
      const failures: string[] = [];
      // A fresh page per viewport: requests left over from one load must not hold the next.
      // A load that fails is retried once on another fresh page, as in the sweep.
      for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const page = await context.newPage();
          try {
            await page.setViewportSize(VIEWPORTS[viewport]);
            await page.emulateMedia({ colorScheme: theme.mode });
            const inFlight = trackInFlight(page);
            await freezeClock(page);
            const session: SessionState = { persona: undefined };
            await loadScreen(page, context, SPECIMEN_SCREEN, seed, inFlight, session);
          } catch (err) {
            await page.close();
            if (attempt === 2) throw err;
            console.error(
              `RETRY: specimen ${theme.id} ${viewport} failed to load (${describeFailure(err)}); retrying once on a fresh page`
            );
            continue;
          }
          const layout = (await structuralFindings(page, viewport === "mobile")).filter(
            (f) => f.check === "overflow" || f.check === "clipped-text"
          );
          for (const f of [...layout, ...(await contrastFindings(page))]) {
            failures.push(`[${f.check}] ${viewport}: ${f.description}`);
          }
          if (viewport === "desktop")
            failures.push(...(await resolverMismatches(page, theme)));
          await page.close();
          break;
        }
      }
      expect(blocked, "requests that left the machine").toEqual([]);
      expect(
        capped(failures, "the report"),
        `${failures.length} specimen failures in ${theme.id}`
      ).toEqual([]);
    });
  }
});

// The working-text width check (5.6): every family in ROOM_WORK_FONTS, and the stress
// theme's Montserrat, measured in the browser from the files the app serves (the pinned
// fixture for Montserrat). One page, so the list cannot drift from the rule.
test.describe("assertions fonts", () => {
  test("working fonts pass the width check", async ({ page, context }) => {
    const blocked = await installNetworkGuards(context);
    await fontPage(page);
    const rows = judgeWidths(await measureFonts(page, WIDTH_CHECK_FAMILIES));
    console.log(
      `\nWorking font width check (100 px, weight 500, kerning on):\n${formatWidthTable(rows)}`
    );
    expect(blocked, "requests that left the machine").toEqual([]);
    expect(
      rows.flatMap((row) => row.problems.map((problem) => `${row.family}: ${problem}`))
    ).toEqual([]);
  });
});
