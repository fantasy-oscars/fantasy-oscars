import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import type { ApiResult, FieldErrors } from "../../lib/types";
import { notify } from "../../notifications";
import { getRequiredFieldErrors } from "../../decisions/forms";
import { fieldErrorsFromFailure } from "../../decisions/fieldErrors";
import { validateEmailMessage, validatePasswordMessage } from "../../decisions/auth";
import { useFieldErrors } from "../useFieldErrors";
import { errorMessage, unwrap } from "../query/errors";

/** Account writes. The account itself is read from the auth session query. */
export function useAccountOrchestration() {
  const deleteMutation = useMutation({
    mutationFn: async () =>
      unwrap(
        await fetchJson("/auth/me", { method: "DELETE" }),
        "Unable to delete account"
      )
  });
  const { mutateAsync } = deleteMutation;

  const deleteAccount = useCallback(async () => {
    try {
      await mutateAsync();
      return { ok: true as const };
    } catch (err) {
      return {
        ok: false as const,
        error: errorMessage(err, "Unable to delete account")
      };
    }
  }, [mutateAsync]);

  return { deleteAccount, deleting: deleteMutation.isPending };
}

type FetchFailure = Awaited<ReturnType<typeof fetchJson>>;

/** Inline errors for a failed account change; the current-password check names its input. */
function accountChangeFieldErrors(res: FetchFailure): FieldErrors {
  if (res.errorCode === "INVALID_CURRENT_PASSWORD") {
    return { currentPassword: "Current password is incorrect" };
  }
  if (res.errorCode === "USER_EXISTS") {
    return { email: "Another account already uses that email" };
  }
  return fieldErrorsFromFailure(res);
}

/**
 * One account-change form (both need the current password): validates, sends, places
 * failures on inputs, and on success clears the form and confirms with a toast.
 */
function useAccountChangeForm(config: {
  required: string[];
  validate: (data: FormData) => FieldErrors;
  send: (data: FormData) => ReturnType<typeof fetchJson>;
  failureMessage: string;
  success: { id: string; message: string };
  onSuccess?: () => Promise<void>;
}) {
  const { required, validate, send, failureMessage, success, onSuccess } = config;
  const { errors, setErrors, onFormInput } = useFieldErrors();
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const data = new FormData(form);
      const errs = { ...validate(data), ...getRequiredFieldErrors(required, data) };
      setErrors(errs);
      setResult(null);
      if (Object.keys(errs).length) return;

      setLoading(true);
      const res = await send(data);
      setLoading(false);
      if (!res.ok) {
        const fieldErrors = accountChangeFieldErrors(res);
        setErrors(fieldErrors);
        if (!Object.keys(fieldErrors).length) {
          setResult({ ok: false, message: res.error ?? failureMessage });
        }
        return;
      }
      form.reset();
      notify({
        ...success,
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false
      });
      await onSuccess?.();
    },
    [failureMessage, onSuccess, required, send, setErrors, success, validate]
  );

  return { errors, result, loading, onSubmit, onInput: onFormInput };
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const PASSWORD_REQUIRED = ["currentPassword", "newPassword"];
const EMAIL_REQUIRED = ["currentPassword", "email"];
const PASSWORD_SUCCESS = {
  id: "account.password.change.success",
  message: "Password changed"
};
const EMAIL_SUCCESS = { id: "account.email.change.success", message: "Email updated" };

function validatePasswordChange(data: FormData): FieldErrors {
  const message = validatePasswordMessage(String(data.get("newPassword") ?? ""));
  return message ? { newPassword: message } : {};
}

function validateEmailChange(data: FormData): FieldErrors {
  const message = validateEmailMessage(String(data.get("email") ?? "").trim());
  return message ? { email: message } : {};
}

function sendPasswordChange(data: FormData) {
  return fetchJson("/auth/password", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      currentPassword: String(data.get("currentPassword") ?? ""),
      newPassword: String(data.get("newPassword") ?? "")
    })
  });
}

function sendEmailChange(data: FormData) {
  return fetchJson("/auth/email", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      currentPassword: String(data.get("currentPassword") ?? ""),
      email: String(data.get("email") ?? "").trim()
    })
  });
}

/**
 * Password and email changes from the account page. `onEmailChanged` reloads the
 * session so the page shows the new address.
 */
export function useAccountSecurityOrchestration(deps: {
  onEmailChanged: () => Promise<void>;
}) {
  const password = useAccountChangeForm({
    required: PASSWORD_REQUIRED,
    validate: validatePasswordChange,
    send: sendPasswordChange,
    failureMessage: "Unable to change your password",
    success: PASSWORD_SUCCESS
  });
  const email = useAccountChangeForm({
    required: EMAIL_REQUIRED,
    validate: validateEmailChange,
    send: sendEmailChange,
    failureMessage: "Unable to change your email",
    success: EMAIL_SUCCESS,
    onSuccess: deps.onEmailChanged
  });
  return { password, email };
}
