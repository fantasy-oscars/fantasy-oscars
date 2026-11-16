import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { updateCeremonyDates } from "../../data/repositories/ceremonyRepository.js";
import {
  activateSeries,
  ceremonyExists,
  deleteSeriesCeremony,
  deleteSeriesMapping,
  getCategoryEditionCeremonyId,
  getSeriesById,
  getSeriesCategory,
  getSeriesEvent,
  insertSeries,
  insertSeriesCategories,
  insertSeriesEvents,
  isCeremonyInSeries,
  listCeremonySeriesAssociations,
  listSeries,
  listSeriesCategories,
  listSeriesCategoryEditions,
  listSeriesCeremonies,
  listSeriesEvents,
  listSeriesEventsForSeries,
  upsertSeriesCeremony,
  upsertSeriesMapping,
  type SeriesRow
} from "../../data/repositories/seriesRepository.js";
import {
  findCeremoniesMissingDates,
  initialSeriesCategories,
  initialSeriesEvents,
  listScoringOccasions
} from "../../domain/series.js";
import { AppError, validationError } from "../../errors.js";

/*
 * Series administration workflows. Every write appends to admin_audit_log
 * after it commits, as the ceremony admin routes do.
 *
 * Structural edits (associations and mappings) stay allowed after activation:
 * owner question 6 was answered with the recommended "allow, for admins only,
 * audit-logged". Only an archived Series is read-only.
 */

type Actor = { actorUserId: number | null };

async function audit(
  client: DbClient,
  actor: Actor,
  entry: { action: string; target_type: string; target_id: number; meta: object }
) {
  if (actor.actorUserId === null) return;
  await insertAdminAudit(client, {
    actor_user_id: actor.actorUserId,
    action: entry.action,
    target_type: entry.target_type,
    target_id: entry.target_id,
    meta: { ...entry.meta }
  });
}

async function requireSeries(client: DbClient, id: number): Promise<SeriesRow> {
  const series = await getSeriesById(client, id);
  if (!series) throw new AppError("NOT_FOUND", 404, "Series not found");
  return series;
}

async function requireEditableSeries(client: DbClient, id: number) {
  const series = await requireSeries(client, id);
  if (series.status === "ARCHIVED") {
    throw new AppError("SERIES_ARCHIVED", 409, "Archived Series are read-only");
  }
  return series;
}

async function requireCeremony(client: DbClient, id: number) {
  if (!(await ceremonyExists(client, id)))
    throw new AppError("NOT_FOUND", 404, "Ceremony not found");
}

export async function listSeriesForAdmin(client: DbClient) {
  return listSeries(client);
}

export async function createSeries(
  pool: Pool,
  actor: Actor,
  input: { code: string; name: string; opens_on: string | null | undefined }
) {
  let series: SeriesRow;
  try {
    series = await runInTransaction(pool, async (tx) => {
      const row = await insertSeries(tx, { ...input, opens_on: input.opens_on ?? null });
      await insertSeriesEvents(tx, row.id, initialSeriesEvents());
      await insertSeriesCategories(tx, row.id, initialSeriesCategories());
      return row;
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      throw validationError("Series code already exists", ["code"]);
    }
    throw err;
  }
  await audit(pool, actor, {
    action: "create_series",
    target_type: "series",
    target_id: series.id,
    meta: { code: series.code }
  });
  return getSeriesDetail(pool, series.id);
}

export async function getSeriesDetail(client: DbClient, id: number) {
  const series = await requireSeries(client, id);
  const [events, categories, ceremonies, categoryEditions] = await Promise.all([
    listSeriesEvents(client, id),
    listSeriesCategories(client, id),
    listSeriesCeremonies(client, id),
    listSeriesCategoryEditions(client, id)
  ]);
  return {
    series,
    events,
    categories,
    ceremonies,
    category_editions: categoryEditions,
    readiness: { missing_dates: findCeremoniesMissingDates(ceremonies) },
    occasions: listScoringOccasions(ceremonies)
  };
}

/** The ceremony side of the shared association, plus the Series it can join. */
export async function getCeremonySeries(client: DbClient, ceremonyId: number) {
  await requireCeremony(client, ceremonyId);
  const associations = await listCeremonySeriesAssociations(client, ceremonyId);
  const options = await listSeries(client, { excludeStatuses: ["ARCHIVED"] });
  const events = await listSeriesEventsForSeries(
    client,
    options.map((s) => s.id)
  );
  return {
    associations,
    series: options.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      status: s.status,
      events: events.filter((e) => e.series_id === s.id)
    }))
  };
}

/** Both admin screens call this; there is one association table. */
export async function associateCeremony(
  pool: Pool,
  actor: Actor & { via: "series" | "ceremony" },
  input: { seriesId: number; ceremonyId: number; seriesEventId: number }
) {
  const series = await requireEditableSeries(pool, input.seriesId);
  await requireCeremony(pool, input.ceremonyId);
  const event = await getSeriesEvent(pool, input.seriesId, input.seriesEventId);
  if (!event) {
    throw validationError("Choose an event in this Series", ["series_event_id"]);
  }
  const result = await runInTransaction(pool, (tx) => upsertSeriesCeremony(tx, input));
  await audit(pool, actor, {
    action: "associate_series_ceremony",
    target_type: "series",
    target_id: input.seriesId,
    meta: {
      ceremony_id: input.ceremonyId,
      series_event_id: input.seriesEventId,
      event_code: event.code,
      previous_event_id: result.previous_event_id,
      series_status: series.status,
      via: actor.via
    }
  });
  return {
    created: result.created,
    associations: await listCeremonySeriesAssociations(pool, input.ceremonyId)
  };
}

export async function removeCeremony(
  pool: Pool,
  actor: Actor & { via: "series" | "ceremony" },
  input: { seriesId: number; ceremonyId: number }
) {
  const series = await requireEditableSeries(pool, input.seriesId);
  const result = await runInTransaction(pool, (tx) =>
    deleteSeriesCeremony(tx, input.seriesId, input.ceremonyId)
  );
  if (!result.removed) {
    throw new AppError("NOT_FOUND", 404, "This ceremony is not in the Series");
  }
  await audit(pool, actor, {
    action: "remove_series_ceremony",
    target_type: "series",
    target_id: input.seriesId,
    meta: {
      ceremony_id: input.ceremonyId,
      mappings_removed: result.mappings_removed,
      series_status: series.status,
      via: actor.via
    }
  });
  return { mappings_removed: result.mappings_removed };
}

export async function setMapping(
  pool: Pool,
  actor: Actor,
  input: { seriesId: number; categoryEditionId: number; seriesCategoryId: number }
) {
  const series = await requireEditableSeries(pool, input.seriesId);
  const ceremonyId = await getCategoryEditionCeremonyId(pool, input.categoryEditionId);
  if (ceremonyId === null) throw new AppError("NOT_FOUND", 404, "Category not found");
  if (!(await isCeremonyInSeries(pool, input.seriesId, ceremonyId))) {
    throw new AppError(
      "SERIES_CEREMONY_NOT_ASSOCIATED",
      409,
      "Add this category's ceremony to the Series before mapping it",
      { ceremony_id: ceremonyId }
    );
  }
  const category = await getSeriesCategory(pool, input.seriesId, input.seriesCategoryId);
  if (!category) {
    throw validationError("Choose a category in this Series", ["series_category_id"]);
  }
  await upsertSeriesMapping(pool, input);
  await audit(pool, actor, {
    action: "set_series_mapping",
    target_type: "series",
    target_id: input.seriesId,
    meta: {
      category_edition_id: input.categoryEditionId,
      series_category_id: input.seriesCategoryId,
      category_code: category.code,
      series_status: series.status
    }
  });
  return {
    mapping: {
      series_id: input.seriesId,
      category_edition_id: input.categoryEditionId,
      series_category_id: input.seriesCategoryId
    }
  };
}

export async function removeMapping(
  pool: Pool,
  actor: Actor,
  input: { seriesId: number; categoryEditionId: number }
) {
  const series = await requireEditableSeries(pool, input.seriesId);
  const removed = await deleteSeriesMapping(
    pool,
    input.seriesId,
    input.categoryEditionId
  );
  if (!removed) throw new AppError("NOT_FOUND", 404, "This category is not mapped");
  await audit(pool, actor, {
    action: "remove_series_mapping",
    target_type: "series",
    target_id: input.seriesId,
    meta: { category_edition_id: input.categoryEditionId, series_status: series.status }
  });
}

/**
 * DRAFT → ACTIVE. The readiness check is soft: activation always proceeds and
 * the response lists the associated ceremonies that still lack a date.
 */
export async function activate(pool: Pool, actor: Actor, seriesId: number) {
  const current = await requireSeries(pool, seriesId);
  const series = await activateSeries(pool, seriesId);
  if (!series) {
    throw new AppError("SERIES_NOT_DRAFT", 409, "Only a draft Series can be activated", {
      status: current.status
    });
  }
  const missing = findCeremoniesMissingDates(await listSeriesCeremonies(pool, seriesId));
  await audit(pool, actor, {
    action: "activate_series",
    target_type: "series",
    target_id: seriesId,
    meta: { missing_dates_ceremony_ids: missing.map((m) => m.ceremony_id) }
  });
  return { series, readiness: { missing_dates: missing } };
}

/** Dates are routine content: editable at any ceremony status, never touching Series status. */
export async function setCeremonyDates(
  pool: Pool,
  actor: Actor,
  ceremonyId: number,
  dates: { nominations_on?: string | null; results_on?: string | null }
) {
  const ceremony = await updateCeremonyDates(pool, ceremonyId, dates);
  if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
  await audit(pool, actor, {
    action: "update_ceremony_dates",
    target_type: "ceremony",
    target_id: ceremonyId,
    meta: {
      fields: Object.keys(dates).filter(
        (k) => dates[k as keyof typeof dates] !== undefined
      ),
      nominations_on: ceremony.nominations_on,
      results_on: ceremony.results_on
    }
  });
  return { ceremony };
}
