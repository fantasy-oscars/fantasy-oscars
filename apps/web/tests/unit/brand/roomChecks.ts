// Draft room contract checks as pure functions over a BrandDefinition, so the unit
// tests, the broken-fixture tests and the visual stress definition share one rule set
// (docs/design/prescriptions/06, section 6.1). Relative imports only: this module is
// also loaded from tests/visual, which has no `@/` alias.
import {
  ROOM_DEPTHS,
  ROOM_DROP_RANGE,
  ROOM_RING_COLORS,
  ROOM_RING_WIDTHS,
  ROOM_TAB_EDGES,
  ROOM_TITLE_FACES,
  ROOM_TITLE_FONTS,
  ROOM_WORK_FONTS,
  MODES,
  sharedByMode,
  sharedConstants,
  type BrandDefinition,
  type Mode
} from "../../../src/theme/brands";
import {
  ROOM_TAB_EDGE_MIN_CONTRAST,
  contrastRatio,
  pickTabEdge,
  roomTabRing
} from "../../../src/theme/brands/css";

/** Distance from the top of the header to the tab's lowest painted edge, before ring and drop. */
export const ROOM_TAB_BASE_EDGE_PX = 54;
/** The tab's lowest painted edge may not pass this (the 64 px header minus its rule). */
export const ROOM_TAB_MAX_EDGE_PX = 61;
/** Weights of the working font every brand must declare. */
export const ROOM_WORK_WEIGHTS = [400, 500, 600, 700] as const;

/** First family of a CSS font stack, without quotes. */
export function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

function px(value: string): number | undefined {
  if (value.trim() === "0") return 0;
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
  return m ? Number(m[1]) : undefined;
}

function oneOf(list: readonly unknown[], value: unknown): boolean {
  return list.includes(value);
}

/** Violations of the lever ranges and enums that do not depend on colour. `workFonts` defaults to the shipped list; the stress definition passes one that adds its own face. */
export function roomViolations(
  brand: BrandDefinition,
  options: { workFonts?: readonly string[] } = {}
): string[] {
  const { workFonts = ROOM_WORK_FONTS } = options;
  const out: string[] = [];
  const { room, shape, type, fonts } = brand;
  const at = `Brand "${brand.id}"`;

  if (!oneOf(ROOM_RING_WIDTHS, room.edge.ring))
    out.push(`${at}: ring ${room.edge.ring} is not allowed`);
  if (!oneOf(ROOM_RING_COLORS, room.edge.ringColor))
    out.push(`${at}: ringColor "${room.edge.ringColor}" is not allowed`);
  if (!oneOf(ROOM_DEPTHS, room.edge.depth))
    out.push(`${at}: depth "${room.edge.depth}" is not allowed`);
  if (!oneOf(ROOM_TITLE_FACES, room.titleFace))
    out.push(`${at}: titleFace "${room.titleFace}" is not allowed`);
  if (!oneOf(ROOM_TAB_EDGES, room.tabEdge))
    out.push(`${at}: tabEdge "${room.tabEdge}" is not allowed`);

  const { drop } = room.edge;
  if (!Number.isInteger(drop) || drop < ROOM_DROP_RANGE.min || drop > ROOM_DROP_RANGE.max)
    out.push(
      `${at}: drop ${drop} is not an integer in ${ROOM_DROP_RANGE.min} to ${ROOM_DROP_RANGE.max}`
    );
  if (room.edge.ring === 0 && drop !== 0)
    out.push(`${at}: drop ${drop} needs ring of at least 1`);

  const radii = [
    ["radiusSm", shape.radiusSm, 12],
    ["radiusMd", shape.radiusMd, 20],
    ["radiusLg", shape.radiusLg, 28]
  ] as const;
  for (const [name, value, max] of radii) {
    const n = px(value);
    if (n === undefined || n < 0 || n > max)
      out.push(`${at}: ${name} "${value}" is not 0 to ${max}px`);
  }
  if (shape.borderWidth !== "1px" && shape.borderWidth !== "2px")
    out.push(`${at}: borderWidth "${shape.borderWidth}" is not 1px or 2px`);

  const work = firstFamily(room.workFont);
  if (!oneOf(workFonts, work))
    out.push(`${at}: work font "${work}" is not in ROOM_WORK_FONTS`);
  if (room.titleFace === "display") {
    const display = firstFamily(type.displayFont);
    if (!oneOf(ROOM_TITLE_FONTS, display))
      out.push(`${at}: display font "${display}" is not in ROOM_TITLE_FONTS`);
  }
  const declared = new Set(
    fonts.faces
      .filter((f) => f.family === work && f.styles.includes("normal"))
      .flatMap((f) => f.weights)
  );
  for (const w of ROOM_WORK_WEIGHTS) {
    if (!declared.has(w))
      out.push(`${at}: faces do not declare weight ${w} of "${work}"`);
  }

  const lowest = roomTabLowestEdge(brand);
  if (lowest > ROOM_TAB_MAX_EDGE_PX)
    out.push(
      `${at}: tab lowest painted edge ${lowest}px is over ${ROOM_TAB_MAX_EDGE_PX}px`
    );
  return out;
}

/** The tab's lowest painted edge, in px from the top of the header. */
export function roomTabLowestEdge(brand: BrandDefinition): number {
  const { ring, drop } = roomTabRing(brand.room);
  return ROOM_TAB_BASE_EDGE_PX + ring + drop;
}

/** Violations of the tab edge contrast table (4.4); empty for brands whose tab draws no ring. */
export function tabEdgeViolations(brand: BrandDefinition): string[] {
  if (brand.room.tabEdge !== "ring" && brand.room.tabEdge !== "drop") return [];
  const out: string[] = [];
  const min = ROOM_TAB_EDGE_MIN_CONTRAST;
  for (const mode of MODES) {
    const { colors } = brand.modes[mode];
    const at = `Brand "${brand.id}" (${mode})`;
    const check = (label: string, a: string, b: string) => {
      const c = contrastRatio(a, b);
      if (c < min) out.push(`${at}: ${label} is ${c.toFixed(2)}:1, under ${min}:1`);
    };

    const rest = colors[brand.room.edge.ringColor];
    check("rest edge vs page", rest, colors.page);
    check("rest edge vs sunken", rest, colors.sunken);

    const tones = [
      ["on-primary", "primary", colors.primary],
      ["on-danger", "danger", sharedConstants["--fo-danger"]]
    ] as const;
    for (const [tone, fillName, fill] of tones) {
      const slot = pickTabEdge(brand, mode, fill);
      if (!slot) {
        out.push(
          `${at}: no ${tone} edge colour reaches ${min}:1 against ${fillName} and page`
        );
        continue;
      }
      check(`${tone} edge vs ${fillName}`, colors[slot], fill);
      check(`${tone} edge vs page`, colors[slot], colors.page);
    }

    const shared = sharedByMode[mode];
    const metals = [
      shared["--fo-win-gold"],
      sharedConstants["--fo-medal-silver"],
      sharedConstants["--fo-medal-bronze"]
    ];
    const finalEdge = shared["--fo-win-gold-on"];
    for (const metal of metals) check("final edge vs metal", finalEdge, metal);
    const edgeOnPage = contrastRatio(finalEdge, colors.page) >= min;
    const metalsOnPage = metals.every((m) => contrastRatio(m, colors.page) >= min);
    if (!edgeOnPage && !metalsOnPage)
      out.push(
        `${at}: neither the final edge nor every metal reaches ${min}:1 against page`
      );
  }
  return out;
}

/** Every derived draft-room property in the common block of a brand. */
export const ROOM_COMMON_PROPERTIES = [
  "--brand-room-font-work",
  "--brand-room-font-title",
  "--brand-room-title-weight",
  "--brand-room-ring",
  "--brand-room-ring-color",
  "--brand-room-drop",
  "--brand-room-card-shadow",
  "--brand-room-tab-keyline",
  "--brand-room-tab-border",
  "--brand-room-tab-ring",
  "--brand-room-tab-drop",
  "--brand-room-tab-lift"
] as const;

/** Every derived draft-room property in each active-mode block of a brand. */
export const ROOM_MODE_PROPERTIES = [
  "--brand-room-depth",
  "--brand-room-tab-edge",
  "--brand-room-tab-edge-on-primary",
  "--brand-room-tab-edge-on-danger"
] as const;

/** The selector of a brand's generated block: common, or one mode. */
export function brandBlockSelector(brand: BrandDefinition, mode?: Mode): string {
  const base = `:root[data-brand="${brand.id}"]`;
  if (!mode) return base;
  return mode === "light"
    ? `${base}[data-mantine-color-scheme="light"]`
    : `${base}:not([data-mantine-color-scheme="light"])`;
}

/** Violations of the generated CSS: the room properties a block declares versus the full list. */
export function roomCssViolations(css: string, brand: BrandDefinition): string[] {
  const out: string[] = [];
  const blocks: Array<[string, Mode | undefined, readonly string[]]> = [
    ["common", undefined, ROOM_COMMON_PROPERTIES],
    ["light", "light", ROOM_MODE_PROPERTIES],
    ["dark", "dark", ROOM_MODE_PROPERTIES]
  ];
  for (const [label, mode, expected] of blocks) {
    const header = `${brandBlockSelector(brand, mode)} {`;
    const block = css.split("\n\n").find((b) => b.startsWith(header));
    if (!block) {
      out.push(`Brand "${brand.id}": no ${label} block in the generated CSS`);
      continue;
    }
    const names = [...block.matchAll(/^ {2}(--brand-room-[\w-]+):/gm)].map((m) => m[1]!);
    for (const name of expected) {
      if (!names.includes(name))
        out.push(`Brand "${brand.id}" ${label}: missing ${name}`);
    }
    for (const name of names) {
      if (!expected.includes(name))
        out.push(`Brand "${brand.id}" ${label}: unexpected ${name}`);
    }
  }
  return out;
}
