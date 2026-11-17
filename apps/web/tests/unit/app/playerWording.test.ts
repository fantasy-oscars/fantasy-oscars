// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * Players see "season" for both kinds of season (ADR 0006): "Circuit" is a
 * code and admin word. This scans every player-facing source file for copy and
 * routes that say "circuit". Admin screens are excluded. Identifiers, import
 * paths, API endpoints, error codes, DOM ids and query keys are not shown to
 * players, so they may still say circuit.
 */

const SRC = path.resolve(__dirname, "../../../src");

const EXCLUDED: Array<{ match: (rel: string) => boolean; reason: string }> = [
  { match: (rel) => /(^|\/)admin(\/|\.)/i.test(rel), reason: "admin screens" },
  { match: (rel) => rel === "orchestration/adminCircuit.ts", reason: "admin" },
  {
    match: (rel) =>
      rel === "features/contenders/screens/ContenderPickerPreviewScreen.tsx",
    reason: "mounted only by the admin picker page"
  },
  {
    match: (rel) => rel === "app/pages/LegacyFullSeasonRedirect.tsx",
    reason: "matches the old URL in order to redirect it"
  }
];

/** JSX attributes whose value is read or heard by players. */
const TEXT_ATTRIBUTES = new Set([
  "label",
  "title",
  "aria-label",
  "placeholder",
  "description",
  "alt",
  "message"
]);

const MENTIONS = /circuit/i;
// A URL segment in the address bar, e.g. "/circuits/4". API calls live in orchestration.
const URL_SEGMENT = /\/circuit/i;

type Offence = { line: number; text: string; why: string };

function scanSource(fileName: string, source: string): Offence[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const isOrchestration = fileName.startsWith("orchestration/");
  const offences: Offence[] = [];
  const report = (node: ts.Node, text: string, why: string) =>
    offences.push({
      line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      text,
      why
    });

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      return;
    }

    if (ts.isJsxText(node)) {
      if (MENTIONS.test(node.text)) report(node, node.text.trim(), "visible text");
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const text = node.text;
      const attribute = ts.isJsxAttribute(node.parent)
        ? node.parent.name.getText(sf)
        : ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent)
          ? node.parent.parent.name.getText(sf)
          : null;
      if (!MENTIONS.test(text)) {
        // Nothing to check.
      } else if (attribute === "path") {
        report(node, text, "route path");
      } else if (attribute && TEXT_ATTRIBUTES.has(attribute)) {
        report(node, text, `"${attribute}" text`);
      } else if (/\s/.test(text)) {
        report(node, text, "copy");
      } else if (!isOrchestration && URL_SEGMENT.test(text)) {
        report(node, text, "URL");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offences;
}

function playerFacingFiles(): string[] {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")
        ? [full]
        : [];
    });
  return walk(SRC)
    .map((full) => path.relative(SRC, full).split(path.sep).join("/"))
    .filter((rel) => !EXCLUDED.some((e) => e.match(rel)));
}

describe("player-facing wording", () => {
  it("catches copy, labels, routes and URLs that say circuit", () => {
    const sample = [
      "const a = <Text>Join the Circuit</Text>;",
      'const b = <Select label="Circuit" />;',
      'const c = <Route path="/leagues/:id/circuits/:cid" />;',
      "const d = `${base}/circuits/${id}`;",
      'const e = "Start this circuit now";',
      'import { x } from "@/features/circuitLeagues/x";',
      'const f = <div id="circuit-league-members" />;',
      'const g = "CIRCUIT_LEAGUE_LOCKED";'
    ].join("\n");
    expect(scanSource("features/sample.tsx", sample).map((o) => o.why)).toEqual([
      "visible text",
      '"label" text',
      "route path",
      "URL",
      "copy"
    ]);
    // API endpoints are fetched, not shown.
    expect(
      scanSource("orchestration/x.ts", "fetchJson(`/circuit-leagues/${id}`);")
    ).toEqual([]);
  });

  it("never says circuit outside admin", () => {
    const files = playerFacingFiles();
    expect(files).toContain("app/App.tsx");
    expect(files).toContain("lib/routes.ts");
    expect(files).toContain("features/leagues/ui/LeagueSeasonsSection.tsx");
    expect(files).toContain("features/seasons/ui/create/SeasonKindChoice.tsx");

    const offences = files.flatMap((rel) =>
      scanSource(rel, fs.readFileSync(path.join(SRC, rel), "utf8")).map(
        (o) => `${rel}:${o.line} (${o.why}) ${JSON.stringify(o.text)}`
      )
    );
    expect(offences).toEqual([]);
  });
});
