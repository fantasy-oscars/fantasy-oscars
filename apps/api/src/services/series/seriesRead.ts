import type { DbClient } from "../../data/db.js";
import {
  getSeriesById,
  listSeries,
  listSeriesCategories,
  listSeriesCeremonies,
  listSeriesEvents
} from "../../data/repositories/seriesRepository.js";
import { listScoringOccasions } from "../../domain/series.js";
import { AppError } from "../../errors.js";

/*
 * Public Series reads. A Series in DRAFT is admin-only, like a draft ceremony,
 * and so are associated ceremonies still in DRAFT.
 */

async function requirePublicSeries(client: DbClient, id: number) {
  const series = await getSeriesById(client, id);
  if (!series || series.status === "DRAFT") {
    throw new AppError("NOT_FOUND", 404, "Series not found");
  }
  return series;
}

function publicSeries(series: Awaited<ReturnType<typeof requirePublicSeries>>) {
  return {
    id: series.id,
    code: series.code,
    name: series.name,
    status: series.status,
    opens_on: series.opens_on,
    activated_at: series.activated_at
  };
}

export async function listPublicSeries(client: DbClient) {
  const rows = await listSeries(client, { excludeStatuses: ["DRAFT"] });
  return rows.map(publicSeries);
}

export async function getPublicSeries(client: DbClient, id: number) {
  const series = await requirePublicSeries(client, id);
  const [events, categories] = await Promise.all([
    listSeriesEvents(client, id),
    listSeriesCategories(client, id)
  ]);
  return { series: publicSeries(series), events, categories };
}

export async function getPublicSeriesEvents(client: DbClient, id: number) {
  await requirePublicSeries(client, id);
  const [events, ceremonies] = await Promise.all([
    listSeriesEvents(client, id),
    listSeriesCeremonies(client, id, { publicOnly: true })
  ]);
  return {
    events: events.map((e) => ({
      ...e,
      ceremonies: ceremonies
        .filter((c) => c.series_event_id === e.id)
        .map((c) => ({
          id: c.ceremony_id,
          code: c.ceremony_code,
          name: c.ceremony_name,
          nominations_on: c.nominations_on,
          results_on: c.results_on
        }))
    }))
  };
}

export async function getPublicSeriesCategories(client: DbClient, id: number) {
  await requirePublicSeries(client, id);
  return { categories: await listSeriesCategories(client, id) };
}

export async function getPublicSeriesSchedule(client: DbClient, id: number) {
  await requirePublicSeries(client, id);
  const ceremonies = await listSeriesCeremonies(client, id, { publicOnly: true });
  return { occasions: listScoringOccasions(ceremonies) };
}
