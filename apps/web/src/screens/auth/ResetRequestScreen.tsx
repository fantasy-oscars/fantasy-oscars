import type { ApiResult, FieldErrors } from "../../lib/types";
import { FormField, FormStatus } from "../../ui/forms";

export function ResetRequestScreen(props: {
  errors: FieldErrors;
  result: ApiResult | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { errors, result, loading, onSubmit } = props;
  return (
    <section className="card">
      <header>
        <h2>Reset Password</h2>
        <p>Request a reset token.</p>
      </header>
      <form onSubmit={onSubmit}>
        <FormField label="Username" name="username" error={errors.username} />
        <button type="submit" disabled={loading}>
          {loading ? "Requesting..." : "Request reset"}
        </button>
      </form>
      <FormStatus loading={loading} result={result} />
    </section>
  );
}
