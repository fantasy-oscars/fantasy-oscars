import {
  PASSWORD_MIN_LENGTH,
  USERNAME_MIN_LENGTH,
  validateEmail,
  validatePassword,
  validateUsername
} from "@fantasy-oscars/shared";

function firstIssueMessage(messages: string[]): string | null {
  return messages.length ? messages[0] : null;
}

export function validateUsernameMessage(username: string): string | null {
  const issues = validateUsername(username);
  const msgs: string[] = [];
  for (const issue of issues) {
    if (issue.code === "TOO_SHORT")
      msgs.push(`Must be at least ${USERNAME_MIN_LENGTH} characters`);
    if (issue.code === "WHITESPACE") msgs.push("No spaces allowed");
    if (issue.code === "REQUIRED") msgs.push("Required");
  }
  return firstIssueMessage(msgs);
}

export function validateEmailMessage(email: string): string | null {
  const issues = validateEmail(email);
  if (!issues.length) return null;
  return "Enter a valid email";
}

export function validatePasswordMessage(password: string): string | null {
  const issues = validatePassword(password);
  for (const issue of issues) {
    if (issue.code === "TOO_SHORT")
      return `Must be at least ${PASSWORD_MIN_LENGTH} characters`;
    if (issue.code === "REQUIRED") return "Required";
  }
  return null;
}

export function authFieldErrorMessage(field: string): string {
  switch (field) {
    case "username":
      return `Must be ${USERNAME_MIN_LENGTH}+ characters with no spaces`;
    case "email":
      return "Enter a valid email";
    case "password":
      return `Must be at least ${PASSWORD_MIN_LENGTH} characters`;
    default:
      return "Invalid";
  }
}

export function validatePasswordConfirmMessage(
  password: string,
  confirmation: string
): string | null {
  if (!confirmation) return "Required";
  return password === confirmation ? null : "Passwords don't match";
}

/** The reset token carried by a password-reset link (`?token=…`), if any. */
export function readResetToken(search: string): string | null {
  const token = new URLSearchParams(search).get("token")?.trim();
  return token ? token : null;
}

/** The same address with the reset token removed, so it cannot linger in history. */
export function withoutResetToken(location: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  const params = new URLSearchParams(location.search);
  params.delete("token");
  const rest = params.toString();
  return `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`;
}
