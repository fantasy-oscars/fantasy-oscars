import { z } from "zod";
import { positiveIdString, positiveIdValue } from "./common.js";

/*
 * Series request schemas (admin and public). Dates are whole days sent as
 * `YYYY-MM-DD`; null or "" clears a date.
 */

const LINK = "That link doesn't look right";

/** Trimmed, required string, optionally checked against a pattern. */
function requiredText(missing: string, pattern?: readonly [RegExp, string]) {
  return z.unknown().transform((v, ctx) => {
    const text = typeof v === "string" ? v.trim() : "";
    if (!text) {
      ctx.addIssue({ code: "custom", message: missing });
      return z.NEVER;
    }
    if (pattern && !pattern[0].test(text)) {
      ctx.addIssue({ code: "custom", message: pattern[1] });
      return z.NEVER;
    }
    return text;
  });
}

/** True for a real calendar day written as `YYYY-MM-DD`. */
export function isIsoDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** Optional whole-day date: absent stays undefined, null or "" clears. */
function optionalDateOnly(message: string) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): string | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const text = typeof v === "string" ? v.trim() : "";
      if (typeof v === "string" && !text) return null;
      if (!isIsoDateOnly(text)) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return text;
    });
}

// ---------------------------------------------------------------------------
// Path params
// ---------------------------------------------------------------------------

export const seriesIdParam = z.object({ id: positiveIdString(LINK) });

export const adminSeriesIdParam = z.object({ id: positiveIdString(LINK) });

export const adminSeriesCeremonyParams = z.object({
  id: positiveIdString(LINK),
  ceremonyId: positiveIdString(LINK)
});

export const adminCeremonySeriesParams = z.object({
  id: positiveIdString(LINK),
  seriesId: positiveIdString(LINK)
});

export const adminSeriesMappingParams = z.object({
  id: positiveIdString(LINK),
  categoryEditionId: positiveIdString(LINK)
});

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

export const adminSeriesCreateBody = z.object({
  code: requiredText("Code is required", [
    /^[a-z0-9-]+$/,
    "Code must be lowercase letters/numbers/dashes only"
  ]),
  name: requiredText("Name is required"),
  opens_on: optionalDateOnly("Enter the opening date as YYYY-MM-DD")
});

export const adminSeriesAssociationBody = z.object({
  series_event_id: positiveIdValue("Choose an event")
});

export const adminSeriesMappingBody = z.object({
  series_category_id: positiveIdValue("Choose a Series category")
});

export const adminCeremonyDatesBody = z
  .object({
    nominations_on: optionalDateOnly("Enter the nominations date as YYYY-MM-DD"),
    results_on: optionalDateOnly("Enter the results date as YYYY-MM-DD")
  })
  .transform((v, ctx) => {
    if (v.nominations_on === undefined && v.results_on === undefined) {
      ctx.addIssue({ code: "custom", message: "No fields to update" });
      return z.NEVER;
    }
    return v;
  });
