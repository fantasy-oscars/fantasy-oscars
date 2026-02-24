import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerSeasonInviteesSearchRoute } from "./invitesInviteesSearch.js";
import { registerSeasonInvitesAcceptRoute } from "./invitesAccept.js";
import { registerSeasonInvitesCreateRoute } from "./invitesCreate.js";
import { registerSeasonInvitesDeclineRoute } from "./invitesDecline.js";
import { registerSeasonInvitesInboxRoute } from "./invitesInbox.js";
import { registerSeasonInvitesListRoute } from "./invitesList.js";
import { registerSeasonInvitesRegenerateRoute } from "./invitesRegenerate.js";
import { registerSeasonInvitesRevokeRoute } from "./invitesRevoke.js";
import { registerSeasonInvitesTokenAcceptRoute } from "./invitesTokenAccept.js";
import { registerSeasonInvitesTokenDeclineRoute } from "./invitesTokenDecline.js";
import { registerSeasonInvitesUpdateRoute } from "./invitesUpdate.js";
import { registerSeasonUserInvitesCreateRoute } from "./userInvitesCreate.js";

export function registerSeasonInviteRoutes(args: {
  router: express.Router;
  client: DbClient;
  inviteClaimLimiter: { middleware: express.RequestHandler };
}): void {
  const { router, client, inviteClaimLimiter } = args;

  registerSeasonInvitesListRoute({ router, client });
  registerSeasonInvitesCreateRoute({ router, client });
  registerSeasonInvitesRevokeRoute({ router, client });
  registerSeasonInvitesRegenerateRoute({ router, client });
  registerSeasonInvitesUpdateRoute({ router, client });
  registerSeasonUserInvitesCreateRoute({ router, client });
  registerSeasonInviteesSearchRoute({ router, client });
  registerSeasonInvitesTokenAcceptRoute({ router, client, inviteClaimLimiter });
  registerSeasonInvitesTokenDeclineRoute({ router, client, inviteClaimLimiter });
  registerSeasonInvitesInboxRoute({ router, client });
  registerSeasonInvitesAcceptRoute({ router, client, inviteClaimLimiter });
  registerSeasonInvitesDeclineRoute({ router, client, inviteClaimLimiter });
}
