import test from "node:test";
import assert from "node:assert/strict";

import {
  entryScriptPaths,
  evaluateBudget,
  formatTable,
  gzipKb,
  parseBudget
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

test("parseBudget accepts positive numbers and rejects anything else", () => {
  assert.deepEqual(parseBudget('{"entryJsGzipKb": 10, "totalJsGzipKb": 20}'), {
    entryJsGzipKb: 10,
    totalJsGzipKb: 20
  });
  assert.throws(
    () => parseBudget('{"entryJsGzipKb": "10", "totalJsGzipKb": 20}'),
    /entryJsGzipKb/
  );
  assert.throws(
    () => parseBudget('{"entryJsGzipKb": 10, "totalJsGzipKb": 0}'),
    /totalJsGzipKb/
  );
  assert.throws(() => parseBudget('{"entryJsGzipKb": 10}'), /totalJsGzipKb/);
});

test("evaluateBudget passes when sizes are at or under budget and fails above it", () => {
  const budget = { entryJsGzipKb: 100, totalJsGzipKb: 200 };

  const atLimit = evaluateBudget({ entryJsKb: 100, totalJsKb: 200 }, budget);
  assert.deepEqual(atLimit.failures, []);
  assert.ok(atLimit.rows.every((row) => row.ok));

  const over = evaluateBudget({ entryJsKb: 100.01, totalJsKb: 250 }, budget);
  assert.equal(over.failures.length, 2);
  assert.match(over.failures[0], /entry JS \(index\.html\).*exceeds budget of 100 kB/);
  assert.match(over.failures[1], /total JS.*exceeds budget of 200 kB/);
  assert.equal(over.rows[0].ok, false);
  assert.equal(over.rows[1].ok, false);
});

test("evaluateBudget reports CSS without a budget and never fails on it", () => {
  const { rows, failures } = evaluateBudget(
    { entryJsKb: 1, totalJsKb: 1, cssKb: 9999 },
    { entryJsGzipKb: 10, totalJsGzipKb: 10 }
  );
  assert.deepEqual(failures, []);
  assert.equal(rows.length, 3);
  assert.equal(rows[2].budgetKb, null);
  assert.equal(rows[2].ok, true);
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
