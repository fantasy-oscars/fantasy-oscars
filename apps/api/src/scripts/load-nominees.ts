import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

type IconInput = { id: number; code: string; name: string; asset_path: string };
type CeremonyInput = { id: number; code: string; name: string; year: number };
type CategoryFamilyInput = {
  id: number;
  code: string;
  name: string;
  icon_id: number;
  default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
};
type CategoryEditionInput = {
  id: number;
  ceremony_id: number;
  family_id: number;
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon_id: number | null;
  sort_index: number;
};
type FilmInput = { id: number; title: string; country: string | null };
type SongInput = { id: number; title: string; film_id: number };
type PerformanceInput = { id: number; film_id: number; person_id: number };
type PersonInput = { id: number; full_name: string };
type NominationInput = {
  id: number;
  category_edition_id: number;
  film_id: number | null;
  song_id: number | null;
  performance_id: number | null;
};
type NominationContributorInput = {
  id: number;
  nomination_id: number;
  person_id: number;
  role_label: string | null;
  sort_order: number;
};

type Dataset = {
  icons: IconInput[];
  ceremonies: CeremonyInput[];
  category_families: CategoryFamilyInput[];
  category_editions: CategoryEditionInput[];
  films: FilmInput[];
  songs: SongInput[];
  performances: PerformanceInput[];
  people: PersonInput[];
  nominations: NominationInput[];
  nomination_contributors: NominationContributorInput[];
};

async function insertAll<T>(pool: Pool, table: string, columns: (keyof T)[], rows: T[]) {
  if (!rows?.length) return;
  const colNames = columns.map((c) => String(c)).join(", ");
  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
  const text = `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  for (const row of rows) {
    const values = columns.map((c) => (row as Record<string, unknown>)[c as string]);
    await pool.query(text, values);
  }
}

export async function loadNominees(pool: Pool, dataset: Dataset) {
  await pool.query("BEGIN");
  try {
    await insertAll(pool, "icon", ["id", "code", "name", "asset_path"], dataset.icons);
    await insertAll(pool, "ceremony", ["id", "code", "name", "year"], dataset.ceremonies);
    await insertAll(
      pool,
      "category_family",
      ["id", "code", "name", "icon_id", "default_unit_kind"],
      dataset.category_families
    );
    await insertAll(
      pool,
      "category_edition",
      ["id", "ceremony_id", "family_id", "unit_kind", "icon_id", "sort_index"],
      dataset.category_editions
    );
    await insertAll(pool, "person", ["id", "full_name"], dataset.people);
    await insertAll(pool, "film", ["id", "title", "country"], dataset.films);
    await insertAll(pool, "song", ["id", "title", "film_id"], dataset.songs);
    await insertAll(
      pool,
      "performance",
      ["id", "film_id", "person_id"],
      dataset.performances
    );
    await insertAll(
      pool,
      "nomination",
      ["id", "category_edition_id", "film_id", "song_id", "performance_id"],
      dataset.nominations
    );
    await insertAll(
      pool,
      "nomination_contributor",
      ["id", "nomination_id", "person_id", "role_label", "sort_order"],
      dataset.nomination_contributors
    );
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

function readDataset(filePath: string): Dataset {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as Dataset;
}

async function main() {
  const args = process.argv.slice(2);
  const fileArgIndex = args.indexOf("--file");
  const file =
    fileArgIndex !== -1 && args[fileArgIndex + 1]
      ? args[fileArgIndex + 1]
      : path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../db/fixtures/golden-nominees.json"
        );

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const dataset = readDataset(file);
  const pool = new Pool({ connectionString });
  try {
    await loadNominees(pool, dataset);
    // eslint-disable-next-line no-console
    console.log(`Loaded nominees from ${file}`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
