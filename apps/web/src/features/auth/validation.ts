export const USERNAME_MIN_LENGTH = 2;
export const PASSWORD_MIN_LENGTH = 8;

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return `Must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (/\s/.test(trimmed)) {
    return "No spaces allowed";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length < 3) return "Enter a valid email";
  // Keep aligned with backend's basic sanity check.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Must be at least ${PASSWORD_MIN_LENGTH} characters`;
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
