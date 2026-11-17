import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyChunk,
  entryScriptPaths,
  evaluateBudget,
  formatTable,
  gzipKb,
  inlinedSvgChunks,
  parseBudget,
  parserLeaks
} from "../../../.github/scripts/bundle-budget.mjs";

test("entryScriptPaths includes modulepreload chunks and ignores external or non-JS tags", () => {
  const html = `
    <link rel="modulepreload" crossorigin href="/assets/vendor.js" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <script src='./assets/legacy.js'></script>
    <script src="https://cdn.example.com/lib.js"></script>
    <script src="/assets/data.json"></script>
    <link rel="stylesheet" href="/assets/index.css" />
    <link rel="preload" href="/assets/font.js" />
  `;
  assert.deepEqual(entryScriptPaths(html), [
    "assets/vendor.js",
    "assets/index-abc.js",
    "assets/legacy.js"
  ]);
});

test("entryScriptPaths deduplicates a chunk that is both preloaded and a script src", () => {
  const html = `
    <link rel="modulepreload" href="/assets/shared.js" />
    <script type="module" src="/assets/index.js"></script>
    <script type="module" src="/assets/shared.js"></script>
  `;
  assert.deepEqual(entryScriptPaths(html), ["assets/shared.js", "assets/index.js"]);
});

test("gzipKb reports compressed size in KB and shrinks repetitive content", () => {
  const repetitive = Buffer.alloc(100_000, "a");
  const size = gzipKb(repetitive);
  assert.ok(size > 0);
  assert.ok(size < 1, `expected under 1 kB, got ${size}`);
});

const BUDGET = {
  entryJsGzipKb: 100,
  largestRouteChunkGzipKb: 60,
  adminChunkGzipKb: 70
};

test("parseBudget accepts positive numbers and rejects anything else", () => {
  assert.deepEqual(
    parseBudget(
      '{"entryJsGzipKb": 10, "largestRouteChunkGzipKb": 20, "adminChunkGzipKb": 30}'
    ),
    { entryJsGzipKb: 10, largestRouteChunkGzipKb: 20, adminChunkGzipKb: 30 }
  );
  assert.throws(
    () =>
      parseBudget(
        '{"entryJsGzipKb": "10", "largestRouteChunkGzipKb": 20, "adminChunkGzipKb": 30}'
      ),
    /entryJsGzipKb/
  );
  assert.throws(
    () =>
      parseBudget(
        '{"entryJsGzipKb": 10, "largestRouteChunkGzipKb": 0, "adminChunkGzipKb": 30}'
      ),
    /largestRouteChunkGzipKb/
  );
  assert.throws(
    () => parseBudget('{"entryJsGzipKb": 10, "largestRouteChunkGzipKb": 20}'),
    /adminChunkGzipKb/
  );
});

test("classifyChunk tells admin, admin preview, vendor and route chunks apart", () => {
  assert.equal(classifyChunk("AdminRoutes-DF7qA35W.js"), "admin");
  assert.equal(classifyChunk("assets/MarkdownPreview-BF2CNSlz.js"), "adminPreview");
  assert.equal(classifyChunk("vendor-CWqotXQT.js"), "vendor");
  assert.equal(classifyChunk("SeasonPage-Bol8cHXe.js"), "route");
  assert.equal(classifyChunk("AdminRoutesHelper-abc.js"), "route");
});

test("parserLeaks flags any chunk but the admin preview that holds the parser", () => {
  const chunks = [
    { name: "MarkdownPreview-abc.js", content: "micromark-core" },
    { name: "vendor-abc.js", content: "react" },
    { name: "AdminRoutes-abc.js", content: "import micromark" },
    { name: "index-abc.js", content: "x" }
  ];
  assert.deepEqual(parserLeaks(chunks), ["AdminRoutes-abc.js"]);
  assert.deepEqual(parserLeaks(chunks.slice(0, 2)), []);
});

test("inlinedSvgChunks flags a chunk that carries an SVG data URI", () => {
  const chunks = [
    { name: "index-abc.js", content: 'url("data:image/svg+xml;base64,PHN2Zz4=")' },
    { name: "vendor-abc.js", content: 'url("/assets/bear-abc.svg")' }
  ];
  assert.deepEqual(inlinedSvgChunks(chunks), ["index-abc.js"]);
});

test("evaluateBudget passes when sizes are at or under budget and fails above it", () => {
  const atLimit = evaluateBudget(
    { entryJsKb: 100, largestRouteKb: 60, adminKb: 70 },
    BUDGET
  );
  assert.deepEqual(atLimit.failures, []);
  assert.ok(atLimit.rows.every((row) => row.ok));

  const over = evaluateBudget(
    {
      entryJsKb: 100.01,
      largestRouteKb: 61,
      largestRouteName: "SeasonPage-abc.js",
      adminKb: 90
    },
    BUDGET
  );
  assert.equal(over.failures.length, 3);
  assert.match(over.failures[0], /entry JS \(index\.html \+ vendor\).*budget of 100 kB/);
  assert.match(
    over.failures[1],
    /largest route chunk \(SeasonPage-abc\.js\).*budget of 60 kB/
  );
  assert.match(over.failures[2], /admin chunk.*budget of 70 kB/);
  assert.ok(over.rows.slice(0, 3).every((row) => !row.ok));
});

test("evaluateBudget reports preview, total JS and CSS without a budget and never fails on them", () => {
  const { rows, failures } = evaluateBudget(
    {
      entryJsKb: 1,
      largestRouteKb: 1,
      adminKb: 1,
      previewKb: 9999,
      totalJsKb: 9999,
      cssKb: 9999
    },
    BUDGET
  );
  assert.deepEqual(failures, []);
  assert.equal(rows.length, 6);
  for (const row of rows.slice(3)) {
    assert.equal(row.budgetKb, null);
    assert.equal(row.ok, true);
  }
});

test("formatTable renders a header and one aligned line per row", () => {
  const table = formatTable([
    { label: "entry JS (index.html)", sizeKb: 357.861, budgetKb: 394, ok: true },
    { label: "total CSS (assets/*.css)", sizeKb: 42.2, budgetKb: null, ok: true }
  ]);
  const lines = table.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^metric\s+gzip\s+budget\s+status$/);
  assert.match(lines[1], /357\.86 kB\s+394 kB\s+ok$/);
  assert.match(lines[2], /42\.20 kB\s+-\s+ok$/);
});
