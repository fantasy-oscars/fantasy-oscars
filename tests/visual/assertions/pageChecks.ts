import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { FIXED_NOW } from "../support/seed";
import { runFrozenIntervals } from "../support/page";

/** One failing element on one screen; `description` is what an allowlist entry matches. */
export type Finding = {
  check:
    | "overflow"
    | "clipped-text"
    | "overlap"
    | "touch-target"
    | "contrast"
    | "load"
    | RoomCheck;
  description: string;
};

/** Names of the draft room geometry checks (`roomFindings`), so an allowlist entry can pick one. */
export type RoomCheck =
  | "room-rail-align"
  | "room-card-gap"
  | "room-roster-gap"
  | "room-roster-width"
  | "room-header-height"
  | "room-header-contain"
  | "room-tab-top"
  | "room-tab-edge"
  | "room-tab-children"
  | "room-tab-wings"
  | "room-tab-width"
  | "room-tab-missing"
  | "room-roster-missing"
  | "room-icon-contrast"
  | "room-punchout-contrast"
  | "room-chip-avatar"
  | "room-pill-radius";

/**
 * The "must exist" rule of 6.4: on every draft screen a `.drh-tab` must be found, and on
 * the roster board a `[data-roster-track]`, so the tab and roster checks cannot pass
 * vacuously. Off until draft-room-redesigns (chunk 3 of the draft room template) renders
 * them; that change flips this to true.
 */
export const REQUIRE_ROOM_ELEMENTS = false;

/** Draft screens in the matrix (`draft-plans` is a planning page, not the room). */
export function isDraftRoomScreen(id: string): boolean {
  return id.startsWith("draft-") && id !== "draft-plans";
}

/**
 * Measures a loaded page for the structural checks. Runs in the page; scans only
 * visible elements so it stays fast on the biggest screens.
 */
export async function structuralFindings(page: Page, phone: boolean): Promise<Finding[]> {
  return page.evaluate((isPhone) => {
    const out: { check: string; description: string }[] = [];
    const INTERACTIVE =
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"]';

    const describe = (el: Element) => {
      const classes = Array.from(el.classList)
        .filter((c) => !/^m_[0-9a-f]+$/.test(c) && !c.startsWith("fo-force-"))
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join("");
      const label = el.getAttribute("aria-label");
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${classes}${label ? `[aria-label="${label}"]` : ""} "${text}"`;
    };
    const visible = (el: Element) =>
      (el as HTMLElement).checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true
      });
    const rectOf = (el: Element) => el.getBoundingClientRect();
    const onscreen = (r: DOMRect) => r.right > 0 && r.left < window.innerWidth;

    // 1. Horizontal overflow of the document.
    const scroller = document.scrollingElement ?? document.documentElement;
    if (scroller.scrollWidth > window.innerWidth) {
      out.push({
        check: "overflow",
        description: `document scrollWidth ${scroller.scrollWidth} > ${window.innerWidth}`
      });
    }

    // 2. Clipped text without recourse.
    const GLYPH_TOLERANCE = 2;
    const glyphOverflow = (box: HTMLElement) => {
      const left = box.getBoundingClientRect().left + box.clientLeft;
      const top = box.getBoundingClientRect().top + box.clientTop;
      const right = left + box.clientWidth;
      const bottom = top + box.clientHeight;
      const found = { x: false, y: false };
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const holder = node.parentElement;
        if (!holder || !(node.textContent ?? "").trim() || !visible(holder)) continue;
        // The last glyph's advance includes letter-spacing that paints nothing.
        const trailing =
          Math.max(parseFloat(getComputedStyle(holder).letterSpacing), 0) || 0;
        // A text rect is the font's content area; when the line box is shorter (line-height
        // 1) the glyphs still sit inside it, so compare the line box.
        const lineHeight = parseFloat(getComputedStyle(holder).lineHeight);
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) {
          if (r.width === 0 && r.height === 0) continue;
          const inset = lineHeight < r.height ? (r.height - lineHeight) / 2 : 0;
          if (
            r.right - trailing > right + GLYPH_TOLERANCE ||
            r.left < left - GLYPH_TOLERANCE
          )
            found.x = true;
          if (
            r.bottom - inset > bottom + GLYPH_TOLERANCE ||
            r.top + inset < top - GLYPH_TOLERANCE
          )
            found.y = true;
        }
      }
      return found;
    };
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      const clips = (v: string) => v === "hidden" || v === "clip";
      if (!clips(style.overflowX) && !clips(style.overflowY)) continue;
      // The specimen's own frames and header cells clip by design (fixed-size previews).
      if ([...el.classList].some((c) => c.startsWith("specimen-"))) continue;
      const box = el as HTMLElement;
      if (box.clientWidth < 2 || box.clientHeight < 2) continue;
      const overX = clips(style.overflowX) && box.scrollWidth > box.clientWidth + 1;
      const overY = clips(style.overflowY) && box.scrollHeight > box.clientHeight + 1;
      if (!overX && !overY) continue;
      if (!(el.textContent ?? "").trim() || !visible(el)) continue;
      const truncates =
        style.textOverflow === "ellipsis" ||
        (style.getPropertyValue("-webkit-line-clamp") !== "none" &&
          style.getPropertyValue("-webkit-line-clamp") !== "");
      const exposed =
        el.closest("[title], [aria-label]") !== null ||
        el.querySelector("[title], [aria-label]") !== null;
      if (truncates && exposed) continue;
      // scrollWidth also counts trailing letter-spacing and sub-pixel rounding, which hide
      // nothing. Clipped means a glyph itself reaches past the box.
      const glyphs = glyphOverflow(box);
      if (!((overX && glyphs.x) || (overY && glyphs.y))) continue;
      out.push({ check: "clipped-text", description: describe(el) });
    }

    // 3. Overlapping interactive elements, and 4. touch targets.
    const items = Array.from(document.querySelectorAll(INTERACTIVE)).filter((el) => {
      if (!visible(el)) return false;
      const r = rectOf(el);
      return r.width > 1 && r.height > 1 && onscreen(r);
    });
    const open = (el: Element) => el.closest('[role="menu"], [role="listbox"]') !== null;
    // Stacked by design: fixed or sticky chrome paints over flow content, content in a
    // scroll container passes under anything outside it, and a number input's steppers
    // sit inside its field.
    const pinned = (el: Element) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const position = getComputedStyle(n).position;
        if (position === "fixed" || position === "sticky") return n;
      }
      return null;
    };
    const scrollParent = (el: Element) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const style = getComputedStyle(n);
        if (/(auto|scroll)/.test(style.overflowX + style.overflowY)) return n;
      }
      return null;
    };
    const sitsOver = (top: Element, under: Element) => {
      if (pinned(top) && !pinned(under)) return true;
      const container = scrollParent(under);
      return (
        container !== null && scrollParent(top) !== container && !container.contains(top)
      );
    };
    const inOneStepperField = (a: Element, b: Element) => {
      const field = a.closest(".mantine-NumberInput-root");
      return field !== null && field === b.closest(".mantine-NumberInput-root");
    };
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!;
        const b = items[j]!;
        if (
          a.contains(b) ||
          b.contains(a) ||
          (open(a) && open(b)) ||
          inOneStepperField(a, b)
        )
          continue;
        const ra = rectOf(a);
        const rb = rectOf(b);
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w <= 1 || h <= 1) continue;
        const cx = Math.max(ra.left, rb.left) + w / 2;
        const cy = Math.max(ra.top, rb.top) + h / 2;
        // Whichever of the two paints on top at the middle of the overlap; off screen,
        // the pinned one is taken to be on top.
        let top: Element | null = pinned(a) ? a : pinned(b) ? b : null;
        if (cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight) {
          const hit = document.elementFromPoint(cx, cy);
          if (!hit || !(a.contains(hit) || b.contains(hit))) continue;
          top = a.contains(hit) ? a : b;
        }
        if (top && sitsOver(top, top === a ? b : a)) continue;
        out.push({
          check: "overlap",
          description: `${describe(a)} overlaps ${describe(b)}`
        });
      }
    }
    if (isPhone) {
      for (const el of items) {
        const r = rectOf(el);
        // Inline links inside running text are exempt (WCAG 2.5.8).
        if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
        if (r.width < 44 || r.height < 44) {
          out.push({
            check: "touch-target",
            description: `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`
          });
        }
      }
    }
    return out;
  }, phone) as Promise<Finding[]>;
}

/**
 * Shown placeholders against the field behind them. axe's color-contrast rule skips
 * placeholder text, so a field's hint could sit far below 4.5:1 without a finding.
 */
async function placeholderFindings(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { check: "contrast"; description: string }[] = [];
    const canvas = document.createElement("canvas").getContext("2d");
    if (!canvas) return out;
    const rgba = (css: string): [number, number, number, number] => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = "#000";
      canvas.fillStyle = css;
      canvas.fillRect(0, 0, 1, 1);
      const d = canvas.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const luminance = ([r, g, b]: number[]) => {
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const backdrop = (el: Element): [number, number, number] => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const c = rgba(getComputedStyle(node).backgroundColor);
        if (c[3] === 1) return [c[0], c[1], c[2]];
      }
      return [255, 255, 255];
    };
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input[placeholder], textarea[placeholder]"
    );
    for (const el of fields) {
      if (el.value || !el.placeholder || !el.checkVisibility()) continue;
      const style = getComputedStyle(el, "::placeholder");
      const ink = rgba(style.color);
      const back = backdrop(el);
      const alpha = ink[3] * Number(style.opacity || 1);
      const mixed = [0, 1, 2].map((i) => ink[i] * alpha + back[i] * (1 - alpha));
      const [hi, lo] = [luminance(mixed), luminance(back)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < 4.5) {
        out.push({
          check: "contrast",
          description: `${el.tagName.toLowerCase()}::placeholder "${el.placeholder.slice(0, 30)}" ${ratio.toFixed(2)}:1 | ${el.outerHTML.slice(0, 80)}`
        });
      }
    }
    return out;
  });
}

/** axe color-contrast, plus the placeholder pairs axe skips: the contrast checks this tier enforces. */
export async function contrastFindings(page: Page): Promise<Finding[]> {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const axe = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      check: "contrast" as const,
      description: `${node.target.join(" ")} | ${node.html.slice(0, 100)}`
    }))
  );
  return [...axe, ...(await placeholderFindings(page))];
}

const TAB_CLOCK_TICKS_MS = [1000, 2000] as const;
const CLOCK_TEXT_SELECTOR = ".drh-buckleCenter, .drm-clockText";

/**
 * The header tab's width must not move as the clock ticks. The suite freezes intervals,
 * so a tick is a step of the page's clock plus one run of the app's one-second interval
 * callbacks (runFrozenIntervals), then a layout pass; the tab's width and the clock text
 * are read after each step. The clock text must change between measurements, or the check
 * measured nothing. Only meaningful on a screen with a running countdown.
 */
export async function roomTabWidthFindings(page: Page): Promise<Finding[]> {
  const measure = () =>
    page.evaluate((clockSelector) => {
      const tab = document.querySelector(".drh-tab");
      return {
        width: tab ? tab.getBoundingClientRect().width : null,
        text: document.querySelector(clockSelector)?.textContent ?? null
      };
    }, CLOCK_TEXT_SELECTOR);
  const before = await measure();
  if (before.width === null) {
    return REQUIRE_ROOM_ELEMENTS
      ? [
          {
            check: "room-tab-missing",
            description: "no .drh-tab on the countdown screen"
          }
        ]
      : [];
  }
  const out: Finding[] = [];
  let previousText = before.text;
  try {
    for (const ms of TAB_CLOCK_TICKS_MS) {
      await page.clock.setFixedTime(new Date(Date.parse(FIXED_NOW) + ms));
      await runFrozenIntervals(page, 1000);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      const after = await measure();
      if (after.text === previousText) {
        out.push({
          check: "room-tab-width",
          description: `clock did not tick: "${after.text}" after a ${ms / 1000}s step`
        });
      }
      previousText = after.text;
      if (after.width === null || Math.abs(after.width - before.width) > 0.5) {
        out.push({
          check: "room-tab-width",
          description: `.drh-tab width ${before.width} then ${after.width} after a ${ms / 1000}s clock tick ("${after.text}")`
        });
      }
    }
  } finally {
    await page.clock.setFixedTime(new Date(FIXED_NOW));
  }
  return out;
}

/**
 * The draft room's geometry rules (docs/design/prescriptions/06, section 6.4), measured on
 * a loaded draft screen. Each rule is skipped when its subject is not on the screen, except
 * where REQUIRE_ROOM_ELEMENTS makes the tab and the roster track mandatory.
 */
export async function roomFindings(page: Page, phone: boolean): Promise<Finding[]> {
  return page.evaluate(
    ([isPhone, requireElements]) => {
      const out: { check: string; description: string }[] = [];
      const TOL = 0.5;
      const visible = (el: Element) =>
        (el as HTMLElement).checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true
        });
      const all = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).filter(visible);
      const describe = (el: Element) => {
        const classes = Array.from(el.classList)
          .filter((c) => !/^m_[0-9a-f]+$/.test(c) && !c.startsWith("fo-force-"))
          .slice(0, 2)
          .map((c) => `.${c}`)
          .join("");
        return `${el.tagName.toLowerCase()}${classes}`;
      };
      const px = (value: string) => Number.parseFloat(value) || 0;
      const rootStyle = getComputedStyle(document.documentElement);
      const token = (name: string) => px(rootStyle.getPropertyValue(name));

      // Colours: resolved through a canvas so any computed syntax becomes rgba.
      const canvas = document.createElement("canvas").getContext("2d");
      const rgba = (css: string): [number, number, number, number] => {
        if (!canvas) return [0, 0, 0, 1];
        canvas.clearRect(0, 0, 1, 1);
        canvas.fillStyle = "#000";
        canvas.fillStyle = css;
        canvas.fillRect(0, 0, 1, 1);
        const d = canvas.getImageData(0, 0, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
      };
      const luminance = ([r, g, b]: number[]) => {
        const lin = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
      };
      const ratio = (a: number[], b: number[]) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi! + 0.05) / (lo! + 0.05);
      };
      const backdrop = (el: Element | null): [number, number, number] => {
        for (let node = el; node; node = node.parentElement) {
          const c = rgba(getComputedStyle(node).backgroundColor);
          if (c[3] === 1) return [c[0], c[1], c[2]];
        }
        return [255, 255, 255];
      };

      // 1. Pill left edges equal within each rail.
      const rails: Array<[string, string]> = [
        [".dr-rail-ledger", ".dr-ledgerRow .dr-pill"],
        [".dr-rail-roster", ".dr-rosterRow .dr-pill"]
      ];
      for (const [railSelector, pillSelector] of rails) {
        for (const rail of all(railSelector)) {
          const lefts = Array.from(rail.querySelectorAll(pillSelector))
            .filter(visible)
            .map((p) => p.getBoundingClientRect().left);
          if (lefts.length < 2) continue;
          const lo = Math.min(...lefts);
          const hi = Math.max(...lefts);
          if (hi - lo > TOL) {
            out.push({
              check: "room-rail-align",
              description: `${railSelector} pill left edges differ by ${(hi - lo).toFixed(1)}px (${lo.toFixed(1)} to ${hi.toFixed(1)}) in ${lefts.length} rows`
            });
          }
        }
      }

      // 2. Card gaps, counting the painted edge: the hard layers of the card's shadow.
      const splitLayers = (value: string) => {
        const layers: string[] = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < value.length; i++) {
          const ch = value[i];
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
          else if (ch === "," && depth === 0) {
            layers.push(value.slice(start, i));
            start = i + 1;
          }
        }
        layers.push(value.slice(start));
        return layers.map((l) => l.trim()).filter((l) => l && l !== "none");
      };
      const painted = (el: Element) => {
        const ext = { top: 0, right: 0, bottom: 0, left: 0 };
        for (const layer of splitLayers(getComputedStyle(el).boxShadow)) {
          if (/\binset\b/.test(layer)) continue;
          const nums = (
            layer
              .replace(/(rgba?|color|oklab|oklch|hsla?)\([^)]*\)/g, "")
              .match(/-?\d*\.?\d+px/g) ?? []
          ).map(px);
          const [x = 0, y = 0, blur = 0, spread = 0] = nums;
          // Soft layers are translucent depth, outside the geometry (5.1).
          if (blur > 0) continue;
          ext.top = Math.max(ext.top, spread - y);
          ext.bottom = Math.max(ext.bottom, spread + y);
          ext.left = Math.max(ext.left, spread - x);
          ext.right = Math.max(ext.right, spread + x);
        }
        return ext;
      };
      const MIN_DOWN = 12;
      const MIN_ACROSS = 10;
      const cardsByParent = new Map<Element, Element[]>();
      for (const card of all(".dr-card")) {
        const parent = card.parentElement;
        if (!parent) continue;
        cardsByParent.set(parent, [...(cardsByParent.get(parent) ?? []), card]);
      }
      for (const cards of cardsByParent.values()) {
        for (let i = 1; i < cards.length; i++) {
          const above = cards[i - 1]!;
          const below = cards[i]!;
          const gap =
            below.getBoundingClientRect().top -
            painted(below).top -
            (above.getBoundingClientRect().bottom + painted(above).bottom);
          if (gap < MIN_DOWN - TOL) {
            out.push({
              check: "room-card-gap",
              description: `${describe(below)} is ${gap.toFixed(1)}px below its neighbour, under ${MIN_DOWN}`
            });
          }
        }
      }
      const columns = all(".dr-masonry-col");
      for (let i = 1; i < columns.length; i++) {
        const left = Array.from(columns[i - 1]!.children).filter(visible);
        const right = Array.from(columns[i]!.children).filter(visible);
        let worst: number | null = null;
        for (const a of left) {
          for (const b of right) {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const overlap = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (overlap <= 0) continue;
            const gap = rb.left - painted(b).left - (ra.right + painted(a).right);
            worst = worst === null ? gap : Math.min(worst, gap);
          }
        }
        if (worst !== null && worst < MIN_ACROSS - TOL) {
          out.push({
            check: "room-card-gap",
            description: `masonry columns ${i} and ${i + 1} are ${worst.toFixed(1)}px apart, under ${MIN_ACROSS}`
          });
        }
      }

      // 3. Roster track: columns at least 12 px apart and, on desktop, 176 px wide.
      const track = document.querySelector("[data-roster-track]");
      if (track) {
        const cols = Array.from(track.children).filter(visible);
        for (let i = 1; i < cols.length; i++) {
          const gap =
            cols[i]!.getBoundingClientRect().left -
            cols[i - 1]!.getBoundingClientRect().right;
          if (gap < 12 - TOL) {
            out.push({
              check: "room-roster-gap",
              description: `roster columns ${i} and ${i + 1} are ${gap.toFixed(1)}px apart, under 12`
            });
          }
        }
        if (!isPhone) {
          for (const [i, col] of cols.entries()) {
            const width = col.getBoundingClientRect().width;
            if (width < 176 - TOL) {
              out.push({
                check: "room-roster-width",
                description: `roster column ${i + 1} is ${width.toFixed(1)}px wide, under 176`
              });
            }
          }
        }
      } else if (requireElements && document.querySelector(".dr-roster")) {
        out.push({
          check: "room-roster-missing",
          description: "the roster board has no [data-roster-track]"
        });
      }

      // 4. Header box.
      for (const header of all(".dr-header")) {
        const h = header.getBoundingClientRect().height;
        if (Math.abs(h - 64) > TOL) {
          out.push({
            check: "room-header-height",
            description: `.dr-header is ${h.toFixed(1)}px tall, not 64`
          });
        }
        // Every control sits inside the header's box (1px tolerance), never clipped or overhanging.
        if (!isPhone) {
          const box = header.getBoundingClientRect();
          const INTERACTIVE =
            'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="radio"]';
          for (const el of Array.from(header.querySelectorAll(INTERACTIVE))) {
            if (!visible(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.top < box.top - 1 || r.bottom > box.bottom + 1) {
              out.push({
                check: "room-header-contain",
                description: `${describe(el)} spans y ${(r.top - box.top).toFixed(1)} to ${(r.bottom - box.top).toFixed(1)}, outside the 0-${box.height.toFixed(0)} header`
              });
            }
          }
        }
      }

      // 5. Header tab.
      const tabs = all(".drh-tab");
      if (tabs.length === 0 && requireElements) {
        out.push({ check: "room-tab-missing", description: "no .drh-tab on the screen" });
      }
      for (const tab of tabs) {
        const rect = tab.getBoundingClientRect();
        const header = tab.closest(".dr-header, .dr-mobileHeader");
        const headerTop = header ? header.getBoundingClientRect().top : 0;
        const ring = token("--brand-room-tab-ring");
        const drop = token("--brand-room-tab-drop");
        if (rect.top > headerTop + TOL || rect.top < headerTop - ring - TOL) {
          out.push({
            check: "room-tab-top",
            description: `.drh-tab top is ${(rect.top - headerTop).toFixed(1)}px from the header top (ring ${ring}px)`
          });
        }
        const lowest = rect.bottom + ring + drop - headerTop;
        if (lowest > 61 + TOL) {
          out.push({
            check: "room-tab-edge",
            description: `.drh-tab paints to ${lowest.toFixed(1)}px from the header top, over 61`
          });
        }
        for (const child of Array.from(tab.querySelectorAll("*")).filter(visible)) {
          const r = child.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (
            r.left < rect.left - TOL ||
            r.right > rect.right + TOL ||
            r.top < rect.top - TOL ||
            r.bottom > rect.bottom + TOL
          ) {
            out.push({
              check: "room-tab-children",
              description: `${describe(child)} reaches outside .drh-tab`
            });
          }
        }
        for (const wing of all(".drh-wing")) {
          const w = wing.getBoundingClientRect();
          const across = Math.min(w.right, rect.right) - Math.max(w.left, rect.left);
          const down = Math.min(w.bottom, rect.bottom) - Math.max(w.top, rect.top);
          if (across > TOL && down > TOL) {
            out.push({
              check: "room-tab-wings",
              description: `${describe(wing)} intersects .drh-tab by ${across.toFixed(1)}px`
            });
          }
        }
      }

      // 6. Icon colour against the nearest opaque background, and the punchout circle.
      const seen = new Set<string>();
      for (const icon of all(".dr-frame .mi-icon, .dr-frame .gicon")) {
        const style = getComputedStyle(icon);
        const ink = rgba(style.color);
        const back = backdrop(icon);
        const mixed = [0, 1, 2].map((i) => ink[i]! * ink[3] + back[i]! * (1 - ink[3]));
        const r = ratio(mixed, back);
        if (r < 3) {
          const description = `${describe(icon)} ink ${style.color} on rgb(${back.join(", ")}) is ${r.toFixed(2)}:1`;
          if (!seen.has(description)) {
            seen.add(description);
            out.push({ check: "room-icon-contrast", description });
          }
        }
        if (icon.classList.contains("dr-icon-punchout")) {
          const circle = rgba(style.backgroundColor);
          const surface = backdrop(icon.parentElement);
          const cr = ratio(circle, surface);
          if (cr < 3) {
            const description = `${describe(icon)} circle ${style.backgroundColor} on rgb(${surface.join(", ")}) is ${cr.toFixed(2)}:1`;
            if (!seen.has(description)) {
              seen.add(description);
              out.push({ check: "room-punchout-contrast", description });
            }
          }
        }
      }

      // 7. The drafted chip lives in a tooltip that is not open on load, so a probe with
      // the chip's classes stands in; the rule is the stylesheet's, not the instance's.
      const frame = document.querySelector(".dr-frame") ?? document.body;
      const probe = document.createElement("div");
      probe.className = "fo-tip-draftedChip";
      probe.style.cssText = "position:fixed;left:-9999px;top:0";
      probe.innerHTML =
        '<div class="fo-tip-draftedChipAvatar"><span class="fo-animalAvatar"></span></div><span class="fo-tip-draftedChipName">x</span>';
      frame.append(probe);
      const avatarInk = rgba(
        getComputedStyle(probe.querySelector(".fo-animalAvatar")!, "::before")
          .backgroundColor
      );
      const wantInk = rgba(
        getComputedStyle(probe.querySelector(".fo-tip-draftedChipName")!).color
      );
      probe.remove();
      if (avatarInk.some((v, i) => Math.abs(v - wantInk[i]!) > 1)) {
        out.push({
          check: "room-chip-avatar",
          description: `.fo-tip-draftedChip avatar ink rgb(${avatarInk.slice(0, 3).join(", ")}) is not on-primary rgb(${wantInk.slice(0, 3).join(", ")})`
        });
      }

      // 8. Pills follow the small radius.
      const radiusProbe = document.createElement("div");
      // The small radius, clamped at half the 22px pill height (prescription 4.2).
      radiusProbe.style.borderRadius = "min(var(--brand-radius-sm), 11px)";
      document.body.append(radiusProbe);
      const wantRadius = getComputedStyle(radiusProbe).borderTopLeftRadius;
      radiusProbe.remove();
      const wrong = new Map<string, number>();
      for (const pill of all(".dr-pill")) {
        const got = getComputedStyle(pill).borderTopLeftRadius;
        if (got !== wantRadius) wrong.set(got, (wrong.get(got) ?? 0) + 1);
      }
      for (const [got, count] of wrong) {
        out.push({
          check: "room-pill-radius",
          description: `.dr-pill radius ${got}, expected ${wantRadius} (--brand-radius-sm clamped at half the pill height), on ${count} pills`
        });
      }
      return out;
    },
    [phone, REQUIRE_ROOM_ELEMENTS] as const
  ) as Promise<Finding[]>;
}
