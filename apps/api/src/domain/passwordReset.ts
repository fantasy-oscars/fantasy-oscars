/** A reset link works for 60 minutes after it is requested. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** Link to the web reset screen; the token travels only in this URL. */
export function buildPasswordResetLink(webBaseUrl: string, token: string): string {
  return `${webBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

export type PasswordResetEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text plus minimal HTML: the link, its expiry, and nothing else. */
export function buildPasswordResetEmail(link: string): PasswordResetEmail {
  const minutes = Math.round(PASSWORD_RESET_TTL_MS / 60_000);
  const subject = "Reset your Fantasy Oscars password";
  const text = [
    "Someone asked to reset the password for your Fantasy Oscars account.",
    "",
    `Choose a new password here (the link expires in ${minutes} minutes and works once):`,
    link,
    "",
    "If you did not ask for this, you can ignore this email. Your password stays the same."
  ].join("\n");
  const safeLink = escapeHtml(link);
  const html = [
    "<p>Someone asked to reset the password for your Fantasy Oscars account.</p>",
    `<p><a href="${safeLink}">Choose a new password</a></p>`,
    `<p>The link expires in ${minutes} minutes and works once. If the button does not work, paste this address into your browser:<br>${safeLink}</p>`,
    "<p>If you did not ask for this, you can ignore this email. Your password stays the same.</p>"
  ].join("\n");
  return { subject, text, html };
}

/** Keeps an address recognisable in development logs without writing it in full. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
