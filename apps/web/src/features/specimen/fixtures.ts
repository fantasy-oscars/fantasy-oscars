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
export const HOVER_MATCH_IDS = new Set([102, 106]);
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
