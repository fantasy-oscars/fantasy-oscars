import "@testing-library/jest-dom/vitest";

// Mantine uses matchMedia for color scheme and reduced motion.
const noop = () => {};
const matchMediaStub = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: noop, // deprecated
  removeListener: noop, // deprecated
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).matchMedia = matchMediaStub;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).matchMedia = matchMediaStub;

// Mantine's ScrollArea relies on ResizeObserver, which isn't present in jsdom.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = TestResizeObserver;

// Mantine's Combobox keyboard navigation calls scrollIntoView for options.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
