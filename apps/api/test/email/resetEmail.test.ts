import { describe, expect, it, vi, beforeEach } from "vitest";
import nodemailer from "nodemailer";
import {
  buildResetUrl,
  loadResetEmailConfig,
  sendPasswordResetEmail
} from "../../src/email/resetEmail.js";

vi.mock("nodemailer", () => {
  const sendMail = vi.fn(async () => ({ messageId: "mocked" }));
  return {
    default: {
      createTransport: vi.fn(() => ({ sendMail }))
    },
    createTransport: vi.fn(() => ({ sendMail }))
  };
});

describe("reset email helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds reset URL without duplicate slashes", () => {
    expect(buildResetUrl("https://example.com/", "abc")).toBe(
      "https://example.com/reset/confirm?token=abc"
    );
  });

  it("loads config from env", () => {
    const cfg = loadResetEmailConfig({
      RESET_EMAIL_SMTP_HOST: "smtp.example.com",
      RESET_EMAIL_SMTP_PORT: "587",
      RESET_EMAIL_SMTP_USER: "user",
      RESET_EMAIL_SMTP_PASS: "pass",
      RESET_EMAIL_FROM: "no-reply@example.com",
      RESET_APP_BASE_URL: "https://app.example.com"
    });
    expect(cfg.smtpHost).toBe("smtp.example.com");
    expect(cfg.smtpPort).toBe(587);
    expect(cfg.from).toBe("no-reply@example.com");
    expect(cfg.appBaseUrl).toBe("https://app.example.com");
  });

  it("sends email with link", async () => {
    const cfg = {
      smtpHost: "smtp",
      smtpPort: 465,
      smtpUser: "u",
      smtpPass: "p",
      smtpSecure: true,
      from: "noreply@example.com",
      appBaseUrl: "https://app.example.com"
    };

    await sendPasswordResetEmail(cfg, { to: "user@example.com", token: "tok123" });

    type MockFn = ReturnType<typeof vi.fn>;
    const transporter = nodemailer.createTransport as unknown as MockFn;
    const sendMail = transporter.mock.results[0].value.sendMail as MockFn;

    expect(transporter).toHaveBeenCalledWith({
      host: "smtp",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" }
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("user@example.com");
    expect(sendMail.mock.calls[0][0].text).toContain(
      "https://app.example.com/reset/confirm?token=tok123"
    );
  });
});
