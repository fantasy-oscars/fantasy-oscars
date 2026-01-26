import { useState } from "react";
import { fetchJson } from "../lib/api";
import { useRequiredFields, FormField, FormStatus } from "../ui/forms";
import type { ApiResult, FieldErrors } from "../lib/types";

export function ResetRequestPage() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const validator = useRequiredFields(["username"]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setLoading(true);
    const res = await fetchJson("/auth/reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: String(data.get("username"))
      })
    });
    setLoading(false);
    setResult({
      ok: res.ok,
      message: res.ok
        ? "Reset token generated. Copy it from the server response (MVP)."
        : (res.error ?? "Reset failed")
    });
  }

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
