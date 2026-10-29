import type { FieldErrors } from "../lib/types";

/** The parts of a failed API call needed to place errors on inputs. */
export type FieldFailure = {
  errorCode?: string;
  errorFields?: string[];
  error?: string;
};

/**
 * Maps a validation failure to per-input messages. Every field the server named
 * gets the server's message; `aliases` renames API fields to input names (for
 * example `pick_timer_seconds` -> `pickTimer`). Anything that is not a
 * validation failure with fields yields no inline errors.
 */
export function fieldErrorsFromFailure(
  failure: FieldFailure,
  aliases: Readonly<Record<string, string>> = {}
): FieldErrors {
  const errors: FieldErrors = {};
  const message = failure.error?.trim();
  if (failure.errorCode !== "VALIDATION_ERROR" || !message) return errors;
  for (const field of failure.errorFields ?? []) {
    errors[aliases[field] ?? field] = message;
  }
  return errors;
}

/** Returns the errors without the named input (same object when nothing changes). */
export function clearFieldError(errors: FieldErrors, name: string): FieldErrors {
  if (!(name in errors)) return errors;
  const next = { ...errors };
  delete next[name];
  return next;
}
