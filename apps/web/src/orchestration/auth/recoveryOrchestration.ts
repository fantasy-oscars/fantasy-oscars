import { useCallback, useLayoutEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { ApiResult, FieldErrors } from "../../lib/types";
import { notify } from "../../notifications";
import { useFieldErrors } from "../useFieldErrors";
import { getRequiredFieldErrors } from "../../decisions/forms";
import { fieldErrorsFromFailure } from "../../decisions/fieldErrors";
import {
  readResetToken,
  validateEmailMessage,
  validatePasswordConfirmMessage,
  validatePasswordMessage,
  withoutResetToken
} from "../../decisions/auth";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Reads the token from a password-reset link once, then removes it from the address
 * bar before the first paint, so it is not kept in history or sent on as a Referer.
 */
export function useResetTokenFromUrl(): string | null {
  const [token] = useState(() => readResetToken(window.location.search));
  useLayoutEffect(() => {
    if (!new URLSearchParams(window.location.search).has("token")) return;
    window.history.replaceState(
      window.history.state,
      "",
      withoutResetToken(window.location)
    );
  }, []);
  return token;
}

/** "Forgot password?": asks the API to email a reset link. */
export function usePasswordResetRequestOrchestration() {
  const { errors, setErrors, onFormInput } = useFieldErrors();
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const errs = getRequiredFieldErrors(["email"], data);
      const email = String(data.get("email") ?? "").trim();
      if (!errs.email) {
        const next = validateEmailMessage(email);
        if (next) errs.email = next;
      }
      setErrors(errs);
      setResult(null);
      if (Object.keys(errs).length) return;

      setLoading(true);
      const res = await fetchJson("/auth/password-reset/request", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email })
      });
      setLoading(false);
      if (!res.ok) {
        setErrors(fieldErrorsFromFailure(res));
        setResult({ ok: false, message: res.error ?? "Unable to send a reset link" });
        return;
      }
      // The API answers the same whether or not the address has an account.
      setSent(true);
    },
    [setErrors]
  );

  return { errors, result, loading, sent, onSubmit, onInput: onFormInput };
}

/** The reset link's form: sets a new password with the token from the link. */
export function usePasswordResetConfirmOrchestration(deps: { token: string | null }) {
  const { token } = deps;
  const { errors, setErrors, onFormInput } = useFieldErrors();
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejected, setRejected] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!token) return { ok: false as const };
      const data = new FormData(e.currentTarget);
      const password = String(data.get("password") ?? "");
      const confirmation = String(data.get("confirmPassword") ?? "");
      const errs: FieldErrors = {};
      const passwordError = validatePasswordMessage(password);
      if (passwordError) errs.password = passwordError;
      const confirmError = validatePasswordConfirmMessage(password, confirmation);
      if (confirmError) errs.confirmPassword = confirmError;
      setErrors(errs);
      setResult(null);
      if (Object.keys(errs).length) return { ok: false as const };

      setLoading(true);
      const res = await fetchJson("/auth/password-reset/confirm", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ token, password })
      });
      setLoading(false);
      if (!res.ok) {
        if (res.errorCode === "INVALID_RESET_TOKEN") {
          setRejected(true);
          return { ok: false as const };
        }
        setErrors(fieldErrorsFromFailure(res));
        setResult({ ok: false, message: res.error ?? "Unable to reset your password" });
        return { ok: false as const };
      }

      notify({
        id: "auth.password_reset.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Your password has been changed. Sign in with your new password."
      });
      return { ok: true as const };
    },
    [setErrors, token]
  );

  return {
    errors,
    result,
    loading,
    linkInvalid: !token || rejected,
    onSubmit,
    onInput: onFormInput
  };
}
