import { z } from "zod";
import { positiveIdString, positiveIdValue } from "./common.js";

/*
 * Circuit request schemas (admin and public). Dates are whole days sent as
 * `YYYY-MM-DD`; null or "" clears a date.
 */

const LINK = "That link doesn't look right";

const CODE_PATTERN = [
  /^[a-z0-9-]+$/,
  "Code must be lowercase letters/numbers/dashes only"
] as const;

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

/** Optional trimmed code; absent, null or "" stays undefined. */
const optionalCode = z
  .unknown()
  .optional()
  .transform((v, ctx): string | undefined => {
    const text = typeof v === "string" ? v.trim() : "";
    if (v === undefined || v === null || (typeof v === "string" && !text)) {
      return undefined;
    }
    if (!CODE_PATTERN[0].test(text)) {
      ctx.addIssue({ code: "custom", message: CODE_PATTERN[1] });
      return z.NEVER;
    }
    return text;
  });

/** Optional trimmed name; absent stays undefined, blank is rejected. */
function optionalName(blank: string) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): string | undefined => {
      if (v === undefined) return undefined;
      const text = typeof v === "string" ? v.trim() : "";
      if (!text) {
        ctx.addIssue({ code: "custom", message: blank });
        return z.NEVER;
      }
      return text;
    });
}

/** A full ordering: at least one id, each listed once. */
function idOrder(message: string) {
  return z
    .array(positiveIdValue(message), message)
    .min(1, message)
    .refine((ids) => new Set(ids).size === ids.length, message);
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

export const circuitIdParam = z.object({ id: positiveIdString(LINK) });

export const adminCircuitIdParam = z.object({ id: positiveIdString(LINK) });

export const adminCircuitCeremonyParams = z.object({
  id: positiveIdString(LINK),
  ceremonyId: positiveIdString(LINK)
});

export const adminCeremonyCircuitParams = z.object({
  id: positiveIdString(LINK),
  circuitId: positiveIdString(LINK)
});

export const adminCircuitEventParams = z.object({
  id: positiveIdString(LINK),
  eventId: positiveIdString(LINK)
});

export const adminCircuitCategoryParams = z.object({
  id: positiveIdString(LINK),
  categoryId: positiveIdString(LINK)
});

export const adminCircuitMappingParams = z.object({
  id: positiveIdString(LINK),
  categoryEditionId: positiveIdString(LINK)
});

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

export const adminCircuitCreateBody = z.object({
  code: requiredText("Code is required", CODE_PATTERN),
  name: requiredText("Name is required"),
  opens_on: optionalDateOnly("Enter the opening date as YYYY-MM-DD")
});

/**
 * Adds a ceremony to a Circuit or moves it to another event. Without an event
 * the ceremony gets its own one-ceremony event, named after it.
 */
export const adminCircuitAssociationBody = z.object({
  circuit_event_id: positiveIdValue("Choose an event")
    .nullish()
    .transform((v) => v ?? null)
});

/**
 * Moves an associated ceremony into a group at `index`, or with no group to
 * the top level at `index`, where it gets its own one-ceremony event. An
 * index past the end appends.
 */
export const adminCircuitCeremonyPositionBody = z.object({
  group_id: positiveIdValue("Choose a group in this Circuit")
    .nullish()
    .transform((v) => v ?? null),
  index: z
    .union([z.number(), z.string().regex(/^\d+$/)], "Choose a position")
    .transform(Number)
    .pipe(
      z.number("Choose a position").int("Choose a position").min(0, "Choose a position")
    )
});

/** A new group, optionally taking the listed ceremonies from their events. */
export const adminCircuitEventCreateBody = z.object({
  name: requiredText("Name is required"),
  code: optionalCode,
  ceremony_ids: z
    .array(positiveIdValue("Choose ceremonies in this Circuit"))
    .optional()
    .transform((v) => [...new Set(v ?? [])])
});

export const adminCircuitEventUpdateBody = z
  .object({ name: optionalName("Name is required"), code: optionalCode })
  .transform((v, ctx) => {
    if (v.name === undefined && v.code === undefined) {
      ctx.addIssue({ code: "custom", message: "No fields to update" });
      return z.NEVER;
    }
    return v;
  });

export const adminCircuitEventOrderBody = z.object({
  event_ids: idOrder("List every event of this Circuit once")
});

export const adminCircuitEventCeremonyOrderBody = z.object({
  ceremony_ids: idOrder("List every ceremony of this group once")
});

export const adminCircuitCategoryCreateBody = z.object({
  category_family_id: positiveIdValue("Choose a category template")
});

export const adminCircuitCategoryUpdateBody = z.object({
  name: requiredText("Name is required")
});

/** A Circuit category's icon, by icon code (one of the template icons). */
export const adminCircuitCategoryIconBody = z.object({
  icon: requiredText("Choose an icon")
});

export const adminCircuitCategoryOrderBody = z.object({
  category_ids: idOrder("List every category of this Circuit once")
});

export const adminCircuitMappingBody = z.object({
  circuit_category_id: positiveIdValue("Choose a Circuit category")
});

/**
 * The nominations date. The results date is not entered: it is the ceremony
 * datetime's date in America/Los_Angeles.
 */
export const adminCeremonyDatesBody = z
  .object({
    nominations_on: optionalDateOnly("Enter the nominations date as YYYY-MM-DD")
  })
  .transform((v, ctx) => {
    if (v.nominations_on === undefined) {
      ctx.addIssue({ code: "custom", message: "No fields to update" });
      return z.NEVER;
    }
    return { nominations_on: v.nominations_on };
  });
