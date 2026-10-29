// Production entrypoint: optionally run the migrator, then boot the API in this process
// (so signals reach the server directly). Set MIGRATE_ON_START=false when migrations
// run as a separate release step (`pnpm --filter @fantasy-oscars/api run migrate`).
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

function migrateOnStart(value) {
  if (value === undefined || value.trim() === "") return true;
  return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

if (migrateOnStart(process.env.MIGRATE_ON_START)) {
  const result = spawnSync(process.execPath, [path.join(here, "db-migrate.mjs")], {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error("Migration failed; refusing to start the API.");
    process.exit(result.status ?? 1);
  }
} else {
  console.log("MIGRATE_ON_START is disabled; skipping migrations.");
}

await import(pathToFileURL(path.resolve(here, "../dist/index.js")).href);
