import type { FieldErrors } from "../lib/types";

export function getRequiredFieldErrors(
  fields: string[],
  formData: FormData
): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of fields) {
    const value = String(formData.get(field) ?? "").trim();
    if (!value) errors[field] = "Required";
  }
  return errors;
}
