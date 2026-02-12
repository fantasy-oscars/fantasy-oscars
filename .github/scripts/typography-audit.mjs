import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WEB_SRC = path.join(REPO_ROOT, "apps", "web", "src");

const TEXT_LIKE_EXTS = new Set([".ts", ".tsx"]);

function isIgnoredDir(name) {
  return (
    name === "node_modules" ||
    name === "dist" ||
    name === "build" ||
    name === ".next" ||
    name.startsWith(".")
  );
}

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (isIgnoredDir(ent.name)) continue;
      out.push(...(await walk(p)));
      continue;
    }
    const ext = path.extname(ent.name);
    if (!TEXT_LIKE_EXTS.has(ext)) continue;
    out.push(p);
  }
  return out;
}

function parseOpeningTags(source, tagName) {
  const results = [];
  const re = new RegExp(`<${tagName}\\b([^>]*)>`, "g");
  let m;
  while ((m = re.exec(source))) {
    results.push(m[1] ?? "");
  }
  return results;
}

function extractAttr(rawAttrs, name) {
  // Supports: name="x" | name={'x'} | name={123} | name={foo}
  const re = new RegExp(`${name}\\s*=\\s*(\"[^\"]*\"|\\{[^}]*\\})`);
  const m = rawAttrs.match(re);
  if (!m) return null;
  return m[1];
}

function normAttr(v) {
  if (!v) return null;
  return v.replace(/\s+/g, " ").trim();
}

function signatureForTitle(attrs) {
  const variant = normAttr(extractAttr(attrs, "variant")) ?? "∅";
  const order = normAttr(extractAttr(attrs, "order")) ?? "∅";
  const size = normAttr(extractAttr(attrs, "size")) ?? "∅";
  const fw = normAttr(extractAttr(attrs, "fw")) ?? "∅";
  return `Title variant=${variant} order=${order} size=${size} fw=${fw}`;
}

function signatureForText(attrs) {
  const variant = normAttr(extractAttr(attrs, "variant")) ?? "∅";
  const size = normAttr(extractAttr(attrs, "size")) ?? "∅";
  const fz = normAttr(extractAttr(attrs, "fz")) ?? "∅";
  const fw = normAttr(extractAttr(attrs, "fw")) ?? "∅";
  const c = normAttr(extractAttr(attrs, "c")) ?? "∅";
  const tt = normAttr(extractAttr(attrs, "tt")) ?? "∅";
  const lh = normAttr(extractAttr(attrs, "lh")) ?? "∅";
  const lineClamp = normAttr(extractAttr(attrs, "lineClamp")) ?? "∅";
  return `Text variant=${variant} size=${size} fz=${fz} fw=${fw} c=${c} tt=${tt} lh=${lh} lineClamp=${lineClamp}`;
}

function rel(p) {
  return path.relative(REPO_ROOT, p);
}

async function main() {
  const files = await walk(WEB_SRC);

  const titleSigs = new Map(); // sig -> {count, files:Set}
  const textSigs = new Map();

  for (const file of files) {
    const src = await fs.readFile(file, "utf8");

    for (const attrs of parseOpeningTags(src, "Title")) {
      const sig = signatureForTitle(attrs);
      const entry = titleSigs.get(sig) ?? { count: 0, files: new Set() };
      entry.count += 1;
      entry.files.add(rel(file));
      titleSigs.set(sig, entry);
    }

    for (const attrs of parseOpeningTags(src, "Text")) {
      const sig = signatureForText(attrs);
      const entry = textSigs.get(sig) ?? { count: 0, files: new Set() };
      entry.count += 1;
      entry.files.add(rel(file));
      textSigs.set(sig, entry);
    }
  }

  const sortByCountDesc = (a, b) => b[1].count - a[1].count;

  const titleList = [...titleSigs.entries()].sort(sortByCountDesc);
  const textList = [...textSigs.entries()].sort(sortByCountDesc);

  const report = {
    generatedAt: new Date().toISOString(),
    roots: {
      webSrc: rel(WEB_SRC)
    },
    totals: {
      files: files.length,
      titleSignatures: titleList.length,
      textSignatures: textList.length
    },
    titles: titleList.map(([sig, meta]) => ({
      signature: sig,
      count: meta.count,
      files: [...meta.files].slice(0, 10),
      filesTruncated: meta.files.size > 10
    })),
    texts: textList.map(([sig, meta]) => ({
      signature: sig,
      count: meta.count,
      files: [...meta.files].slice(0, 10),
      filesTruncated: meta.files.size > 10
    }))
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
