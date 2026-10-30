// The font families a brand may use and where their files come from. Pure data,
// shared by brand definitions, the build (vite/fonts.ts) and tests.
//
// `static` packages (@fontsource/*) ship one file per weight and style;
// `variable` packages (@fontsource-variable/*) ship one file per style that
// covers the whole weight axis. Every subset a package ships is declared with its
// unicode-range, so a browser downloads only the subsets a page's text needs.
export const FONT_CATALOG = {
  Cinzel: { pkg: "@fontsource/cinzel", kind: "static" },
  Inter: { pkg: "@fontsource/inter", kind: "static" },
  "Barlow Condensed": { pkg: "@fontsource/barlow-condensed", kind: "static" },
  "IBM Plex Mono": { pkg: "@fontsource/ibm-plex-mono", kind: "static" },
  "Playfair Display": {
    pkg: "@fontsource-variable/playfair-display",
    kind: "variable"
  },
  "Bodoni Moda": { pkg: "@fontsource-variable/bodoni-moda", kind: "variable" },
  Archivo: { pkg: "@fontsource-variable/archivo", kind: "variable" },
  Fraunces: { pkg: "@fontsource-variable/fraunces", kind: "variable" },
  "DM Sans": { pkg: "@fontsource-variable/dm-sans", kind: "variable" },
  "Instrument Sans": { pkg: "@fontsource-variable/instrument-sans", kind: "variable" }
} as const satisfies Record<string, { pkg: string; kind: "static" | "variable" }>;

export type FontFamily = keyof typeof FONT_CATALOG;

/** The subset preloaded and required for every declared face. */
export const PRIMARY_SUBSET = "latin";
/** A package's subset name, such as `latin`, `latin-ext`, `cyrillic` or `vietnamese`. */
export type FontSubset = string;

export type FontStyle = "normal" | "italic";

/** The weights and styles a brand uses from one family. */
export type FontNeed = {
  family: FontFamily;
  weights: readonly number[];
  styles: readonly FontStyle[];
};

export type FontFaceRef = { family: FontFamily; weight: number; style: FontStyle };

export type FontSlots = {
  /** Every family, weight and style the brand renders. Anything not listed is not loaded. */
  faces: readonly FontNeed[];
  /** The two faces preloaded before first paint (latin subset only). */
  preload: { display: FontFaceRef; body: FontFaceRef };
};
