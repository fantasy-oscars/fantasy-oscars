import { useMemo } from "react";
import type { ApiResult, FieldErrors } from "../lib/types";

export function useRequiredFields(fields: string[]) {
  return useMemo(
    () =>
      function validate(formData: FormData) {
        const errors: FieldErrors = {};
        for (const field of fields) {
          const value = String(formData.get(field) ?? "").trim();
          if (!value) errors[field] = "Required";
        }
        return errors;
      },
    [fields]
  );
}

export function FormField(props: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  defaultValue?: string;
}) {
  const { label, name, type = "text", error, defaultValue } = props;
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} aria-invalid={!!error} />
      {error && <small className="error">{error}</small>}
    </label>
  );
}

export function FormStatus(props: {
  loading: boolean;
  result: ApiResult | null;
  onRetry?: () => void;
}) {
  const { loading, result, onRetry } = props;
  if (loading) {
    return (
      <div className="status status-loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> Working...
      </div>
    );
  }
  if (result) {
    const message =
      result.ok && result.message
        ? result.message
        : result.ok
          ? "Success"
          : result.message;
    return (
      <div
        className={`status ${result.ok ? "status-success" : "status-error"}`}
        role="status"
        aria-live="polite"
      >
        {result.ok ? message : `Error: ${result.message}`}
        {!result.ok && onRetry && (
          <button type="button" className="ghost" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }
  return null;
}
