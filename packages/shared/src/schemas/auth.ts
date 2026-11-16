import { z } from "zod";
import {
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateRegisterInput,
  validateUsername
} from "../auth/validation.js";

const MISSING = "Please fill in all required fields";
const BAD_TYPE = "Please check your entries and try again";

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
          message: "Some of the details you entered are not valid",
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

const INVALID_EMAIL = "Enter a valid email address";
const SHORT_PASSWORD = `Passwords must be at least ${PASSWORD_MIN_LENGTH} characters`;

// Reset tokens are 32 random bytes in base64url (43 characters); anything far
// longer is not one of ours.
const RESET_TOKEN_MAX_LENGTH = 128;

const emailField = z
  .string(requiredString)
  .trim()
  .min(1, MISSING)
  .refine((value) => validateEmail(value).length === 0, INVALID_EMAIL)
  .transform(normalizeEmail);

const newPasswordField = z
  .string(requiredString)
  .min(1, MISSING)
  .refine((value) => validatePassword(value).length === 0, SHORT_PASSWORD);

export const passwordResetRequestBodySchema = z.object({ email: emailField });

export const passwordResetConfirmBodySchema = z.object({
  token: z.string(requiredString).min(1, MISSING).max(RESET_TOKEN_MAX_LENGTH, BAD_TYPE),
  password: newPasswordField
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string(requiredString).min(1, MISSING),
  newPassword: newPasswordField
});

export const changeEmailBodySchema = z.object({
  currentPassword: z.string(requiredString).min(1, MISSING),
  email: emailField
});

export type LoginBody = z.output<typeof loginBodySchema>;
export type RegisterBody = z.output<typeof registerBodySchema>;
export type PasswordResetRequestBody = z.output<typeof passwordResetRequestBodySchema>;
export type PasswordResetConfirmBody = z.output<typeof passwordResetConfirmBodySchema>;
export type ChangePasswordBody = z.output<typeof changePasswordBodySchema>;
export type ChangeEmailBody = z.output<typeof changeEmailBodySchema>;
