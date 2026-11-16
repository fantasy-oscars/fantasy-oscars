import type { MailConfig } from "../../config/env.js";
import { buildPasswordResetEmail, maskEmail } from "../../domain/passwordReset.js";
import { log } from "../../logger.js";
import { captureServerError } from "../../observability/sentry.js";

/** The only email the app sends. */
export interface Mailer {
  sendPasswordReset(to: string, link: string): Promise<void>;
}

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export class MailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailDeliveryError";
  }
}

/**
 * Sends through Resend's HTTP API with one `fetch`. Open and click tracking are
 * domain settings at Resend (off unless enabled); the message itself carries no
 * pixel and links point straight at the app.
 */
export function createResendMailer(opts: {
  apiKey: string;
  from: string;
  replyTo: string;
  fetchImpl?: typeof fetch;
}): Mailer {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async sendPasswordReset(to, link) {
      const { subject, text, html } = buildPasswordResetEmail(link);
      const res = await fetchImpl(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: opts.from,
          to: [to],
          reply_to: opts.replyTo,
          subject,
          text,
          html
        })
      });
      if (!res.ok) {
        // The response body can echo the recipient; report the status only.
        throw new MailDeliveryError(
          `Resend rejected the email with status ${res.status}`
        );
      }
    }
  };
}

export type LoggedMail = { kind: "password_reset"; to: string; link: string };

/**
 * Development and tests: records each message in memory and writes the link to
 * the log instead of sending anything. Never used in production.
 */
export function createLoggingMailer(): Mailer & { sent: LoggedMail[] } {
  const sent: LoggedMail[] = [];
  return {
    sent,
    async sendPasswordReset(to, link) {
      sent.push({ kind: "password_reset", to, link });
      log({
        level: "info",
        msg: "mail_logged",
        kind: "password_reset",
        to: maskEmail(to),
        link
      });
    }
  };
}

/** Production without RESEND_API_KEY: every attempt is an error, nothing is sent. */
export function createUnconfiguredMailer(): Mailer {
  return {
    async sendPasswordReset() {
      log({ level: "error", msg: "mail_not_configured", kind: "password_reset" });
      captureServerError(
        new MailDeliveryError("RESEND_API_KEY is not set; password reset email not sent")
      );
    }
  };
}

export function createMailer(config: MailConfig, isProduction: boolean): Mailer {
  if (config.resendApiKey) {
    return createResendMailer({
      apiKey: config.resendApiKey,
      from: config.from,
      replyTo: config.replyTo
    });
  }
  return isProduction ? createUnconfiguredMailer() : createLoggingMailer();
}
