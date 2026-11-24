import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import {
  addCategory,
  removeCategory,
  renameCategory,
  reorderCategories,
  setCategoryIcon
} from "../../services/circuit/circuitCategories.js";
import {
  adminCircuitCategoryCreateBody,
  adminCircuitCategoryIconBody,
  adminCircuitCategoryOrderBody,
  adminCircuitCategoryParams,
  adminCircuitCategoryUpdateBody,
  adminCircuitIdParam
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf } from "./circuitActor.js";

// Circuit categories, each added from a film or performance category template.
export function registerAdminCircuitCategoryRoutes(router: Router, pool: Pool) {
  router.post(
    "/circuits/:id/categories",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCircuitIdParam, req.params);
        const { category_family_id } = parseBody(
          adminCircuitCategoryCreateBody,
          req.body
        );
        const result = await addCategory(pool, actorOf(req), {
          circuitId: id,
          categoryFamilyId: category_family_id
        });
        return res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/circuits/:id/categories/order",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCircuitIdParam, req.params);
        const { category_ids } = parseBody(adminCircuitCategoryOrderBody, req.body);
        const result = await reorderCategories(pool, actorOf(req), {
          circuitId: id,
          categoryIds: category_ids
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/circuits/:id/categories/:categoryId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, categoryId } = parseParams(adminCircuitCategoryParams, req.params);
        const { name } = parseBody(adminCircuitCategoryUpdateBody, req.body);
        const result = await renameCategory(pool, actorOf(req), {
          circuitId: id,
          categoryId,
          name
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/circuits/:id/categories/:categoryId/icon",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, categoryId } = parseParams(adminCircuitCategoryParams, req.params);
        const { icon } = parseBody(adminCircuitCategoryIconBody, req.body);
        const result = await setCategoryIcon(pool, actorOf(req), {
          circuitId: id,
          categoryId,
          icon
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/circuits/:id/categories/:categoryId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, categoryId } = parseParams(adminCircuitCategoryParams, req.params);
        const result = await removeCategory(pool, actorOf(req), {
          circuitId: id,
          categoryId
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );
}
