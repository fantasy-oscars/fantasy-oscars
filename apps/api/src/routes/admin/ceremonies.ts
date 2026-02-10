import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminCeremonyArchiveRoute } from "./ceremonyArchive.js";
import { registerAdminCeremonyDraftBoardRoute } from "./ceremonyDraftBoard.js";
import { registerAdminCeremonyDeleteRoute } from "./ceremonyDelete.js";
import { registerAdminCeremonyDraftLockStatusRoute } from "./ceremonyDraftLockStatus.js";
import { registerAdminCeremonyLockRoute } from "./ceremonyLock.js";
import { registerAdminCeremonyPublishRoute } from "./ceremonyPublish.js";
import { registerAdminCeremoniesCreateRoute } from "./ceremoniesCreate.js";
import { registerAdminCeremoniesDraftCreateRoute } from "./ceremoniesDraftCreate.js";
import { registerAdminCeremonyGetRoute } from "./ceremoniesGet.js";
import { registerAdminCeremoniesListRoute } from "./ceremoniesList.js";
import { registerAdminCeremoniesUpdateRoute } from "./ceremoniesUpdate.js";

export function registerAdminCeremonyRoutes(router: Router, client: DbClient) {
  registerAdminCeremoniesListRoute({ router, client });
  registerAdminCeremonyGetRoute({ router, client });
  registerAdminCeremonyDraftBoardRoute({ router, client });
  registerAdminCeremonyDraftLockStatusRoute({ router, client });
  registerAdminCeremonyDeleteRoute({ router, client });
  registerAdminCeremonyPublishRoute({ router, client });
  registerAdminCeremonyLockRoute({ router, client });
  registerAdminCeremonyArchiveRoute({ router, client });
  registerAdminCeremoniesCreateRoute({ router, client });
  registerAdminCeremoniesDraftCreateRoute({ router, client });
  registerAdminCeremoniesUpdateRoute({ router, client });
}
