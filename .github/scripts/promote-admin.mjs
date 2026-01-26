// Thin shim so tooling can keep invoking `.github/scripts/promote-admin.mjs`.
// The real implementation lives in `apps/api/scripts` so Node can resolve `pg`
// without requiring root workspace dependencies (important for filtered installs).
import "../../apps/api/scripts/promote-admin.mjs";

