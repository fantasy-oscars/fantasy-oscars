#!/usr/bin/env node
/**
 * Bundle size budget for the web app. Run after `pnpm run build`.
 *
 * Why:
 * - Catch accidental bundle growth in CI instead of in production.
 * - Budgets live in apps/web/bundle-budget.json, so raising one is a visible, reviewed change.
 * - Sizes are gzip (node:zlib, level 9) in KB (1 KB = 1024 bytes).
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(SCRIPT_DIR, "..", "..", "apps", "web");
const DIST_DIR = path.join(WEB_DIR, "dist");
const BUDGET_FILE = path.join(WEB_DIR, "bundle-budget.json");

const BYTES_PER_KB = 1024;

/**
 * Local JS files that load up front for an HTML document: `<script src>` entries
 * plus `<link rel="modulepreload">` hints (shared chunks Vite preloads). Returned
 * relative to the dist root (leading "/" or "./" removed), deduplicated, in document order.
 * @param {string} html
 * @returns {string[]}
 */
export function entryScriptPaths(html) {
  const found = [];
  for (const [tag] of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const isScript = /^<script\b/i.test(tag);
    const isPreload = !isScript && /\brel=["']modulepreload["']/i.test(tag);
    if (!isScript && !isPreload) continue;
    const src = attribute(tag, isScript ? "src" : "href");
    if (src === undefined || /^(https?:)?\/\//.test(src) || !src.endsWith(".js"))
      continue;
    found.push(src.replace(/^\.?\//, ""));
  }
  return [...new Set(found)];
}

/**
 * @param {string} tag
 * @param {string} name
 * @returns {string | undefined}
 */
function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, "i"));
  return match ? match[1] : undefined;
}

/**
 * All files under a directory, recursively.
 * @param {string} dir
 * @returns {string[]}
 */
export function listFilesRecursive(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(full) : [full];
  });
}

/**
 * Gzip size of a buffer in KB.
 * @param {Buffer} content
 * @returns {number}
 */
export function gzipKb(content) {
  return zlib.gzipSync(content, { level: 9 }).length / BYTES_PER_KB;
}

/**
 * Parse and validate the budget file contents.
 * @param {string} text
 * @returns {{ entryJsGzipKb: number, totalJsGzipKb: number }}
 */
export function parseBudget(text) {
  const parsed = JSON.parse(text);
  for (const key of ["entryJsGzipKb", "totalJsGzipKb"]) {
    if (typeof parsed[key] !== "number" || !(parsed[key] > 0)) {
      throw new Error(`bundle-budget.json: "${key}" must be a positive number`);
    }
  }
  return { entryJsGzipKb: parsed.entryJsGzipKb, totalJsGzipKb: parsed.totalJsGzipKb };
}

/**
 * Compare measured sizes against budgets. A size equal to its budget passes.
 * CSS is reported for information only and has no budget.
 * @param {{ entryJsKb: number, totalJsKb: number, cssKb?: number }} sizes
 * @param {{ entryJsGzipKb: number, totalJsGzipKb: number }} budget
 * @returns {{ rows: Array<{ label: string, sizeKb: number, budgetKb: number | null, ok: boolean }>, failures: string[] }}
 */
export function evaluateBudget(sizes, budget) {
  const rows = [
    {
      label: "entry JS (index.html)",
      sizeKb: sizes.entryJsKb,
      budgetKb: budget.entryJsGzipKb,
      ok: sizes.entryJsKb <= budget.entryJsGzipKb
    },
    {
      label: "total JS (assets/*.js)",
      sizeKb: sizes.totalJsKb,
      budgetKb: budget.totalJsGzipKb,
      ok: sizes.totalJsKb <= budget.totalJsGzipKb
    }
  ];
  if (sizes.cssKb !== undefined) {
    rows.push({
      label: "total CSS (assets/*.css)",
      sizeKb: sizes.cssKb,
      budgetKb: null,
      ok: true
    });
  }
  const failures = rows
    .filter((row) => !row.ok)
    .map(
      (row) =>
        `${row.label}: ${row.sizeKb.toFixed(2)} kB exceeds budget of ${row.budgetKb} kB`
    );
  return { rows, failures };
}

/**
 * Render rows as a plain-text table.
 * @param {Array<{ label: string, sizeKb: number, budgetKb: number | null, ok: boolean }>} rows
 * @returns {string}
 */
export function formatTable(rows) {
  const header = ["metric", "gzip", "budget", "status"];
  const body = rows.map((row) => [
    row.label,
    `${row.sizeKb.toFixed(2)} kB`,
    row.budgetKb === null ? "-" : `${row.budgetKb} kB`,
    row.ok ? "ok" : "FAIL"
  ]);
  const all = [header, ...body];
  const widths = header.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all
    .map((r) =>
      r
        .map((cell, i) => cell.padEnd(widths[i]))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

function main() {
  const indexFile = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(indexFile)) {
    console.error(
      "bundle-budget: apps/web/dist/index.html not found. Run `pnpm run build` first."
    );
    process.exit(1);
  }

  const entries = entryScriptPaths(fs.readFileSync(indexFile, "utf8"));
  if (entries.length === 0) {
    console.error("bundle-budget: no entry <script src> found in dist/index.html.");
    process.exit(1);
  }

  let entryJsKb = 0;
  for (const rel of entries) {
    const file = path.join(DIST_DIR, rel);
    if (!fs.existsSync(file)) {
      console.error(`bundle-budget: entry script ${rel} is missing from dist.`);
      process.exit(1);
    }
    entryJsKb += gzipKb(fs.readFileSync(file));
  }

  const assetsDir = path.join(DIST_DIR, "assets");
  if (!fs.existsSync(assetsDir)) {
    console.error(
      "bundle-budget: apps/web/dist/assets not found. Run `pnpm run build` first."
    );
    process.exit(1);
  }
  const assetFiles = listFilesRecursive(assetsDir);
  const totalGzipKb = (ext) =>
    assetFiles
      .filter((file) => file.endsWith(ext))
      .reduce((total, file) => total + gzipKb(fs.readFileSync(file)), 0);

  const sizes = { entryJsKb, totalJsKb: totalGzipKb(".js"), cssKb: totalGzipKb(".css") };
  const budget = parseBudget(fs.readFileSync(BUDGET_FILE, "utf8"));
  const { rows, failures } = evaluateBudget(sizes, budget);

  console.log(formatTable(rows));
  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) console.error(`bundle-budget: ${failure}`);
    console.error(
      "bundle-budget: raise apps/web/bundle-budget.json only if the growth is intended."
    );
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
