#!/usr/bin/env node
// Rebuilds montserrat-latin.woff2: the latin subset of Montserrat, one variable file
// covering weights 400 to 700. Only the stress theme (stressBrand.ts) and the width
// check use it; the app never loads it. Montserrat is licensed under the SIL Open Font
// License 1.1 (https://openfontlicense.org), which allows bundling it as a test fixture.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const css = await (
  await fetch("https://fonts.googleapis.com/css2?family=Montserrat:wght@400..700", {
    // A modern browser user agent makes Google answer with woff2.
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    }
  })
).text();
const latin = css.split("/* ").find((block) => block.startsWith("latin */"));
const url = latin && /url\(([^)]+)\) format\('woff2'\)/.exec(latin)?.[1];
if (!url) throw new Error(`no latin woff2 url in response:\n${css}`);
const font = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync(path.join(dir, "montserrat-latin.woff2"), font);
console.log(`wrote ${font.length} bytes`);
