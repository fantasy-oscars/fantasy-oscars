import { useState } from "react";
import { fetchJson } from "../lib/api";
import { useRequiredFields, FormField, FormStatus } from "../ui/forms";
import type { ApiResult, FieldErrors } from "../lib/types";

export function ResetConfirmPage() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const validator = useRequiredFields(["token", "password"]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fieldErrors = validator(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setLoading(true);
    const res = await fetchJson("/auth/reset-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: String(data.get("token")),
        password: String(data.get("password"))
      })
    });
    setLoading(false);
    setResult({
      ok: res.ok,
      message: res.ok ? "Password updated" : (res.error ?? "Update failed")
    });
  }

  return (
    <section className="card">
      <header>
        <h2>Set New Password</h2>
        <p>Paste the reset token and choose a new password.</p>
      </header>
      <form onSubmit={onSubmit}>
        <FormField label="Reset token" name="token" error={errors.token} />
        <FormField
          label="New password"
          name="password"
          type="password"
          error={errors.password}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
      <FormStatus loading={loading} result={result} />
    </section>
  );
}

