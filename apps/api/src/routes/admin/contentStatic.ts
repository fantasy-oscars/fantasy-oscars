import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminContentStaticGetRoute } from "./contentStaticGet.js";
import { registerAdminContentStaticPutRoute } from "./contentStaticPut.js";

export function registerAdminContentStaticRoutes(args: { router: Router; client: DbClient }) {
  const { router, client } = args;
  registerAdminContentStaticGetRoute({ router, client });
  registerAdminContentStaticPutRoute({ router, client });
}
