import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerSeasonPublicListRoute } from "./publicList.js";
import { registerSeasonPublicJoinRoute } from "./publicJoin.js";

export function registerSeasonPublicRoutes(args: {
  router: express.Router;
  client: DbClient;
  publicSeasonJoinLimiter: { middleware: express.RequestHandler };
}) {
  const { router, client, publicSeasonJoinLimiter } = args;
  registerSeasonPublicListRoute({ router, client });
  registerSeasonPublicJoinRoute({ router, client, publicSeasonJoinLimiter });
}
