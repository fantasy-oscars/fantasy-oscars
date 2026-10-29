import type express from "express";
import type { DbClient } from "../../data/db.js";
import { getStaticContentByKey } from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";
import { parseParams } from "../../utils/validate.js";
import { contentStaticParams } from "@fantasy-oscars/shared/schemas";

export function registerContentStaticRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get("/static/:key", async (req, res, next) => {
    try {
      const { key } = parseParams(contentStaticParams, req.params);
      const content = await getStaticContentByKey(client, key);
      if (!content) throw new AppError("NOT_FOUND", 404, "Content not found");
      return res.status(200).json({ content });
    } catch (err) {
      next(err);
    }
  });
}
