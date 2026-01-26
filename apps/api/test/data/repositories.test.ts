import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { startTestDatabase, truncateAllTables } from "../db.js";
import {
  createLeague,
  deleteLeague,
  getLeagueById,
  updateLeagueName
} from "../../src/data/repositories/leagueRepository.js";
import {
  createDraft,
  deleteDraft,
  getDraftById,
  updateDraftStatus
} from "../../src/data/repositories/draftRepository.js";
import { createExtantSeason } from "../../src/data/repositories/seasonRepository.js";
import { runInTransaction } from "../../src/data/db.js";

async function seedBase(pool: Pool) {
  const icon = await pool.query(
    `INSERT INTO icon (code, name, asset_path) VALUES ('icon', 'Icon', '/icon') RETURNING id`
  );
  const ceremony = await pool.query(
    `INSERT INTO ceremony (code, name, year) VALUES ('2025', '2025 Oscars', 2025) RETURNING id`
  );
  await pool.query(
    `INSERT INTO category_family (code, name, icon_id, default_unit_kind)
     VALUES ('fam', 'Family', $1, 'FILM')`,
    [icon.rows[0].id]
  );
  await pool.query(
    `INSERT INTO app_user (username, email) VALUES ('user1','u1@example.com')`
  );
  return { ceremonyId: ceremony.rows[0].id, userId: 1 };
}

describe("data repositories", () => {
  it("supports CRUD for leagues and drafts with transactions", async () => {
    let pool;
    let stop;

    const started = await startTestDatabase();
    pool = started.pool;
    stop = started.stop;

    await truncateAllTables(pool);
    const { ceremonyId, userId } = await seedBase(pool);

    try {
      await runInTransaction(pool, async (client) => {
        const league = await createLeague(client, {
          code: "league-1",
          name: "Test League",
          ceremony_id: ceremonyId,
          max_members: 10,
          roster_size: 5,
          is_public: false,
          created_by_user_id: userId
        });

        const season = await createExtantSeason(client, {
          league_id: league.id,
          ceremony_id: ceremonyId
        });

        const draft = await createDraft(client, {
          league_id: league.id,
          season_id: season.id,
          status: "PENDING",
          draft_order_type: "SNAKE"
        });

        const fetchedLeague = await getLeagueById(client, league.id);
        expect(fetchedLeague?.name).toBe("Test League");

        const updatedLeague = await updateLeagueName(client, league.id, "Updated League");
        expect(updatedLeague?.name).toBe("Updated League");

        const fetchedDraft = await getDraftById(client, draft.id);
        expect(fetchedDraft?.status).toBe("PENDING");

        const updatedDraft = await updateDraftStatus(client, draft.id, "IN_PROGRESS");
        expect(updatedDraft?.status).toBe("IN_PROGRESS");

        await deleteDraft(client, draft.id);
        await deleteLeague(client, league.id);
      });
    } finally {
      if (stop) await stop();
    }
  }, 20000);
});
