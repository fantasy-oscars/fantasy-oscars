#!/usr/bin/env node
/**
 * Docs checks (lint + links) with concise, failure-first output.
 *
 * Why:
 * - Keep output scannable (print only actionable diagnostics).
 * - Halt immediately on failure (do not run subsequent checks).
 */

import { spawn } from "node:child_process";
import path from "node:path";

function bin(name) {
  return path.resolve(process.cwd(), "node_modules", ".bin", name);
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Encourage color-aware tools, but we mostly filter output anyway.
        FORCE_COLOR: process.env.FORCE_COLOR ?? "1"
      }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });

    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function printDiagnostics({ header, stdout, stderr, filter }) {
  const lines = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);

  const kept = filter ? lines.filter(filter) : lines;
  if (kept.length === 0) return;

  process.stderr.write(`${header}\n`);
  for (const line of kept) process.stderr.write(`${line}\n`);
}

async function main() {
  // 1) Markdown lint
  // Note: Keep this in sync with CI behavior. Many shells do not expand `**`
  // recursively by default, so `docs/**/*.md` would often lint only one level.
  // We intentionally lint one level of subdirectories for now.
  const lint = await run(bin("markdownlint-cli2"), ["README.md", "docs/*/*.md"]);
  if (lint.code !== 0) {
    printDiagnostics({
      header: "Docs lint failed:",
      stdout: lint.stdout,
      stderr: lint.stderr,
      filter: (line) => /\b(?:error|warning)\s+MD\d{3}\b/.test(line)
    });
    process.exit(lint.code);
  }

  // 2) Link check
  const links = await run(bin("remark"), [
    "--color",
    "README.md",
    "docs",
    "--use",
    "remark-validate-links",
    "--quiet",
    "--frail"
  ]);
  if (links.code !== 0) {
    printDiagnostics({
      header: "Docs links check failed:",
      stdout: links.stdout,
      stderr: links.stderr,
      filter: (line) => /\b(?:warning|error)\b/i.test(line)
    });
    process.exit(links.code);
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
