import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminContentDynamicDraftCreateRoute } from "./contentDynamicDraftCreate.js";
import { registerAdminContentDynamicDraftPublishRoute } from "./contentDynamicDraftPublish.js";
import { registerAdminContentDynamicDraftUpdateRoute } from "./contentDynamicDraftUpdate.js";
import { registerAdminContentDynamicEntryDeleteRoute } from "./contentDynamicEntryDelete.js";
import { registerAdminContentDynamicEntryUnpublishRoute } from "./contentDynamicEntryUnpublish.js";
import { registerAdminContentDynamicListRoute } from "./contentDynamicList.js";
import { registerAdminContentDynamicUnpublishKeyRoute } from "./contentDynamicUnpublishKey.js";

export function registerAdminContentDynamicRoutes(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;
  registerAdminContentDynamicListRoute({ router, client });
  registerAdminContentDynamicDraftCreateRoute({ router, client });
  registerAdminContentDynamicDraftUpdateRoute({ router, client });
  registerAdminContentDynamicEntryUnpublishRoute({ router, client });
  registerAdminContentDynamicDraftPublishRoute({ router, client });
  registerAdminContentDynamicUnpublishKeyRoute({ router, client });
  registerAdminContentDynamicEntryDeleteRoute({ router, client });
}
