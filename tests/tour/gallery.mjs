#!/usr/bin/env node
// Builds tour-output/index.html from the tour's manifest: one section per stage of
// the season, each screenshot with its title, caption, persona, path and day.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = process.env.TOUR_OUTPUT_DIR ?? path.join(repoRoot, "tour-output");
const manifestPath = path.join(outDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`No manifest at ${manifestPath}; run the tour first.`);
  process.exit(1);
}
const { generated, shots } = JSON.parse(readFileSync(manifestPath, "utf8"));
const skippedPath = path.join(outDir, "skipped.txt");
const skipped = existsSync(skippedPath)
  ? readFileSync(skippedPath, "utf8").split("\n").filter(Boolean)
  : [];

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
  );

const sections = [];
for (const s of shots) {
  if (sections.at(-1)?.name !== s.section) sections.push({ name: s.section, shots: [] });
  sections.at(-1).shots.push(s);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Player tour</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; background: #f6f5f2; color: #1d1b17; }
  header, section { max-width: 1200px; margin: 0 auto; padding: 24px; }
  nav a { margin-right: 12px; }
  figure { margin: 0 0 40px; background: #fff; border: 1px solid #ddd8cc; border-radius: 8px; overflow: hidden; }
  figure img { display: block; width: 100%; height: auto; border-bottom: 1px solid #ddd8cc; }
  figcaption { padding: 12px 16px; }
  .meta { color: #6b6457; font-size: 13px; }
  h2 { border-bottom: 2px solid #1d1b17; padding-bottom: 4px; }
</style>
</head>
<body>
<header>
  <h1>Player tour</h1>
  <p class="meta">${shots.length} screens · generated ${esc(generated)}${skipped.length ? ` · ${skipped.length} step(s) skipped` : ""}</p>
  <nav>${sections.map((s, i) => `<a href="#s${i}">${esc(s.name)}</a>`).join("")}</nav>
  ${skipped.length ? `<details><summary>Skipped steps</summary><ul>${skipped.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></details>` : ""}
</header>
${sections
  .map(
    (sec, i) => `<section id="s${i}">
  <h2>${esc(sec.name)}</h2>
  ${sec.shots
    .map(
      (s) => `<figure>
    <img src="${esc(s.file)}" alt="${esc(s.title)}" loading="lazy">
    <figcaption><strong>${esc(s.title)}</strong> — ${esc(s.caption)}
      <div class="meta">${esc(s.persona)} · ${esc(s.path)} · day ${s.day}</div></figcaption>
  </figure>`
    )
    .join("\n  ")}
</section>`
  )
  .join("\n")}
</body>
</html>
`;
writeFileSync(path.join(outDir, "index.html"), html);
console.log(`Gallery: ${path.join(outDir, "index.html")} (${shots.length} screens)`);
