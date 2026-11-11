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

// Raw colour / font / radius literals may appear only in brand definition files
// (apps/web/src/theme/brands/). Everything else must reference contract (or
// derived) tokens. Checked across every ts, tsx and css file in the web app.
const BRAND_DIR = "theme/brands/";
// Icon fonts are not part of a brand's typography.
const ALLOWED_FONT_FAMILIES = ["Material Symbols Outlined"];

const brandLiteralPatterns = [
  {
    name: "raw-hex-colour",
    re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g,
    hint: "Reference a brand slot (var(--brand-*)) or a shared token (var(--fo-*)); raw colours live in theme/brands/."
  },
  {
    name: "raw-rgb-colour",
    re: /\b(?:rgba?|hsla?)\(\s*\d/g,
    hint: "Use rgba(var(--brand-<slot>-rgb), alpha) or a shared channel token such as --fo-black-rgb."
  },
  {
    name: "raw-font-family",
    re: /(?:font-family|fontFamily)["']?\s*:\s*(?![`'"]?var\()(?:[`'"]|[A-Za-z])/g,
    hint: "Use var(--brand-font-*) or var(--fo-font-system); font stacks live in theme/brands/."
  },
  {
    name: "raw-radius",
    re: /(?:border-radius|[-\w]*radius[-\w]*)["'`]?\s*:\s*[`'"]?\d+(?:\.\d+)?px/g,
    hint: "Use var(--brand-radius-*) / --fo-radius-* tokens; radius values live in theme/brands/."
  }
];

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
}

for (const file of walk(WEB_SRC)) {
  if (!(isTsOrTsx(file) || file.endsWith(".css"))) continue;
  const relFromWebSrc = path.relative(WEB_SRC, file).replaceAll(path.sep, "/");
  if (relFromWebSrc.startsWith(BRAND_DIR)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    for (const p of brandLiteralPatterns) {
      if (!p.re.test(line)) continue;
      p.re.lastIndex = 0;
      if (
        p.name === "raw-font-family" &&
        ALLOWED_FONT_FAMILIES.some((f) => line.includes(`"${f}"`))
      )
        continue;
      violations.push({
        file: path.relative(ROOT, file),
        line: i + 1,
        pattern: p.name,
        snippet: line.trim(),
        hint: p.hint
      });
    }
  }
}

// Draft room lock (draft room prescription, section 6.3). A theme reaches the draft room only
// through derived --brand-room-* and slot properties, so draft CSS and components never branch
// on which brand is active or read an enum-valued property.
const BRAND_IDS_FILE = path.join(ROOT, "packages", "shared", "src", "brands.ts");
const BRAND_SLUGS = (() => {
  const src = fs.readFileSync(BRAND_IDS_FILE, "utf8");
  const list = /BRAND_IDS\s*=\s*\[([^\]]*)\]/.exec(src)?.[1] ?? "";
  const slugs = [...list.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
  if (slugs.length === 0)
    throw new Error(`Could not read BRAND_IDS from ${BRAND_IDS_FILE}`);
  return slugs;
})();
const slugAlternation = BRAND_SLUGS.map((s) => s.replace(/[-]/g, "\\-")).join("|");

const DRAFT_SELECTOR = /\.(?:dr|drh|drm)-|\.fo-tip-/;
const DRAFT_CSS_PATTERNS = [
  {
    name: "draft-css-data-brand",
    re: /\[data-brand/,
    hint: "Draft rules must not select on the active brand; read --brand-room-* and slot properties."
  },
  {
    name: "draft-css-enum-property",
    re: /--brand-(?:button-shape|nav-active|rule-style|wordmark-two-tone)(?![\w-])/,
    hint: "Enum-valued properties are not for the draft room; read a derived property instead."
  },
  {
    name: "draft-css-brand-slug",
    // Only word characters bound a slug, so a hyphen-joined one (`.dr-noir`) is caught too.
    re: new RegExp(`(?<!\\w)(?:${slugAlternation})(?!\\w)`),
    hint: "Draft rules must not name a brand."
  },
  {
    name: "draft-css-pill-radius",
    re: /border-radius\s*:\s*var\(--fo-radius-pill\)/,
    hint: "Draft shapes follow the brand: --brand-radius-sm (clamped for pills) or --brand-button-radius, never the always-round token."
  }
];

/**
 * Splits CSS into style rules (nested at-rule bodies included) with the line of each
 * rule's selector. Comments are blanked out so they cannot hide or fake a match.
 * @param {string} source
 * @returns {Array<{ selector: string; body: string; line: number }>}
 */
function cssRules(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  /** @type {Array<{ selector: string; body: string; line: number }>} */
  const rules = [];
  /** @param {number} from @param {number} to */
  function scan(from, to) {
    let i = from;
    while (i < to) {
      const open = text.indexOf("{", i);
      if (open === -1 || open >= to) return;
      let depth = 1;
      let j = open + 1;
      while (j < to && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const prelude = text.slice(i, open);
      const lead = prelude.length - prelude.trimStart().length;
      const selector = prelude.trim();
      const line = text.slice(0, i + lead).split("\n").length;
      if (selector.startsWith("@")) scan(open + 1, j - 1);
      else rules.push({ selector, body: text.slice(open + 1, j - 1), line });
      i = j;
    }
  }
  scan(0, text.length);
  return rules;
}

for (const file of walk(WEB_SRC)) {
  if (!file.endsWith(".css")) continue;
  const rel = path.relative(ROOT, file);
  for (const rule of cssRules(fs.readFileSync(file, "utf8"))) {
    if (!DRAFT_SELECTOR.test(rule.selector)) continue;
    for (const p of DRAFT_CSS_PATTERNS) {
      const m = p.re.exec(`${rule.selector} {${rule.body}}`);
      if (!m) continue;
      violations.push({
        file: rel,
        line: rule.line,
        pattern: p.name,
        snippet: `${rule.selector.split("\n").pop()?.trim() ?? ""} (matched "${m[0]}")`,
        hint: p.hint
      });
    }
  }
}

const DRAFT_TS_PATTERNS = [
  {
    name: "draft-brand-import",
    re: /(?:from\s+|import\s*\(\s*|import\s+)["'][^"']*(?:theme\/brands|shared\/brands|\/brands)(?:\/[^"']*)?["']/,
    hint: "Draft code must not import a brand module; the room reads derived CSS properties."
  },
  {
    name: "draft-data-brand-read",
    re: /data-brand|dataset\.brand/,
    hint: "Draft code must not read the active brand."
  },
  {
    name: "draft-brand-id-comparison",
    re: new RegExp(`(?:[!=]==?|\\bcase)\\s*["'\`](?:${slugAlternation})["'\`]`),
    hint: "Draft code must not branch on a brand id."
  }
];

for (const file of walk(path.join(WEB_SRC, "features", "draft"))) {
  if (!isTsOrTsx(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    for (const p of DRAFT_TS_PATTERNS) {
      if (!p.re.test(line)) continue;
      violations.push({
        file: path.relative(ROOT, file),
        line: i + 1,
        pattern: p.name,
        snippet: line.trim(),
        hint: p.hint
      });
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
