import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import {
  insertCeremony,
  insertCategoryEdition,
  insertNomination
} from "../../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

describe("nominees endpoints", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3120";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    const app = createServer({ db: db.pool });
    api = createApiAgent(app);
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
  });

  it("returns nominations only for the active ceremony", async () => {
    const ceremony = await insertCeremony(db.pool);
    const other = await insertCeremony(db.pool, { code: "other", year: 2030 }, false);

    const catActive = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
    const catOther = await insertCategoryEdition(db.pool, { ceremony_id: other.id });
    const nomActive = await insertNomination(db.pool, {
      category_edition_id: catActive.id
    });
    await insertNomination(db.pool, { category_edition_id: catOther.id });

    const res = await api.get("/ceremony/active/nominations");
    expect(res.status).toBe(200);
    const ids = res.body.nominations.map((n: { id: number }) => n.id);
    expect(ids).toContain(nomActive.id);
    expect(ids).not.toContain(catOther.id);
  });
});
