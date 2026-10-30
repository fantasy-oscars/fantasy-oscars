/**
 * Fixed, fictional awards data for the visual suite. Everything here is a pure
 * function of its inputs, so the seeded database is identical on every run.
 */

export const FILMS = [
  "The Salt Cartographer",
  "Midnight at the Lantern Pier",
  "A Quiet Thunder",
  "Harbor of Small Mercies",
  "The Glass Orchard",
  "Velvet Static",
  "Northbound, Slowly",
  "The Last Ferryman of Orsk",
  "Paper Moons Over Calloway",
  "Everything the River Kept",
  "Brass Hours",
  "The Understudy's Understudy",
  "Fourteen Winters",
  "Saint Marguerite of the Docks",
  "Low Tide Opera",
  "The Weight of Marigolds",
  "Ashes for Adelaide",
  "A Field Guide to Leaving",
  "Copper Sky, Sleeping Dogs",
  "The Long Way to Halloran",
  "Tin Crown",
  "Moth Season",
  "Letters from the Observatory",
  "Where the Bells Go Quiet"
] as const;

export const PEOPLE = [
  "Imogen Verhaeren",
  "Tobias Achterberg",
  "Rosalind Okonkwo-Dray",
  "Mateo Quintanilla",
  "Saoirse Valdane",
  "Jun-ho Baek",
  "Odalys Ferreira",
  "Winston Hartigan",
  "Priya Nandakumar",
  "Lucien Delacroix-Moreau"
] as const;

export const SONGS = [
  "Lantern Song",
  "Carry Me Past the Harbor",
  "Static & Starlight",
  "The Ferryman's Waltz",
  "All the Quiet Things"
] as const;

type UnitKind = "FILM" | "SONG" | "PERFORMANCE";

export const CATEGORY_DEFS: ReadonlyArray<{
  code: string;
  name: string;
  unit: UnitKind;
  icon: string;
}> = [
  { code: "best-picture", name: "Best Picture", unit: "FILM", icon: "emoji_events" },
  { code: "best-director", name: "Best Director", unit: "FILM", icon: "movie" },
  { code: "best-actor", name: "Best Actor", unit: "PERFORMANCE", icon: "person" },
  { code: "best-actress", name: "Best Actress", unit: "PERFORMANCE", icon: "face" },
  {
    code: "best-original-song",
    name: "Best Original Song",
    unit: "SONG",
    icon: "music_note"
  },
  {
    code: "best-cinematography",
    name: "Best Cinematography",
    unit: "FILM",
    icon: "videocam"
  },
  {
    code: "best-original-score",
    name: "Best Original Score",
    unit: "FILM",
    icon: "piano"
  },
  {
    code: "best-animated-feature",
    name: "Best Animated Feature",
    unit: "FILM",
    icon: "palette"
  }
];

export const NOMINEES_PER_CATEGORY = 5;

type Dataset = {
  icons: { id: number; code: string; name: string; asset_path: string }[];
  ceremonies: { id: number; code: string; name: string; year: number }[];
  category_families: {
    id: number;
    code: string;
    name: string;
    icon_id: number;
    default_unit_kind: UnitKind;
  }[];
  category_editions: {
    id: number;
    ceremony_id: number;
    family_id: number;
    unit_kind: UnitKind;
    icon_id: number;
    sort_index: number;
  }[];
  films: { id: number; title: string; country: string | null }[];
  songs: { id: number; title: string; film_id: number }[];
  performances: { id: number; film_id: number; person_id: number }[];
  people: { id: number; full_name: string }[];
  nominations: {
    id: number;
    category_edition_id: number;
    film_id: number | null;
    song_id: number | null;
    performance_id: number | null;
  }[];
  nomination_contributors: never[];
};

/**
 * Builds the nominees for two ceremonies (ids 1 and 2) over a shared catalogue of
 * films, people and songs. Category editions are numbered 1..8 for the first
 * ceremony and 9..16 for the second; nominations are numbered in category order.
 */
export function buildDataset(ceremonies: Dataset["ceremonies"]): Dataset {
  const icons = [...new Set(CATEGORY_DEFS.map((c) => c.icon))].map((code, i) => ({
    id: i + 1,
    code,
    name: code,
    asset_path: `/icons/${code}.svg`
  }));
  const iconId = (code: string) => icons.find((i) => i.code === code)!.id;

  const films = FILMS.map((title, i) => ({
    id: i + 1,
    title,
    country: ["US", "GB", "FR", "KR", "MX", "IE"][i % 6] ?? null
  }));
  const people = PEOPLE.map((full_name, i) => ({ id: i + 1, full_name }));
  const songs = SONGS.map((title, i) => ({ id: i + 1, title, film_id: i * 3 + 1 }));
  const performances = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    film_id: ((i * 5) % films.length) + 1,
    person_id: (i % people.length) + 1
  }));

  const dataset: Dataset = {
    icons,
    ceremonies,
    category_families: CATEGORY_DEFS.map((c, i) => ({
      id: i + 1,
      code: c.code,
      name: c.name,
      icon_id: iconId(c.icon),
      default_unit_kind: c.unit
    })),
    category_editions: [],
    films,
    songs,
    performances,
    people,
    nominations: [],
    nomination_contributors: []
  };

  let nominationId = 0;
  ceremonies.forEach((ceremony, cIndex) => {
    CATEGORY_DEFS.forEach((def, dIndex) => {
      const editionId = cIndex * CATEGORY_DEFS.length + dIndex + 1;
      dataset.category_editions.push({
        id: editionId,
        ceremony_id: ceremony.id,
        family_id: dIndex + 1,
        unit_kind: def.unit,
        icon_id: iconId(def.icon),
        sort_index: dIndex + 1
      });
      for (let n = 0; n < NOMINEES_PER_CATEGORY; n++) {
        const k = cIndex * 7 + dIndex * 3 + n;
        dataset.nominations.push({
          id: ++nominationId,
          category_edition_id: editionId,
          film_id: def.unit === "FILM" ? (k % films.length) + 1 : null,
          song_id: def.unit === "SONG" ? (n % songs.length) + 1 : null,
          performance_id:
            def.unit === "PERFORMANCE" ? ((k * 3) % performances.length) + 1 : null
        });
      }
    });
  });
  return dataset;
}

/** Deterministic Fisher-Yates shuffle (mulberry32), so pick orders never change. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Snake order: seats ascend on odd rounds and descend on even ones. */
export function snakePick(pickNumber: number, seats: number) {
  const round = Math.floor((pickNumber - 1) / seats) + 1;
  const index = (pickNumber - 1) % seats;
  const seat = round % 2 === 1 ? index + 1 : seats - index;
  return { round, seat };
}
