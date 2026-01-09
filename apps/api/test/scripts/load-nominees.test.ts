import { describe, expect, it } from "vitest";
import { startTestDatabase } from "../db.js";
import { loadNominees } from "../../src/scripts/load-nominees.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Move up to repo root, then into db/fixtures
const datasetPath = path.resolve(
  __dirname,
  "../../../../db/fixtures/golden-nominees.json"
);

function readDataset() {
  const raw = fs.readFileSync(datasetPath, "utf8");
  return JSON.parse(raw);
}

describe("load-nominees script", () => {
  it("loads the golden dataset idempotently", async () => {
    let db;
    db = await startTestDatabase();

    const { pool, stop } = db;
    const dataset = readDataset();

    try {
      await loadNominees(pool, dataset);
      await loadNominees(pool, dataset); // idempotent second run

      const tables = [
        "icon",
        "display_template",
        "ceremony",
        "category_family",
        "category_edition",
        "film",
        "nomination"
      ];
      for (const table of tables) {
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
        expect(rows[0].count).toBeGreaterThan(0);
      }

      const { rows } = await pool.query(
        `SELECT n.id, f.title, ce.id as category_edition_id
         FROM nomination n
         JOIN film f ON f.id = n.film_id
         JOIN category_edition ce ON ce.id = n.category_edition_id`
      );
      expect(rows[0].title).toBe("Example Film");
    } finally {
      await stop();
    }
  }, 20000);
});
