import { z } from "zod";
import {
  normalizeEmail,
  validatePassword,
  validateRegisterInput,
  validateUsername
} from "../auth/validation.js";

const MISSING = "Missing required fields";
const BAD_TYPE = "Invalid field types";

// A falsy value counts as missing; anything else of the wrong type is a type error.
const requiredString = {
  error: (issue: { input?: unknown }) => (issue.input ? BAD_TYPE : MISSING)
};

// The legacy `handle` key is accepted as an alias for `username`.
function mergeHandle(raw: unknown): unknown {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  return { ...body, username: body.username ?? body.handle };
}

export const loginBodySchema = z.preprocess(
  mergeHandle,
  z
    .object({
      username: z.string(requiredString).min(1, MISSING),
      password: z.string(requiredString).min(1, MISSING)
    })
    .superRefine((val, ctx) => {
      // Login only rejects shapes that can never match an account; emptiness
      // is left to the credential lookup.
      const issues = [
        ...validateUsername(val.username),
        ...validatePassword(val.password)
      ].filter((i) => i.code !== "REQUIRED");
      if (issues.length) {
        ctx.addIssue({ code: "custom", message: "Invalid credentials" });
      }
    })
);

export const registerBodySchema = z.preprocess(
  mergeHandle,
  z
    .object({
      username: z.string(requiredString).min(1, MISSING),
      email: z.string(requiredString).min(1, MISSING),
      password: z.string(requiredString).min(1, MISSING)
    })
    .superRefine((val, ctx) => {
      const fields = Array.from(
        new Set(
          validateRegisterInput({
            username: val.username.trim(),
            email: val.email.trim(),
            password: val.password
          }).map((i) => i.field)
        )
      );
      if (fields.length) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid field values",
          params: { fields }
        });
      }
    })
    .transform((val) => ({
      username: val.username.trim(),
      email: normalizeEmail(val.email),
      password: val.password
    }))
);

export type LoginBody = z.output<typeof loginBodySchema>;
export type RegisterBody = z.output<typeof registerBodySchema>;
