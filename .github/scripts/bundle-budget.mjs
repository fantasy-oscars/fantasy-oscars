#!/usr/bin/env node
/**
 * Bundle size budget for the web app. Run after `pnpm run build`.
 *
 * Why:
 * - Catch accidental bundle growth in CI instead of in production.
 * - Budgets live in apps/web/bundle-budget.json, so raising one is a visible, reviewed change
 *   (rule and targets: docs/standards/testing.md).
 * - The markdown parser must stay out of every chunk except the admin preview, and no
 *   chunk may inline an SVG (avatars are files).
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

const BUDGET_KEYS = ["entryJsGzipKb", "largestRouteChunkGzipKb", "adminChunkGzipKb"];

/**
 * Parse and validate the budget file contents.
 * @param {string} text
 * @returns {{ entryJsGzipKb: number, largestRouteChunkGzipKb: number, adminChunkGzipKb: number }}
 */
export function parseBudget(text) {
  const parsed = JSON.parse(text);
  for (const key of BUDGET_KEYS) {
    if (typeof parsed[key] !== "number" || !(parsed[key] > 0)) {
      throw new Error(`bundle-budget.json: "${key}" must be a positive number`);
    }
  }
  return Object.fromEntries(BUDGET_KEYS.map((key) => [key, parsed[key]]));
}

/**
 * Which budget a chunk file counts against, from its name (Vite names a chunk after
 * its first module, plus a content hash):
 * - "admin": the lazy admin routes;
 * - "adminPreview": the admin editor's live preview, the only place the markdown parser lives;
 * - "vendor": the long-cached framework chunk, which loads with the entry;
 * - "route": any other chunk, loaded on navigation (the entry is told apart by index.html).
 * @param {string} fileName
 * @returns {"admin" | "adminPreview" | "vendor" | "route"}
 */
export function classifyChunk(fileName) {
  const base = path.basename(fileName);
  if (/^AdminRoutes-/.test(base)) return "admin";
  if (/^MarkdownPreview-/.test(base)) return "adminPreview";
  if (/^vendor-/.test(base)) return "vendor";
  return "route";
}

/**
 * Chunks that contain the markdown parser (micromark keeps its name in minified output)
 * although they are not the admin preview chunk.
 * @param {Array<{ name: string, content: string }>} chunks
 * @returns {string[]}
 */
export function parserLeaks(chunks) {
  return chunks
    .filter(
      (chunk) =>
        classifyChunk(chunk.name) !== "adminPreview" && /micromark/.test(chunk.content)
    )
    .map((chunk) => chunk.name);
}

/**
 * Chunks that carry an SVG as a data URI. Avatars are served as files; an inlined one
 * puts every animal in the entry.
 * @param {Array<{ name: string, content: string }>} chunks
 * @returns {string[]}
 */
export function inlinedSvgChunks(chunks) {
  return chunks
    .filter((chunk) => /data:image\/svg\+xml/.test(chunk.content))
    .map((chunk) => chunk.name);
}

/**
 * Compare measured sizes against budgets. A size equal to its budget passes.
 * Total JS, the admin preview chunk and CSS are reported for information only.
 * @param {{ entryJsKb: number, largestRouteKb: number, largestRouteName?: string, adminKb: number, previewKb?: number, totalJsKb?: number, cssKb?: number }} sizes
 * @param {{ entryJsGzipKb: number, largestRouteChunkGzipKb: number, adminChunkGzipKb: number }} budget
 * @returns {{ rows: Array<{ label: string, sizeKb: number, budgetKb: number | null, ok: boolean }>, failures: string[] }}
 */
export function evaluateBudget(sizes, budget) {
  const rows = [
    {
      label: "entry JS (index.html + vendor)",
      sizeKb: sizes.entryJsKb,
      budgetKb: budget.entryJsGzipKb,
      ok: sizes.entryJsKb <= budget.entryJsGzipKb
    },
    {
      label: sizes.largestRouteName
        ? `largest route chunk (${sizes.largestRouteName})`
        : "largest route chunk",
      sizeKb: sizes.largestRouteKb,
      budgetKb: budget.largestRouteChunkGzipKb,
      ok: sizes.largestRouteKb <= budget.largestRouteChunkGzipKb
    },
    {
      label: "admin chunk (AdminRoutes)",
      sizeKb: sizes.adminKb,
      budgetKb: budget.adminChunkGzipKb,
      ok: sizes.adminKb <= budget.adminChunkGzipKb
    }
  ];
  for (const [label, sizeKb] of [
    ["admin preview chunk (MarkdownPreview)", sizes.previewKb],
    ["total JS (assets/*.js)", sizes.totalJsKb],
    ["total CSS (assets/*.css)", sizes.cssKb]
  ]) {
    if (sizeKb !== undefined) rows.push({ label, sizeKb, budgetKb: null, ok: true });
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
  const entryFiles = new Set(entries.map((rel) => path.join(DIST_DIR, rel)));
  const chunks = assetFiles
    .filter((file) => file.endsWith(".js"))
    .map((file) => {
      const content = fs.readFileSync(file, "utf8");
      return {
        name: path.basename(file),
        content,
        kb: gzipKb(Buffer.from(content)),
        isEntry: entryFiles.has(file)
      };
    });
  const largest = (kind) =>
    chunks
      .filter((chunk) => !chunk.isEntry && classifyChunk(chunk.name) === kind)
      .reduce((top, chunk) => (top && top.kb >= chunk.kb ? top : chunk), null);
  const admin = largest("admin");
  const preview = largest("adminPreview");
  const route = largest("route");
  if (!admin) {
    console.error("bundle-budget: no AdminRoutes-*.js chunk found in dist/assets.");
    process.exit(1);
  }
  const totalGzipKb = (ext) =>
    assetFiles
      .filter((file) => file.endsWith(ext))
      .reduce((total, file) => total + gzipKb(fs.readFileSync(file)), 0);

  const sizes = {
    entryJsKb,
    largestRouteKb: route ? route.kb : 0,
    largestRouteName: route ? route.name : undefined,
    adminKb: admin.kb,
    previewKb: preview ? preview.kb : undefined,
    totalJsKb: totalGzipKb(".js"),
    cssKb: totalGzipKb(".css")
  };
  const budget = parseBudget(fs.readFileSync(BUDGET_FILE, "utf8"));
  const { rows, failures } = evaluateBudget(sizes, budget);
  for (const name of inlinedSvgChunks(chunks)) {
    failures.push(`${name} inlines an SVG as a data URI; avatars must stay files`);
  }
  for (const name of parserLeaks(chunks)) {
    failures.push(
      `${name} contains the markdown parser; it belongs only in the admin preview chunk`
    );
  }

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
