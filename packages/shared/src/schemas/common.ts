import { z } from "zod";

/** Positive integer carried as a decimal string (path params). */
export const positiveIdString = (message = "Invalid id") =>
  z
    .string(message)
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(z.number(message).int(message).positive(message).max(Number.MAX_SAFE_INTEGER));

/** Positive integer sent in a body as a number or a numeric string. */
export const positiveIdValue = (message = "Invalid id") =>
  z
    .union([z.number(), z.string().regex(/^\d+$/)], message)
    .transform(Number)
    .pipe(z.number(message).int(message).positive(message).max(Number.MAX_SAFE_INTEGER));

/** `/:id` */
export const idParam = z.object({ id: positiveIdString() });

/** `/:id/.../:userId` */
export const idAndUserIdParams = z.object({
  id: positiveIdString(),
  userId: positiveIdString()
});

/** `/:id/.../:inviteId` */
export const idAndInviteIdParams = z.object({
  id: positiveIdString(),
  inviteId: positiveIdString()
});

/** `/invites/:inviteId/...` */
export const inviteIdParam = z.object({ inviteId: positiveIdString() });

/** A body carrying only `user_id`. */
export const userIdBodySchema = z.object({ user_id: positiveIdValue() });

/**
 * Optional number sent as a number or numeric string. Null and absent become
 * null; anything else goes through `Number()`, so the result may be NaN and the
 * caller's own range check decides what to do with it.
 */
export const optionalNumberLike = z
  .unknown()
  .optional()
  .transform((v): number | null => (v === undefined || v === null ? null : Number(v)));

/** Optional free-text query value; repeated or absent values are ignored. */
export const optionalTrimmedQuery = z.string().trim().optional().catch(undefined);

/**
 * Required positive integer sent as a number or numeric string. Absent and null
 * values (and, with `falsyIsMissing`, any falsy value such as 0 or "") report
 * `missing`; any other bad value reports `invalid`.
 */
export const requiredIdValue = (opts: {
  missing: string;
  invalid: string;
  falsyIsMissing?: boolean;
}) =>
  z.unknown().transform((v, ctx) => {
    const isMissing = opts.falsyIsMissing ? !v : v === undefined || v === null;
    if (isMissing) {
      ctx.addIssue({ code: "custom", message: opts.missing });
      return z.NEVER;
    }
    const parsed = positiveIdValue(opts.invalid).safeParse(v);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: opts.invalid });
      return z.NEVER;
    }
    return parsed.data;
  });

/**
 * Like `positiveIdValue`, but any bad value (including a non-numeric string)
 * reports exactly `message`.
 */
export const idOrInvalid = (message: string) =>
  requiredIdValue({ missing: message, invalid: message });
