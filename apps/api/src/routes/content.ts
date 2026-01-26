import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { AppError } from "../errors.js";
import {
  getPublishedDynamicContent,
  getStaticContentByKey,
  listPublishedDynamicContentByKey
} from "../data/repositories/cmsRepository.js";

export function createContentRouter(client: DbClient): Router {
  const router = express.Router();

  router.get("/banners", async (_req, res, next) => {
    try {
      const all = await listPublishedDynamicContentByKey(client, "banner");
      const now = Date.now();
      const active = all.filter((b) => {
        const starts = b.starts_at ? new Date(b.starts_at).getTime() : null;
        const ends = b.ends_at ? new Date(b.ends_at).getTime() : null;
        if (starts && Number.isFinite(starts) && starts > now) return false;
        if (ends && Number.isFinite(ends) && ends <= now) return false;
        return true;
      });
      return res.status(200).json({ banners: active });
    } catch (err) {
      next(err);
    }
  });

  router.get("/static/:key", async (req, res, next) => {
    try {
      const key = String(req.params.key ?? "").trim();
      if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
      const content = await getStaticContentByKey(client, key);
      if (!content) throw new AppError("NOT_FOUND", 404, "Content not found");
      return res.status(200).json({ content });
    } catch (err) {
      next(err);
    }
  });

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

  return router;
}
