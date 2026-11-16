import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import {
  getPublicCircuit,
  getPublicCircuitCategories,
  getPublicCircuitEvents,
  getPublicCircuitSchedule,
  listPublicCircuits
} from "../services/circuit/circuitRead.js";
import { circuitIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../utils/validate.js";

// Public Circuit reads for later screens: the Circuit, its events (with their
// public ceremonies), its categories and its schedule of scoring occasions.
export function createCircuitsRouter(client: DbClient): Router {
  const router = express.Router();

  router.get("/", async (_req, res, next) => {
    try {
      return res.status(200).json({ circuits: await listPublicCircuits(client) });
    } catch (err) {
      next(err);
    }
  });

  const reads = [
    ["/:id", getPublicCircuit],
    ["/:id/events", getPublicCircuitEvents],
    ["/:id/categories", getPublicCircuitCategories],
    ["/:id/schedule", getPublicCircuitSchedule]
  ] as const;

  for (const [path, read] of reads) {
    router.get(path, async (req, res, next) => {
      try {
        const { id } = parseParams(circuitIdParam, req.params);
        return res.status(200).json(await read(client, id));
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
