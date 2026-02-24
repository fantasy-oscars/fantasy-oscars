import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../../..");

const SCAN_ROOTS = [
  "apps",
  "packages",
  "tests/e2e",
  ".github/scripts"
].map((p) => path.join(REPO_ROOT, p));

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const BANNED_SUBSTRINGS = [
  "eslint-disable",
  "@ts-ignore",
  "@ts-nocheck",
  "@ts-expect-error",
  "prettier-ignore",
  "biome-ignore"
];

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (
        ent.name === "node_modules" ||
        ent.name === "dist" ||
        ent.name === "build" ||
        ent.name === ".git"
      ) {
        continue;
      }
      yield* walk(full);
      continue;
    }
    const ext = path.extname(ent.name);
    if (!CODE_EXTS.has(ext)) continue;
    yield full;
  }
}

test("repo contains no inline lint/typecheck escape hatch comments", async () => {
  const offenders = [];

  for (const root of SCAN_ROOTS) {
    for await (const filePath of walk(root)) {
      const rel = path.relative(REPO_ROOT, filePath);
      if (rel === "tests/unit/tooling/no-escape-hatches.test.mjs") continue;
      const text = await fs.readFile(filePath, "utf8");

      for (const needle of BANNED_SUBSTRINGS) {
        if (!text.includes(needle)) continue;
        offenders.push({ file: rel, needle });
      }
    }
  }

  assert.equal(
    offenders.length,
    0,
    `Found banned escape hatch markers:\n${offenders
      .map((o) => `- ${o.file}: ${o.needle}`)
      .join("\n")}`
  );
});
