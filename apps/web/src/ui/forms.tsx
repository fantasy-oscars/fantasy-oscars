import type { ApiResult } from "../lib/types";

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
