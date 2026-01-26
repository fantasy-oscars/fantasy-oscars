// Thin shim so tooling can keep invoking `.github/scripts/db-migrate.mjs`.
// The real implementation lives in `apps/api/scripts` so Node can resolve `pg`
// without requiring root workspace dependencies (important for filtered installs).
import "../../apps/api/scripts/db-migrate.mjs";

