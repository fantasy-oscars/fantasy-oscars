import nodemailer from "nodemailer";

export type ResetEmailConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  from: string;
  appBaseUrl: string;
};

export function loadResetEmailConfig(
  env: NodeJS.ProcessEnv = process.env
): ResetEmailConfig {
  const smtpHost = requireEnv(env, "RESET_EMAIL_SMTP_HOST");
  const smtpPort = parsePort(requireEnv(env, "RESET_EMAIL_SMTP_PORT"));
  const smtpUser = requireEnv(env, "RESET_EMAIL_SMTP_USER");
  const smtpPass = requireEnv(env, "RESET_EMAIL_SMTP_PASS");
  const from = requireEnv(env, "RESET_EMAIL_FROM");
  const appBaseUrl = (
    env.RESET_APP_BASE_URL ?? "https://fantasy-oscars.onrender.com"
  ).trim();
  const smtpSecure =
    env.RESET_EMAIL_SMTP_SECURE?.trim().toLowerCase() === "false" ? false : true;

  return { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, from, appBaseUrl };
}

export function buildResetUrl(base: string, token: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  return `${normalizedBase}/reset/confirm?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(
  cfg: ResetEmailConfig,
  params: { to: string; token: string }
) {
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: {
      user: cfg.smtpUser,
      pass: cfg.smtpPass
    }
  });

  const resetUrl = buildResetUrl(cfg.appBaseUrl, params.token);
  const text = [
    "You requested a password reset for Fantasy Oscars.",
    "",
    `Reset link: ${resetUrl}`,
    "",
    "If you did not request this, you can ignore this email.",
    "This link expires soon and can only be used once."
  ].join("\n");

  await transporter.sendMail({
    from: cfg.from,
    to: params.to,
    subject: "Reset your Fantasy Oscars password",
    text
  });
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `RESET_EMAIL_SMTP_PORT must be a positive integer, received: ${value}`
    );
  }
  return parsed;
}
