import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB_SRC = path.join(ROOT, "apps", "web", "src");
const WEB_CSS = path.join(ROOT, "apps", "web", "src", "styles.css");

/** @param {string} dir */
function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** @param {string} file */
function isTsx(file) {
  return file.endsWith(".tsx");
}

/** @param {string} file */
function isTs(file) {
  return file.endsWith(".ts") && !file.endsWith(".d.ts");
}

/** @param {string} file */
function isTsOrTsx(file) {
  return isTs(file) || isTsx(file);
}

const PATTERNS = [
  {
    name: "numeric-gap-prop",
    re: /\bgap=\{\d+\}/g,
    hint: 'Use a token string instead (e.g. gap="var(--fo-space-8)").'
  },
  {
    name: "numeric-spacing-prop",
    re: /\b(mt|mb|ml|mr|mx|my|pt|pb|pl|pr|px|py|p|m)=\{\d+\}/g,
    hint: 'Use a token string instead (e.g. mt="var(--fo-space-8)").'
  },
  {
    name: "numeric-size-prop",
    re: /\b(w|h|miw|mih|maw|mah|size|radius|fz|fw)=\{\d+\}/g,
    hint:
      "Use a token string instead (e.g. w=\"var(--fo-layout-fieldBasis-md)\" or fw=\"var(--fo-font-weight-bold)\")."
  },
  {
    name: "inline-style-prop",
    re: /\bstyle=\{\{/g,
    hint:
      "Avoid inline styles; use theme tokens via CSS vars or a CSS module. For dynamic CSS vars use useCssVars()."
  },
  {
    name: "style-prop",
    re: /\bstyle=\{/g,
    hint:
      "Avoid style props; prefer theme/component defaults or CSS modules referencing tokens. For dynamic CSS vars use useCssVars()."
  },
  {
    name: "mantine-direct-import",
    re: /from\s+["']@mantine\/(core|hooks)["']/g,
    hint: "Do not import Mantine directly outside ui/ wrappers; import from @ui instead."
  }
];

/** @type {Array<{file:string; line:number; pattern:string; snippet:string; hint:string}>} */
const violations = [];

for (const file of walk(WEB_SRC)) {
  if (!isTsOrTsx(file)) continue;

  const rel = path.relative(ROOT, file);
  const relFromWebSrc = path.relative(WEB_SRC, file).replaceAll(path.sep, "/");
  const isUiWrapper = relFromWebSrc.startsWith("ui/");
  const isThemeLayer = relFromWebSrc.startsWith("theme/");

  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of PATTERNS) {
      // JSX-only checks should only run on TSX files.
      if (!isTsx(file)) {
        if (
          p.name === "numeric-gap-prop" ||
          p.name === "numeric-spacing-prop" ||
          p.name === "numeric-size-prop" ||
          p.name === "inline-style-prop" ||
          p.name === "style-prop"
        )
          continue;
      }

      // Mantine is allowed only in the wrapper and theme layers.
      if (p.name === "mantine-direct-import" && (isUiWrapper || isThemeLayer)) continue;

      // We never allow `style=` props in feature code (including wrappers).
      // Dynamic CSS vars should be applied with useCssVars() / useSortableInlineStyle().
      if (p.re.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          pattern: p.name,
          snippet: line.trim(),
          hint: p.hint
        });
      }
      p.re.lastIndex = 0;
    }
  }
}

// CSS literals check (styles.css only). We allow px in media query conditions and comments, but
// disallow raw literals in declarations (token-first styling).
if (fs.existsSync(WEB_CSS)) {
  const css = fs.readFileSync(WEB_CSS, "utf8");

  const cssPatterns = [
    {
      name: "css-px-declaration",
      re: /\b\d+(?:\.\d+)?px\s*;/g,
      hint: "Replace raw px declarations with CSS variables (tokens)."
    },
    {
      name: "css-opacity-literal",
      re: /opacity:\s*0\.\d+/g,
      hint: "Use alpha tokens (e.g. opacity: var(--fo-alpha-60))."
    },
    {
      name: "css-letter-spacing-literal",
      re: /letter-spacing:\s*0\.\d+em/g,
      hint: "Use letter-spacing tokens (e.g. var(--fo-letterSpacing-tracked))."
    },
    {
      name: "css-rgba-alpha-literal",
      re: /rgba\([^)]*,\s*0\.\d+\s*\)/g,
      hint: "Use rgba(..., var(--fo-alpha-XX)) with alpha tokens."
    }
  ];

  const cssLines = css.split(/\r?\n/);
  for (let i = 0; i < cssLines.length; i++) {
    const line = cssLines[i];
    // Ignore comment-only lines; values in comments are allowed.
    if (line.trim().startsWith("/*") || line.trim().startsWith("*") || line.trim().startsWith("*/"))
      continue;
    for (const p of cssPatterns) {
      if (p.re.test(line)) {
        violations.push({
          file: path.relative(ROOT, WEB_CSS),
          line: i + 1,
          pattern: p.name,
          snippet: line.trim(),
          hint: p.hint
        });
      }
      p.re.lastIndex = 0;
    }
  }
}

if (violations.length > 0) {
  console.error("Token check failed:\n");
  for (const v of violations) {
    console.error(`${v.file}:${v.line} [${v.pattern}] ${v.snippet}\n  -> ${v.hint}\n`);
  }
  process.exit(1);
}
