import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import {
  deleteCircuitCategory,
  findIconIdByCode,
  getCategoryTemplate,
  getCircuitCategory,
  insertCircuitCategory,
  listCircuitCategories,
  listCircuitCodes,
  renameCircuitCategory,
  reorderCircuitRows,
  setCircuitCategoryIcon
} from "../../data/repositories/circuitRepository.js";
import {
  circuitCategoryKindForUnitKind,
  isFullOrdering,
  uniqueCode
} from "../../domain/circuit.js";
import { AppError, validationError } from "../../errors.js";
import { type Actor, audit, lockEditableCircuit } from "./circuitGuards.js";
import { rebuildCircuitScoresAfterWrite } from "./circuitScoring.js";

/*
 * Circuit categories. Each is built from a category template: name, icon and
 * kind are copied when it is added (as ceremonies copy templates), so later
 * template edits never change a Circuit. Ceremony categories map to them.
 */

async function requireCategory(tx: DbClient, circuitId: number, categoryId: number) {
  const category = await getCircuitCategory(tx, circuitId, categoryId);
  if (!category) throw new AppError("NOT_FOUND", 404, "Category not found");
  return category;
}

export async function addCategory(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; categoryFamilyId: number }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const template = await getCategoryTemplate(tx, input.categoryFamilyId);
    if (!template) {
      throw validationError("Choose a category template", ["category_family_id"]);
    }
    const kind = circuitCategoryKindForUnitKind(template.default_unit_kind);
    if (!kind) {
      throw validationError(
        "Song templates can't be Circuit categories; choose a film or performance template",
        ["category_family_id"]
      );
    }
    const taken = await listCircuitCodes(tx, "circuit_category", input.circuitId);
    const id = await insertCircuitCategory(tx, {
      circuitId: input.circuitId,
      code: uniqueCode(template.code, taken, "category"),
      name: template.name,
      kind,
      categoryFamilyId: template.id,
      iconId: template.icon_id,
      iconVariant: template.icon_variant
    });
    return { circuit, category: await requireCategory(tx, input.circuitId, id) };
  });
  await audit(pool, actor, {
    action: "add_circuit_category",
    target_id: input.circuitId,
    meta: {
      circuit_category_id: result.category.id,
      category_family_id: input.categoryFamilyId,
      code: result.category.code,
      kind: result.category.kind,
      circuit_status: result.circuit.status
    }
  });
  return { category: result.category };
}

export async function renameCategory(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; categoryId: number; name: string }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const before = await requireCategory(tx, input.circuitId, input.categoryId);
    await renameCircuitCategory(tx, input);
    return {
      circuit,
      before,
      category: await requireCategory(tx, input.circuitId, input.categoryId)
    };
  });
  await audit(pool, actor, {
    action: "rename_circuit_category",
    target_id: input.circuitId,
    meta: {
      circuit_category_id: input.categoryId,
      name: input.name,
      previous_name: result.before.name,
      circuit_status: result.circuit.status
    }
  });
  return { category: result.category };
}

/**
 * Sets a category's icon from the template icons. Categories of one Circuit
 * never share an icon, since the icon is a season pill's only category cue.
 */
export async function setCategoryIcon(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; categoryId: number; icon: string }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const before = await requireCategory(tx, input.circuitId, input.categoryId);
    const iconId = await findIconIdByCode(tx, input.icon);
    if (iconId === null) throw validationError("Choose one of the icons", ["icon"]);
    const holder = (await listCircuitCategories(tx, input.circuitId)).find(
      (c) => c.id !== input.categoryId && c.icon_id === iconId
    );
    if (holder) {
      throw new AppError(
        "CIRCUIT_CATEGORY_ICON_TAKEN",
        409,
        `${holder.name} already uses this icon; choose another`
      );
    }
    await setCircuitCategoryIcon(tx, { ...input, iconId });
    return {
      circuit,
      before,
      category: await requireCategory(tx, input.circuitId, input.categoryId)
    };
  });
  await audit(pool, actor, {
    action: "set_circuit_category_icon",
    target_id: input.circuitId,
    meta: {
      circuit_category_id: input.categoryId,
      icon: input.icon,
      previous_icon: result.before.icon_code,
      circuit_status: result.circuit.status
    }
  });
  return { category: result.category };
}

export async function reorderCategories(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; categoryIds: number[] }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const current = await listCircuitCategories(tx, input.circuitId);
    if (
      !isFullOrdering(
        input.categoryIds,
        current.map((c) => c.id)
      )
    ) {
      throw validationError("List every category of this Circuit once", ["category_ids"]);
    }
    await reorderCircuitRows(tx, "circuit_category", input.circuitId, input.categoryIds);
    return { circuit, categories: await listCircuitCategories(tx, input.circuitId) };
  });
  await audit(pool, actor, {
    action: "reorder_circuit_categories",
    target_id: input.circuitId,
    meta: { category_ids: input.categoryIds, circuit_status: result.circuit.status }
  });
  return { categories: result.categories };
}

/** Removes a category and every mapping to it. */
export async function removeCategory(
  pool: Pool,
  actor: Actor,
  input: { circuitId: number; categoryId: number }
) {
  const result = await runInTransaction(pool, async (tx) => {
    const circuit = await lockEditableCircuit(tx, input.circuitId);
    const category = await requireCategory(tx, input.circuitId, input.categoryId);
    let mappingsRemoved: number;
    try {
      mappingsRemoved = (await deleteCircuitCategory(
        tx,
        input.circuitId,
        input.categoryId
      ))!;
    } catch (err) {
      // Ownership history references the category's selections and is never
      // deleted, so a category that has been owned in a league stays.
      const pg = err as { code?: string; table?: string };
      if (
        pg.code === "23503" &&
        (pg.table === "circuit_ownership" || pg.table === "circuit_transaction")
      ) {
        throw new AppError(
          "CIRCUIT_CATEGORY_IN_USE",
          409,
          "Players have owned contenders in this category, so it can't be removed"
        );
      }
      throw err;
    }
    return { circuit, category, mappingsRemoved };
  });
  await audit(pool, actor, {
    action: "remove_circuit_category",
    target_id: input.circuitId,
    meta: {
      circuit_category_id: input.categoryId,
      code: result.category.code,
      mappings_removed: result.mappingsRemoved,
      circuit_status: result.circuit.status
    }
  });
  if (result.mappingsRemoved > 0) {
    await rebuildCircuitScoresAfterWrite(
      pool,
      { circuitId: input.circuitId },
      "remove_circuit_category"
    );
  }
  return { mappings_removed: result.mappingsRemoved };
}
