import type { BrowserContext, Page } from "@playwright/test";
import type { Sample } from "./measure";

/** The face that painted most of the node's glyphs. */
export type UsedFont = { family: string; custom: boolean };

/**
 * The faces the engine actually painted for each hook's text, by sample position (the
 * `data-spec-text` value measure.ts stamped). The computed `font-family` is only the
 * request: a face that failed to load falls back silently, and this is where that shows.
 * One sample per hook is enough, since every state of a hook renders the same text.
 */
export async function usedFonts(
  page: Page,
  context: BrowserContext,
  samples: readonly Sample[]
): Promise<Map<number, UsedFont>> {
  const out = new Map<number, UsedFont>();
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const done = new Set<string>();
    for (const [index, sample] of samples.entries()) {
      if (!sample.textCarrier || done.has(sample.hook)) continue;
      done.add(sample.hook);
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: `[data-spec-text="${index}"]`
      });
      if (!nodeId) continue;
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      const [dominant] = [...fonts].sort((a, b) => b.glyphCount - a.glyphCount);
      if (dominant)
        out.set(index, { family: dominant.familyName, custom: dominant.isCustomFont });
    }
  } finally {
    await cdp.detach().catch(() => undefined);
  }
  return out;
}
