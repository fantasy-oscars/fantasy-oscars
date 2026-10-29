import type express from "express";
import type { DbClient } from "../../data/db.js";
import { getPublishedDynamicContent } from "../../data/repositories/cmsRepository.js";
import { parseParams } from "../../utils/validate.js";
import { contentDynamicParams } from "@fantasy-oscars/shared/schemas";

export function registerContentDynamicRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get("/dynamic/:key", async (req, res, next) => {
    try {
      const { key } = parseParams(contentDynamicParams, req.params);
      const content = await getPublishedDynamicContent(client, key);
      return res.status(200).json({ content });
    } catch (err) {
      next(err);
    }
  });
}
