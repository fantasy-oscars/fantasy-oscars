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
      out.push({ check: "clipped-text", description: describe(el) });
    }

    // 3. Overlapping interactive elements, and 4. touch targets.
    const items = Array.from(document.querySelectorAll(INTERACTIVE)).filter((el) => {
      if (!visible(el)) return false;
      const r = rectOf(el);
      return r.width > 1 && r.height > 1 && onscreen(r);
    });
    const open = (el: Element) => el.closest('[role="menu"], [role="listbox"]') !== null;
    // Stacked by design: scrolling content passes under fixed or sticky chrome and under
    // overlays outside its scroll container, a number input's steppers sit inside its
    // field, and the specimen's header previews are squeezed to the phone width.
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
    const designed = (a: Element, b: Element) => {
      const field = a.closest(".mantine-NumberInput-root");
      return (
        pinned(a) !== pinned(b) ||
        scrollParent(a) !== scrollParent(b) ||
        (field !== null && field === b.closest(".mantine-NumberInput-root")) ||
        a.closest(".specimen-headerCell, .specimen-section .site-header") !== null
      );
    };
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!;
        const b = items[j]!;
        if (a.contains(b) || b.contains(a) || (open(a) && open(b)) || designed(a, b))
          continue;
        const ra = rectOf(a);
        const rb = rectOf(b);
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w <= 1 || h <= 1) continue;
        const cx = Math.max(ra.left, rb.left) + w / 2;
        const cy = Math.max(ra.top, rb.top) + h / 2;
        if (cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight) {
          const hit = document.elementFromPoint(cx, cy);
          if (!hit || !(a.contains(hit) || b.contains(hit))) continue;
        }
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
        if (el.closest(".specimen-headerCell, .specimen-section .site-header")) continue;
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

/** axe color-contrast only: the one rule this tier enforces. */
export async function contrastFindings(page: Page): Promise<Finding[]> {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      check: "contrast" as const,
      description: `${node.target.join(" ")} | ${node.html.slice(0, 100)}`
    }))
  );
}
