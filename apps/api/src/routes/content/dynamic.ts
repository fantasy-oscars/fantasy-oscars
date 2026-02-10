import type express from "express";
import type { DbClient } from "../../data/db.js";
import { getPublishedDynamicContent } from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";

export function registerContentDynamicRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get("/dynamic/:key", async (req, res, next) => {
    try {
      const key = String(req.params.key ?? "").trim();
      if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
      if (key === "banner") {
        throw new AppError(
          "VALIDATION_FAILED",
          400,
          "Use /content/banners for banner content"
        );
      }
      const content = await getPublishedDynamicContent(client, key);
      return res.status(200).json({ content });
    } catch (err) {
      next(err);
    }
  });
}

