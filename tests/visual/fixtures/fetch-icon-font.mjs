#!/usr/bin/env node
// Rebuilds material-symbols.woff2: a subset of Material Symbols Outlined holding only
// the glyphs listed in material-symbols-icons.txt (one ligature name per line).
// Run it after the app starts using a new icon, then update the baselines.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const names = readFileSync(path.join(dir, "material-symbols-icons.txt"), "utf8")
  .split("\n")
  .map((n) => n.trim())
  .filter(Boolean)
  .sort();

const css = await (
  await fetch(
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:" +
      `opsz,wght,FILL,GRAD@20..48,400..700,0..1,-50..200&icon_names=${names.join(",")}`,
    // A modern browser user agent makes Google answer with woff2.
    {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
      }
    }
  )
).text();
const url = /url\(([^)]+)\) format\('woff2'\)/.exec(css)?.[1];
if (!url) throw new Error(`no woff2 url in response:\n${css}`);
const font = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync(path.join(dir, "material-symbols.woff2"), font);
console.log(`wrote ${font.length} bytes for ${names.length} icons`);
