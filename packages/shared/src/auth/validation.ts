export const USERNAME_MIN_LENGTH = 2;
export const PASSWORD_MIN_LENGTH = 8;

export type AuthField = "username" | "email" | "password";

export type AuthIssueCode = "REQUIRED" | "TOO_SHORT" | "WHITESPACE" | "INVALID_FORMAT";

export type AuthValidationIssue = {
  field: AuthField;
  code: AuthIssueCode;
};

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateUsername(username: string): AuthValidationIssue[] {
  const trimmed = username.trim();
  const issues: AuthValidationIssue[] = [];
  if (!trimmed.length) issues.push({ field: "username", code: "REQUIRED" });
  if (trimmed.length && trimmed.length < USERNAME_MIN_LENGTH) {
    issues.push({ field: "username", code: "TOO_SHORT" });
  }
  if (/\s/.test(trimmed)) issues.push({ field: "username", code: "WHITESPACE" });
  return issues;
}

export function validateEmail(email: string): AuthValidationIssue[] {
  const trimmed = email.trim();
  const issues: AuthValidationIssue[] = [];
  if (!trimmed.length) issues.push({ field: "email", code: "REQUIRED" });
  if (trimmed.length < 3) issues.push({ field: "email", code: "INVALID_FORMAT" });
  // Keep this deliberately basic for both FE and BE alignment.
  if (trimmed.length >= 3 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    issues.push({ field: "email", code: "INVALID_FORMAT" });
  }
  return issues;
}

export function validatePassword(password: string): AuthValidationIssue[] {
  const issues: AuthValidationIssue[] = [];
  if (!password.length) issues.push({ field: "password", code: "REQUIRED" });
  if (password.length && password.length < PASSWORD_MIN_LENGTH) {
    issues.push({ field: "password", code: "TOO_SHORT" });
  }
  return issues;
}

export function validateRegisterInput(input: {
  username: string;
  email: string;
  password: string;
}): AuthValidationIssue[] {
  return [
    ...validateUsername(input.username),
    ...validateEmail(input.email),
    ...validatePassword(input.password)
  ];
}
