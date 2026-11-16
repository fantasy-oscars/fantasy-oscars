import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import {
  getPublicSeries,
  getPublicSeriesCategories,
  getPublicSeriesEvents,
  getPublicSeriesSchedule,
  listPublicSeries
} from "../services/series/seriesRead.js";
import { seriesIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../utils/validate.js";

// Public Series reads for later screens: the Series, its events (with their
// public ceremonies), its categories and its schedule of scoring occasions.
export function createSeriesRouter(client: DbClient): Router {
  const router = express.Router();

  router.get("/", async (_req, res, next) => {
    try {
      return res.status(200).json({ series: await listPublicSeries(client) });
    } catch (err) {
      next(err);
    }
  });

  const reads = [
    ["/:id", getPublicSeries],
    ["/:id/events", getPublicSeriesEvents],
    ["/:id/categories", getPublicSeriesCategories],
    ["/:id/schedule", getPublicSeriesSchedule]
  ] as const;

  for (const [path, read] of reads) {
    router.get(path, async (req, res, next) => {
      try {
        const { id } = parseParams(seriesIdParam, req.params);
        return res.status(200).json(await read(client, id));
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
