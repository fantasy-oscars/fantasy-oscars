import { useCallback, useState } from "react";
import type { FieldErrors } from "../lib/types";
import {
  clearFieldError,
  fieldErrorsFromFailure,
  type FieldFailure
} from "../decisions/fieldErrors";

/**
 * Per-input error state for a form. `applyFailure` places a server validation
 * failure on the inputs it names (returns true when it did); `clear` drops one
 * input's error when that input is edited; `onFormInput` does the same from a
 * form-level `onInput` for uncontrolled inputs that carry a `name`.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<FieldErrors>({});

  const applyFailure = useCallback(
    (failure: FieldFailure, aliases?: Readonly<Record<string, string>>) => {
      const next = fieldErrorsFromFailure(failure, aliases);
      setErrors(next);
      return Object.keys(next).length > 0;
    },
    []
  );

  const clear = useCallback((name: string) => {
    setErrors((prev) => clearFieldError(prev, name));
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  const onFormInput = useCallback(
    (e: React.FormEvent<HTMLElement>) => {
      const name = (e.target as { name?: unknown }).name;
      if (typeof name === "string" && name) clear(name);
    },
    [clear]
  );

  return { errors, setErrors, applyFailure, clear, reset, onFormInput };
}
