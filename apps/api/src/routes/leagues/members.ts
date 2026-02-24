import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerLeagueMembersDeleteLeagueRoute } from "./membersDeleteLeague.js";
import { registerLeagueMembersDeleteMemberRoute } from "./membersDeleteMember.js";
import { registerLeagueMembersListRoute } from "./membersList.js";
import { registerLeagueMembersTransferRoute } from "./membersTransfer.js";

export function registerLeagueMemberRoutes(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}) {
  const { router, client, authSecret } = args;
  registerLeagueMembersListRoute({ router, client, authSecret });
  registerLeagueMembersTransferRoute({ router, client, authSecret });
  registerLeagueMembersDeleteLeagueRoute({ router, client, authSecret });
  registerLeagueMembersDeleteMemberRoute({ router, client, authSecret });
}
