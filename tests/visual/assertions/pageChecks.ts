import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** One failing element on one screen; `description` is what an allowlist entry matches. */
export type Finding = {
  check: "overflow" | "clipped-text" | "overlap" | "touch-target" | "contrast" | "load";
  description: string;
};

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
