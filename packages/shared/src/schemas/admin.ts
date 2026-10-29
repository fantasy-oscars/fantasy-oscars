import { z } from "zod";
import {
  idOrInvalid,
  optionalNumberLike,
  optionalTrimmedQuery,
  positiveIdString
} from "./common.js";
import { contentStaticParams } from "./content.js";

/*
 * Admin request schemas. Admin clients have always been lenient about types
 * (a non-string text field counts as absent, ids may be numbers or numeric
 * strings), so the helpers below keep that leniency and only reject values the
 * routes used to reject.
 */

const UNIT_KINDS = ["FILM", "SONG", "PERFORMANCE"] as const;
const ICON_VARIANTS = ["default", "inverted"] as const;
const ADMIN_ROLES = ["NONE", "OPERATOR", "SUPER_ADMIN"] as const;
const NOMINATION_ACTIONS = ["REVOKE", "REPLACE", "RESTORE"] as const;
const NOMINATION_ORIGINS = ["INTERNAL", "EXTERNAL"] as const;
const NOMINATION_IMPACTS = ["CONSEQUENTIAL", "BENIGN"] as const;

type Pattern = readonly [RegExp, string];

const CODE_PATTERN: Pattern = [
  /^[a-z0-9-]+$/,
  "Code must be lowercase letters/numbers/dashes only"
];
const ICON_DASH_PATTERN: Pattern = [
  /^[a-z0-9-]+$/,
  "Icon must be lowercase letters/numbers/dashes only"
];
const ICON_UNDERSCORE_PATTERN: Pattern = [
  /^[a-z0-9_-]+$/,
  "Icon must be lowercase letters/numbers/dashes/underscores only"
];

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** Trimmed string; anything that is not a string counts as empty. */
function requiredText(missing: string, pattern?: Pattern) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx) => {
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

/** Trimmed string when one is sent; anything else counts as absent. A blank string is rejected. */
function optionalText(missing: string, pattern?: Pattern) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): string | undefined => {
      if (typeof v !== "string") return undefined;
      const text = v.trim();
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

/** Trimmed string; anything that is not a string becomes "". Never fails. */
const trimmedOrEmpty = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? v.trim() : ""));

/** Untrimmed string; anything that is not a string becomes "". Never fails. */
const stringOrEmpty = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? v : ""));

/** Untrimmed string, or undefined for anything else. Never fails. */
const stringOrUndefined = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? v : undefined));

/** Upper-cased string; absent or non-string values become "" and fail the enum. */
function requiredUpperEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  message: string
) {
  return z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.toUpperCase() : ""))
    .pipe(z.enum(values, message));
}

/** Absent stays undefined; anything sent must be a valid upper-cased value. */
function optionalUpperEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  message: string
) {
  return z
    .unknown()
    .optional()
    .transform((v) =>
      v === undefined ? undefined : typeof v === "string" ? v.toUpperCase() : ""
    )
    .pipe(z.enum(values, message).optional());
}

/** A string is upper-cased and checked; anything else counts as absent. */
function stringUpperEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  message: string
) {
  return z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.toUpperCase() : undefined))
    .pipe(z.enum(values, message).optional());
}

/** Null or absent becomes null; otherwise a positive integer (number or non-blank string). */
function positiveIntOrNull(message: string) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): number | null => {
      if (v === null || v === undefined) return null;
      const n =
        typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
      if (!Number.isInteger(n) || n <= 0) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    });
}

/** A number or non-blank numeric string, else null. May be NaN or non-positive; callers decide. */
const looseNumber = z
  .unknown()
  .optional()
  .transform((v): number | null =>
    typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : null
  );

/** Valid positive integers from an array of numbers or numeric strings; invalid entries are dropped. */
function toIdList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN))
    .filter((n) => Number.isInteger(n) && n > 0);
}

const idList = z.unknown().optional().transform(toIdList);

/** Integer >= 0 sent as a number or string; absent stays undefined. */
function optionalNonNegativeInt(message: string) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): number | undefined => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    });
}

/** Absent or null becomes null; anything else must be an integer >= 0. */
function nonNegativeIntOrNull(message: string) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): number | null => {
      if (v === undefined || v === null) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    });
}

const noFields = (ctx: z.RefinementCtx) =>
  ctx.addIssue({ code: "custom", message: "No fields to update" });

/** Parses a start-of-event timestamp string; blank or non-string yields undefined. */
function dateFromText(v: unknown): Date | undefined {
  return typeof v === "string" && v.trim() ? new Date(v) : undefined;
}

// ---------------------------------------------------------------------------
// Path params
// ---------------------------------------------------------------------------

const namedId = (message: string) => z.object({ id: positiveIdString(message) });

export const adminCeremonyIdParam = namedId("That link doesn't look right");
export const adminCategoryEditionIdParam = namedId("That link doesn't look right");
export const adminCategoryFamilyDeleteParam = namedId("That link doesn't look right");
export const adminCategoryFamilyUpdateParam = namedId("That link doesn't look right");
export const adminFilmIdParam = namedId("That link doesn't look right");
export const adminNominationIdParam = namedId("That link doesn't look right");
export const adminPersonIdParam = namedId("That link doesn't look right");
export const adminUserIdParam = namedId("That link doesn't look right");
export const adminSeasonIdParam = namedId("That link doesn't look right");
export const adminLeagueIdParam = namedId("That link doesn't look right");

export const adminFilmDecoupleParams = z.object({
  canonicalId: positiveIdString("That link doesn't look right"),
  filmId: positiveIdString("That link doesn't look right")
});

export const adminFilmMergeParams = z.object({
  canonicalId: positiveIdString("That link doesn't look right")
});

export const adminFilmTmdbParams = z.object({
  tmdbId: positiveIdString("TMDB ID must be a positive whole number")
});

export const adminContributorParams = z.object({
  id: positiveIdString("That link doesn't look right"),
  contributorId: positiveIdString("That link doesn't look right")
});

/** `/content/.../:key`; the key is checked before the caller's access, so it parses on its own. */
export const adminContentKeyParams = contentStaticParams;

export const adminDraftIdParam = z.object({
  id: positiveIdString("That link doesn't look right")
});
export const adminEntryIdParam = z.object({
  id: positiveIdString("That link doesn't look right")
});

// ---------------------------------------------------------------------------
// Query strings
// ---------------------------------------------------------------------------

/** `?q=` search; repeated or non-string values count as empty. */
export const adminSearchQuery = z.object({
  q: optionalTrimmedQuery.transform((v) => v ?? "")
});

const pageNumber = z
  .unknown()
  .optional()
  .transform((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

function pageSize(fallback: number) {
  return z
    .unknown()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? Math.min(n, 100) : fallback;
    });
}

export const adminFilmsListQuery = z.object({
  q: optionalTrimmedQuery.transform((v) => v ?? ""),
  year: z
    .unknown()
    .optional()
    .transform((v) => {
      const raw = typeof v === "string" ? v.trim() : "";
      const n = raw ? Number(raw) : null;
      return Number.isInteger(n) ? (n as number) : null;
    }),
  linked: z
    .unknown()
    .optional()
    .transform((v) => {
      const s = typeof v === "string" ? v.trim().toLowerCase() : "";
      return s === "linked" || s === "unlinked" ? s : "all";
    }),
  nominated: z
    .unknown()
    .optional()
    .transform((v) => {
      const s = typeof v === "string" ? v.trim().toLowerCase() : "";
      return s === "nominated" || s === "not_nominated" ? s : "all";
    }),
  page: pageNumber,
  page_size: pageSize(50)
});

export const adminFilmConsolidatedQuery = z.object({
  page: pageNumber,
  page_size: pageSize(8)
});

// ---------------------------------------------------------------------------
// Ceremonies
// ---------------------------------------------------------------------------

export const adminCeremonyCreateBody = z.object({
  code: requiredText("Code is required", CODE_PATTERN),
  name: requiredText("Name is required"),
  year: optionalNumberLike.refine(
    (v) => v === null || (Number.isInteger(v) && v >= 1900 && v <= 3000),
    "Enter a valid year"
  ),
  starts_at: z
    .unknown()
    .optional()
    .transform((v, ctx): Date | null => {
      const date = dateFromText(v);
      if (!date) return null;
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: "custom", message: "Enter a valid start date and time" });
        return z.NEVER;
      }
      return date;
    })
});

export const adminCeremonyUpdateBody = z
  .object({
    code: optionalText("Code is required", CODE_PATTERN),
    name: optionalText("Name is required"),
    starts_at: z
      .unknown()
      .optional()
      .transform((v, ctx): Date | null | undefined => {
        if (v === null) return null;
        const date = dateFromText(v);
        if (!date) return undefined;
        if (Number.isNaN(date.getTime())) {
          ctx.addIssue({ code: "custom", message: "Enter a valid start date and time" });
          return z.NEVER;
        }
        return date;
      }),
    draft_warning_hours: z
      .unknown()
      .optional()
      .transform((v, ctx): number | undefined => {
        if (v === undefined) return undefined;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 24 * 14) {
          ctx.addIssue({
            code: "custom",
            message: "Draft warning must be a whole number of hours, up to 336"
          });
          return z.NEVER;
        }
        return n;
      })
  })
  .transform((v, ctx) => {
    if (Object.values(v).every((x) => x === undefined)) {
      noFields(ctx);
      return z.NEVER;
    }
    return v;
  });

export const adminCeremonyNameBody = z.object({
  name: requiredText("Name is required")
});

export const adminActiveCeremonyBody = z.object({
  ceremony_id: idOrInvalid("Choose a ceremony")
});

// ---------------------------------------------------------------------------
// Ceremony categories
// ---------------------------------------------------------------------------

export const adminCeremonyCategoryAddBody = z
  .object({
    family_id: idOrInvalid("Choose a category family"),
    unit_kind: stringUpperEnum(UNIT_KINDS, "Choose a valid unit type"),
    icon: trimmedOrEmpty,
    icon_id: z.unknown().optional(),
    sort_index: nonNegativeIntOrNull("Sort position must be a whole number")
  })
  .transform((v, ctx) => {
    if (v.icon) {
      if (!ICON_DASH_PATTERN[0].test(v.icon)) {
        ctx.addIssue({
          code: "custom",
          message: ICON_DASH_PATTERN[1],
          path: ["icon"]
        });
        return z.NEVER;
      }
      return { ...v, icon_id: null };
    }
    if (v.icon_id === undefined || v.icon_id === null) return { ...v, icon_id: null };
    const parsed = idOrInvalid("Choose a valid icon").safeParse(v.icon_id);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Choose a valid icon", path: ["icon_id"] });
      return z.NEVER;
    }
    return { ...v, icon_id: parsed.data as number };
  });

export const adminCeremonyCategoryCloneBody = z.object({
  from_ceremony_id: idOrInvalid("Choose a ceremony to copy from")
});

export const adminCeremonyCategoryReorderBody = z.object({
  category_ids: idList.pipe(z.array(z.number()).min(1, "Select at least one category"))
});

// ---------------------------------------------------------------------------
// Category editions
// ---------------------------------------------------------------------------

export const adminCategoryEditionUpdateBody = z
  .object({
    unit_kind: stringUpperEnum(UNIT_KINDS, "Choose a valid unit type"),
    icon: z
      .unknown()
      .optional()
      .transform((v, ctx): string | undefined => {
        if (typeof v !== "string") return undefined;
        const text = v.trim();
        if (!text) {
          ctx.addIssue({ code: "custom", message: "Icon is required" });
          return z.NEVER;
        }
        if (!ICON_DASH_PATTERN[0].test(text)) {
          ctx.addIssue({ code: "custom", message: ICON_DASH_PATTERN[1] });
          return z.NEVER;
        }
        return text;
      }),
    icon_id: z.unknown().optional(),
    sort_index: optionalNonNegativeInt("Sort position must be a whole number")
  })
  .transform((v, ctx) => {
    let iconId: number | null | undefined;
    if (v.icon === undefined && v.icon_id !== undefined) {
      if (v.icon_id === null) {
        iconId = null;
      } else {
        const parsed = idOrInvalid("Choose a valid icon").safeParse(v.icon_id);
        if (!parsed.success) {
          ctx.addIssue({
            code: "custom",
            message: "Choose a valid icon",
            path: ["icon_id"]
          });
          return z.NEVER;
        }
        iconId = parsed.data as number;
      }
    }
    const out = {
      unit_kind: v.unit_kind,
      icon: v.icon,
      icon_id: iconId,
      sort_index: v.sort_index
    };
    if (Object.values(out).every((x) => x === undefined)) {
      noFields(ctx);
      return z.NEVER;
    }
    return out;
  });

// ---------------------------------------------------------------------------
// Category families
// ---------------------------------------------------------------------------

export const adminCategoryFamilyCreateBody = z
  .object({
    code: requiredText("Code is required", CODE_PATTERN),
    name: requiredText("Name is required"),
    default_unit_kind: requiredUpperEnum(UNIT_KINDS, "Choose a valid unit type"),
    icon_variant: z
      .unknown()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim() : "default"))
      .pipe(z.enum(ICON_VARIANTS, "Choose a valid icon style")),
    icon: z
      .unknown()
      .optional()
      .transform((v, ctx) => {
        const text = typeof v === "string" ? v.trim() : "";
        if (text && !ICON_UNDERSCORE_PATTERN[0].test(text)) {
          ctx.addIssue({ code: "custom", message: ICON_UNDERSCORE_PATTERN[1] });
          return z.NEVER;
        }
        return text;
      }),
    icon_id: z.unknown().optional()
  })
  .transform((v, ctx) => {
    if (v.icon) return { ...v, icon_id: null as number | null };
    if (v.icon_id === undefined || v.icon_id === null) {
      ctx.addIssue({ code: "custom", message: "Icon is required", path: ["icon"] });
      return z.NEVER;
    }
    const parsed = idOrInvalid("Choose a valid icon").safeParse(v.icon_id);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Choose a valid icon", path: ["icon_id"] });
      return z.NEVER;
    }
    return { ...v, icon_id: parsed.data as number | null };
  });

export const adminCategoryFamilyUpdateBody = z
  .object({
    code: optionalText("Code is required", CODE_PATTERN),
    name: optionalText("Name is required"),
    default_unit_kind: optionalUpperEnum(UNIT_KINDS, "Choose a valid unit type"),
    icon_variant: z
      .unknown()
      .optional()
      .transform((v) =>
        v === undefined ? undefined : typeof v === "string" ? v.trim() : ""
      )
      .pipe(z.enum(ICON_VARIANTS, "Choose a valid icon style").optional()),
    icon: optionalText("Icon is required", ICON_UNDERSCORE_PATTERN)
  })
  .transform((v, ctx) => {
    if (Object.values(v).every((x) => x === undefined)) {
      noFields(ctx);
      return z.NEVER;
    }
    return v;
  });

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

export const adminIconCreateBody = z.object({
  code: requiredText("Code is required", [
    /^[a-z0-9-]+$/,
    "Icon code must be lowercase letters/numbers/dashes only"
  ])
});

// ---------------------------------------------------------------------------
// Nominations
// ---------------------------------------------------------------------------

export const adminNominationCreateBody = z.object({
  category_edition_id: idOrInvalid("Choose a category"),
  film_id: looseNumber,
  film_title: trimmedOrEmpty,
  song_title: trimmedOrEmpty,
  contributors: z
    .unknown()
    .optional()
    .transform((v): Array<Record<string, unknown>> =>
      Array.isArray(v)
        ? v.filter(
            (c): c is Record<string, unknown> => Boolean(c) && typeof c === "object"
          )
        : []
    )
});

export const adminNominationReorderBody = z.object({
  category_edition_id: idOrInvalid("Choose a category"),
  nomination_ids: idList.pipe(z.array(z.number()).min(1, "Select at least one nominee"))
});

export const adminNominationChangeBody = z
  .object({
    action: z.enum(NOMINATION_ACTIONS, "Choose a valid action"),
    origin: z.enum(NOMINATION_ORIGINS, "Choose a valid origin"),
    impact: z.enum(NOMINATION_IMPACTS, "Choose a valid impact"),
    reason: z
      .string("Enter a reason of at least 5 characters")
      .refine((v) => v.trim().length >= 5, "Enter a reason of at least 5 characters"),
    replacement_nomination_id: z
      .unknown()
      .optional()
      .transform((v): number | null => {
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        return Number.isInteger(n) && n > 0 ? n : null;
      })
  })
  .transform((v, ctx) => {
    if (v.action === "REPLACE" && v.replacement_nomination_id === null) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a replacement nominee",
        path: ["replacement_nomination_id"]
      });
      return z.NEVER;
    }
    return v;
  });

// ---------------------------------------------------------------------------
// Nomination contributors
// ---------------------------------------------------------------------------

export const adminContributorAddBody = z
  .object({
    person_id: looseNumber,
    name: trimmedOrEmpty,
    tmdb_id: positiveIntOrNull("TMDB ID must be a positive whole number")
  })
  .transform((v, ctx) => {
    if (!v.person_id && !v.name) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a person or enter a name",
        params: { fields: ["person_id", "name"] }
      });
      return z.NEVER;
    }
    return v;
  });

export const adminContributorUpdateBody = z.object({
  display_name_override: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.trim() : null)),
  display_role_override: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.trim() : null)),
  avatar_person_id_override: positiveIntOrNull("Avatar person must be a valid person")
});

// ---------------------------------------------------------------------------
// Nominee and film datasets
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is object => typeof v === "object" && v !== null;

/**
 * Nominee datasets can be large. Only the top-level shape is checked, and
 * routes keep using the original body, so nothing is copied or re-parsed.
 */
export const adminNomineesUploadCeremonyBody = z.custom<{ ceremonies: unknown[] }>(
  (v) =>
    isObject(v) &&
    Array.isArray((v as { ceremonies?: unknown }).ceremonies) &&
    (v as { ceremonies: unknown[] }).ceremonies.length > 0,
  { message: "Dataset must include ceremonies", params: { fields: ["ceremonies"] } }
);

/** Legacy upload: any non-empty JSON object (or array) body. */
export const adminNomineesUploadBody = z.custom<object>(
  (v) => isObject(v) && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0),
  { message: "Missing JSON body", params: { fields: ["body"] } }
);

/** Film import: either `{ films: [...] }` or a bare array. Returns the array itself, uncopied. */
export const adminFilmsImportBody = z.unknown().transform((body, ctx): unknown[] => {
  const nonEmpty =
    isObject(body) && (Array.isArray(body) || Object.keys(body).length > 0);
  if (!nonEmpty) {
    ctx.addIssue({
      code: "custom",
      message: "Missing JSON body",
      params: { fields: ["body"] }
    });
    return z.NEVER;
  }
  const films = (body as { films?: unknown }).films;
  if (Array.isArray(films)) return films;
  if (Array.isArray(body)) return body;
  ctx.addIssue({
    code: "custom",
    message: "Dataset must include films",
    params: { fields: ["films"] }
  });
  return z.NEVER;
});

// ---------------------------------------------------------------------------
// Films and people
// ---------------------------------------------------------------------------

export const adminFilmLinkBody = z.object({
  tmdb_id: positiveIntOrNull("TMDB ID must be a positive whole number")
});

export const adminPersonUpdateBody = adminFilmLinkBody;

/** Merge duplicates into `canonicalId`: the canonical film itself and repeats are dropped. */
export function adminFilmMergeBody(canonicalId: number) {
  return z.object({
    duplicate_ids: z
      .unknown()
      .optional()
      .transform((v, ctx): number[] => {
        if (!Array.isArray(v) || v.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: "Select at least one duplicate film"
          });
          return z.NEVER;
        }
        const ids = Array.from(new Set(toIdList(v))).filter((id) => id !== canonicalId);
        if (ids.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: "Select at least one valid duplicate film"
          });
          return z.NEVER;
        }
        return ids;
      })
  });
}

// ---------------------------------------------------------------------------
// Winners
// ---------------------------------------------------------------------------

export const adminWinnerUpsertBody = z
  .object({
    category_edition_id: idOrInvalid("Choose a category"),
    nomination_ids: z.unknown().optional(),
    nomination_id: z.unknown().optional()
  })
  .transform((v, ctx) => {
    const ids = Array.isArray(v.nomination_ids)
      ? toIdList(v.nomination_ids)
      : toIdList([v.nomination_id]);
    if (ids.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Select at least one nominee",
        path: ["nomination_ids"]
      });
      return z.NEVER;
    }
    return { category_edition_id: v.category_edition_id, nomination_ids: ids };
  });

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const adminUserUpdateBody = z.object({
  admin_role: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.trim().toUpperCase() : ""))
    .pipe(z.enum(ADMIN_ROLES, "Admin role must be none, operator or super admin"))
});

// ---------------------------------------------------------------------------
// CMS content
// ---------------------------------------------------------------------------

export const adminContentStaticBody = z.object({
  title: stringOrEmpty,
  body_markdown: stringOrEmpty
});

export const adminContentDynamicBody = z.object({
  title: stringOrEmpty,
  body_markdown: stringOrEmpty,
  variant: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.toLowerCase() : undefined)),
  dismissible: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "boolean" ? v : undefined)),
  starts_at: stringOrUndefined,
  ends_at: stringOrUndefined
});
