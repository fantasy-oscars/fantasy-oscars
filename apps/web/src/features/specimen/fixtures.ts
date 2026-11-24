import type { BannerRow } from "@/orchestration/chrome";
import type { SeasonListItem } from "@/decisions/seasonList";
import bannerError from "./content/banner-error.md?mdast";
import bannerInfo from "./content/banner-info.md?mdast";
import bannerSuccess from "./content/banner-success.md?mdast";
import bannerWarning from "./content/banner-warning.md?mdast";
import markdownSample from "./content/markdown-sample.md?mdast";

// Static data for the specimen page. The long names mirror the visual suite's seed
// (tests/visual/support/seed.ts and dataset.ts) so a brand's truncation is judged on
// the same strings the real screens show.

/** Marker proving the specimen is in a bundle; the production build must not contain it. */
export const SPECIMEN_MARKER = "fo-specimen-7f3a91";

export const LONG_USERNAME =
  "theatre-obsessive-and-world-cinema-completionist-since-1999";
export const LONG_FILM_TITLE = "Saint Marguerite of the Docks";
export const FILM_TITLES = [
  "The Salt Cartographer",
  "Midnight at the Lantern Pier",
  "A Quiet Thunder",
  LONG_FILM_TITLE
] as const;

export const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/__specimen", label: "Leagues" },
  { to: "/seasons", label: "Seasons" },
  { to: "/ceremonies", label: "Ceremonies" }
];

export const SPECIMEN_USER = {
  sub: "specimen-long",
  username: LONG_USERNAME,
  is_admin: false,
  admin_role: "NONE" as const,
  avatar_key: "elephant"
};

export const SPECIMEN_USER_SHORT = {
  sub: "specimen-avery",
  username: "avery",
  is_admin: false,
  admin_role: "NONE" as const,
  avatar_key: "giraffe"
};

export const STATUS_LABELS = [
  { label: "Drafting", note: "drafting" },
  { label: "In progress", note: "live" },
  { label: "Paused", note: "paused" },
  { label: "Complete", note: "complete" },
  { label: "Pre-draft", note: "neutral" }
] as const;

export const SEASONS: SeasonListItem[] = [
  {
    kind: "ceremony",
    id: 1,
    title: "Golden Reel Awards 2035",
    statusLabel: "Drafting",
    createdAt: "2035-01-10T00:00:00Z",
    ceremonyId: 1,
    ceremonyCode: "golden-reel-2035",
    isNavigable: true,
    note: null
  },
  {
    kind: "ceremony",
    id: 2,
    title: "Golden Reel Awards 2034",
    statusLabel: "Complete",
    createdAt: "2034-01-10T00:00:00Z",
    ceremonyId: 2,
    ceremonyCode: "golden-reel-2034",
    isNavigable: false,
    note: null
  }
];

export const BANNERS: BannerRow[] = (
  [
    ["info", "Draft night moves to Saturday.", bannerInfo],
    ["warning", "Picks lock at **8:00 pm** tonight.", bannerWarning],
    ["success", "Your league is ready. [Open it](/leagues).", bannerSuccess],
    ["error", "Live results are delayed; refresh in a minute.", bannerError]
  ] as const
).map(([variant, body, tree], id) => ({
  id,
  title: variant,
  body_markdown: body,
  body_tree: tree,
  variant,
  dismissible: true,
  starts_at: null,
  ends_at: null,
  published_at: null
}));

/** The sample's Markdown is in `content/markdown-sample.md`, parsed at build time. */
export const MARKDOWN_SAMPLE_TREE = markdownSample;

export const SELECT_OPTIONS = ["Best Picture", "Best Director", "Best Original Score"];

export type SpecimenNominee = {
  id: string;
  label: string;
  muted: boolean;
  selected: boolean;
  winner: boolean;
  posterUrl: null;
  filmTitle: string | null;
  filmYear: number | null;
  contributors: string[];
  songTitle: null;
  performerName: null;
  performerCharacter: null;
  performerProfileUrl: null;
  performerProfilePath: null;
};

export function nominee(
  id: number,
  label: string,
  state: Partial<Pick<SpecimenNominee, "muted" | "selected" | "winner">> = {}
): SpecimenNominee {
  return {
    id: String(id),
    label,
    muted: false,
    selected: false,
    winner: false,
    posterUrl: null,
    filmTitle: label,
    filmYear: 2034,
    contributors: [],
    songTitle: null,
    performerName: null,
    performerCharacter: null,
    performerProfileUrl: null,
    performerProfilePath: null,
    ...state
  };
}

/**
 * The nominee pill states. Pointer hover, focus and the disabled pill are forced on the
 * element with the given aria-label (see forceStates.ts); the rest are real class
 * combinations CategoryCard renders from its props.
 */
export const PILL_CARD_TITLE = "Best Picture";
export const PILL_STATES = {
  default: nominee(101, "Default"),
  hoverMatch: nominee(102, "Hover (match)"),
  hoverPointer: nominee(103, "Hover (pointer)"),
  armed: nominee(104, "Armed", { selected: true }),
  won: nominee(105, "Won", { winner: true, muted: true }),
  wonHover: nominee(106, "Won and hover", { winner: true, muted: true }),
  wonArmed: nominee(107, "Won and armed", { winner: true, selected: true }),
  focus: nominee(108, "Focus"),
  long: nominee(109, LONG_FILM_TITLE)
};
export const HOVER_MATCH_IDS = new Set([102, 106, 502]);
export const FORCED_PILLS: ReadonlyArray<{
  label: string;
  states: readonly ("hover" | "focus")[];
}> = [
  { label: `${PILL_CARD_TITLE}: ${PILL_STATES.hoverPointer.label}`, states: ["hover"] },
  { label: `${PILL_CARD_TITLE}: ${PILL_STATES.focus.label}`, states: ["focus"] }
];

export const DISABLED_CARD_TITLE = "Best Director";
export const DISABLED_PILLS = [
  nominee(201, "Disabled", { muted: true }),
  nominee(202, "Not draftable")
];

/** The icon audit: the card icon in both variants beside a default, a muted and a winner pill. */
export const ICON_PUNCHOUT_TITLE = "Icon, punchout";
export const ICON_DEFAULT_TITLE = "Icon, plain";
export const ICON_AUDIT_PILLS = [
  nominee(401, "Default pill"),
  nominee(402, "Muted pill", { muted: true }),
  nominee(403, "Winner pill", { winner: true, muted: true })
];

/** Every pill state, rendered with the punchout icon variant (default, armed, hover-match, muted, winner). */
export const PUNCHOUT_STATES_TITLE = "Pill states, punchout";
export const PUNCHOUT_PILLS = [
  nominee(501, "Default"),
  nominee(502, "Hover (match)"),
  nominee(503, "Armed", { selected: true }),
  nominee(504, "Muted", { muted: true }),
  nominee(505, "Winner", { winner: true, muted: true })
];

export const BOARD_COLUMNS = [
  [
    {
      id: "cat-picture",
      title: "Best Picture",
      nominees: [
        nominee(301, FILM_TITLES[0]),
        nominee(302, FILM_TITLES[1], { muted: true }),
        nominee(303, LONG_FILM_TITLE, { winner: true, muted: true }),
        nominee(304, FILM_TITLES[2])
      ]
    }
  ],
  [
    {
      id: "cat-director",
      title: "Best Director",
      nominees: [
        nominee(311, "Imogen Verhaeren"),
        nominee(312, "Tobias Achterberg"),
        nominee(313, "Rosalind Okonkwo-Dray", { muted: true })
      ]
    }
  ]
];

/** Three short cards over two columns: stacked in one, side by side across both. */
export const EDGE_COLUMNS = [
  [
    {
      id: "edge-a",
      title: "Best Editing",
      nominees: [nominee(601, FILM_TITLES[0]), nominee(602, FILM_TITLES[1])]
    },
    {
      id: "edge-b",
      title: "Best Score",
      nominees: [nominee(603, FILM_TITLES[2]), nominee(604, FILM_TITLES[0])]
    }
  ],
  [
    {
      id: "edge-c",
      title: "Best Sound",
      nominees: [nominee(605, FILM_TITLES[1]), nominee(606, FILM_TITLES[2])]
    }
  ]
];
