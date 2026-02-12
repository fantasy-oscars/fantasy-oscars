import "@testing-library/jest-dom/vitest";

// Mantine uses matchMedia for color scheme and reduced motion.
const matchMediaStub = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: (...args: unknown[]) => void args, // deprecated
  removeListener: (...args: unknown[]) => void args, // deprecated
  addEventListener: (...args: unknown[]) => void args,
  removeEventListener: (...args: unknown[]) => void args,
  dispatchEvent: (...args: unknown[]) => (void args, true)
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: matchMediaStub
});

// Some Mantine hooks read from globalThis rather than window directly.
Object.defineProperty(globalThis, "matchMedia", {
  writable: true,
  value: matchMediaStub
});

// Belt-and-suspenders: ensure the function is assigned (some environments keep an
// existing `matchMedia` key but start it as `undefined`).
type MatchMediaHost = { matchMedia?: (query: string) => MediaQueryList };
(window as Window & MatchMediaHost).matchMedia = matchMediaStub;
(globalThis as typeof globalThis & MatchMediaHost).matchMedia = matchMediaStub;

// Mantine's ScrollArea relies on ResizeObserver, which isn't present in jsdom.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(
  globalThis as typeof globalThis & {
    ResizeObserver: typeof TestResizeObserver;
  }
).ResizeObserver = TestResizeObserver;

// Mantine's Combobox keyboard navigation calls scrollIntoView for options.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
