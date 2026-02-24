import { useCallback, useState } from "react";
import type { ApiResult, FieldErrors } from "../../lib/types";
import { getRequiredFieldErrors } from "../../decisions/forms";
import {
  authFieldErrorMessage,
  validateEmailMessage,
  validatePasswordMessage,
  validateUsernameMessage
} from "../../decisions/auth";

type LoginFn = (input: { username: string; password: string }) => Promise<
  | { ok: true }
  | {
      ok: false;
      error?: string;
      errorCode?: string;
      errorFields?: string[];
    }
>;

type RegisterFn = (input: {
  username: string;
  email: string;
  password: string;
}) => Promise<
  | { ok: true }
  | {
      ok: false;
      error?: string;
      errorCode?: string;
      errorFields?: string[];
    }
>;

export function useLoginOrchestration(deps: { login: LoginFn }) {
  const { login } = deps;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const errs = getRequiredFieldErrors(["username", "password"], data);
      setErrors(errs);
      if (Object.keys(errs).length) return { ok: false as const };

      setLoading(true);
      const res = await login({
        username: String(data.get("username")),
        password: String(data.get("password"))
      });
      setLoading(false);
      if (!res.ok) {
        const nextErrors: FieldErrors = { ...errs };
        res.errorFields?.forEach((field) => {
          nextErrors[field] = authFieldErrorMessage(field);
        });
        setErrors(nextErrors);
        setResult({
          ok: false,
          message:
            res.errorCode === "VALIDATION_ERROR" && res.errorFields?.length
              ? "Please check the highlighted fields and try again."
              : res.errorCode === "INTERNAL_ERROR"
                ? "Login is temporarily unavailable due to a server issue. Please try again in a few minutes."
                : (res.error ?? "Login failed")
        });
        return { ok: false as const };
      }

      setResult({ ok: true, message: "Logged in" });
      return { ok: true as const };
    },
    [login]
  );

  return { errors, result, loading, onSubmit, setResult };
}

export function useRegisterOrchestration(deps: { register: RegisterFn }) {
  const { register } = deps;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const errs = getRequiredFieldErrors(["username", "email", "password"], data);

      if (!errs.username) {
        const next = validateUsernameMessage(String(data.get("username") ?? ""));
        if (next) errs.username = next;
      }
      if (!errs.email) {
        const next = validateEmailMessage(String(data.get("email") ?? ""));
        if (next) errs.email = next;
      }
      if (!errs.password) {
        const next = validatePasswordMessage(String(data.get("password") ?? ""));
        if (next) errs.password = next;
      }

      setErrors(errs);
      if (Object.keys(errs).length) return { ok: false as const };

      setLoading(true);
      const res = await register({
        username: String(data.get("username")),
        email: String(data.get("email")),
        password: String(data.get("password"))
      });
      setLoading(false);
      if (!res.ok) {
        const nextErrors: FieldErrors = { ...errs };
        res.errorFields?.forEach((field) => {
          nextErrors[field] = authFieldErrorMessage(field);
        });
        setErrors(nextErrors);
        setResult({
          ok: false,
          message:
            res.errorCode === "VALIDATION_ERROR" && res.errorFields?.length
              ? "Please fix the highlighted fields and try again."
              : res.errorCode === "SERVICE_UNAVAILABLE" ||
                  res.errorCode === "INTERNAL_ERROR"
                ? "We can't create accounts right now due to a server update. Please try again in a few minutes."
                : (res.error ?? "Registration failed")
        });
        return { ok: false as const };
      }
      setResult({ ok: true, message: "Account created" });
      return { ok: true as const };
    },
    [register]
  );

  return { errors, result, loading, onSubmit, setResult };
}
