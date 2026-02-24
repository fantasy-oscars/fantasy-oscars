import type { DbClient } from "../../data/db.js";
import type express from "express";
import { registerSeasonMembersAddRoute } from "./membersAdd.js";
import { registerSeasonMembersLeaveRoute } from "./membersLeave.js";
import { registerSeasonMembersListRoute } from "./membersList.js";
import { registerSeasonMembersRemoveRoute } from "./membersRemove.js";
import { registerSeasonMembersTransferOwnershipRoute } from "./membersTransferOwnership.js";

export function registerSeasonMemberRoutes(args: {
  router: express.Router;
  client: DbClient;
}) {
  const { router, client } = args;
  registerSeasonMembersListRoute({ router, client });
  registerSeasonMembersAddRoute({ router, client });
  registerSeasonMembersRemoveRoute({ router, client });
  registerSeasonMembersTransferOwnershipRoute({ router, client });
  registerSeasonMembersLeaveRoute({ router, client });
}
