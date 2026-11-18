import "dotenv/config";

import { createPool } from "../data/db.js";
import { checkCircuitWaivers } from "../services/circuit/circuitWaiverScheduler.js";

/*
 * One waiver scheduler check, on demand: runs every Circuit waiver window
 * whose resolution has passed and that has no completed run, under the
 * scheduler's advisory lock. Safe to repeat; a completed window is never run
 * twice. See docs/runbooks/operational-runbook.md, "Circuit waiver runs".
 *
 *   tsx src/scripts/run-circuit-waivers.ts
 */

async function main() {
  const pool = createPool(process.env.DATABASE_URL ?? "");
  try {
    const results = await checkCircuitWaivers(pool);
    if (results === null) {
      console.log({ ran: 0, message: "Another instance holds the waiver lock." });
      return;
    }
    console.log({ ran: results.length, results });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
