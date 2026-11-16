import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/observability/sentry.js", () => ({
  captureServerError: vi.fn()
}));

import { captureServerError } from "../../../../src/observability/sentry.js";
import {
  MailDeliveryError,
  RESEND_EMAILS_URL,
  createLoggingMailer,
  createMailer,
  createResendMailer,
  createUnconfiguredMailer
} from "../../../../src/services/mail/mailer.js";

const LINK = "https://www.fantasy-oscars.com/reset-password?token=abc_DEF-123";
const TO = "player@example.com";

function captureLogs() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  return { lines, restore: () => spy.mockRestore() };
}

describe("Resend mailer", () => {
  it("posts one request with sender, reply-to, recipient, subject and both bodies", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "Fantasy Oscars <no-reply@fantasy-oscars.com>",
      replyTo: "support@fantasy-oscars.com",
      fetchImpl
    });

    await mailer.sendPasswordReset(TO, LINK);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_EMAILS_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer re_test",
      "Content-Type": "application/json"
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["from", "html", "reply_to", "subject", "text", "to"].sort()
    );
    expect(body.from).toBe("Fantasy Oscars <no-reply@fantasy-oscars.com>");
    expect(body.reply_to).toBe("support@fantasy-oscars.com");
    expect(body.to).toEqual([TO]);
    expect(body.subject).toBe("Reset your Fantasy Oscars password");

    const text = String(body.text);
    expect(text).toContain(LINK);
    expect(text).toContain("expires in 60 minutes");
    expect(text).toContain("you can ignore this email");

    const html = String(body.html);
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain("expires in 60 minutes");
    expect(html).toContain("you can ignore this email");
    // No tracking pixels or images of any kind.
    expect(html).not.toMatch(/<img/i);
  });

  it("throws a status-only error when Resend refuses the message", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: `bad ${TO}` }), { status: 422 })
    );
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "a@example.com",
      replyTo: "b@example.com",
      fetchImpl
    });
    const err = await mailer.sendPasswordReset(TO, LINK).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailDeliveryError);
    expect((err as Error).message).toBe("Resend rejected the email with status 422");
  });
});

describe("logging mailer", () => {
  const prevLevel = process.env.LOG_LEVEL;
  const prevFormat = process.env.LOG_FORMAT;
  beforeEach(() => {
    process.env.LOG_LEVEL = "info";
    process.env.LOG_FORMAT = "json";
  });
  afterEach(() => {
    process.env.LOG_LEVEL = prevLevel;
    process.env.LOG_FORMAT = prevFormat;
  });

  it("records the message and logs the link with a masked recipient", async () => {
    const logs = captureLogs();
    try {
      const mailer = createLoggingMailer();
      await mailer.sendPasswordReset(TO, LINK);
      expect(mailer.sent).toEqual([{ kind: "password_reset", to: TO, link: LINK }]);
      expect(logs.lines).toHaveLength(1);
      const entry = JSON.parse(logs.lines[0]!) as Record<string, unknown>;
      expect(entry).toMatchObject({
        msg: "mail_logged",
        link: LINK,
        to: "p***@example.com"
      });
      expect(logs.lines[0]).not.toContain(TO);
    } finally {
      logs.restore();
    }
  });
});

describe("unconfigured production mailer", () => {
  it("logs an error and reports to Sentry on every attempt without the address", async () => {
    process.env.LOG_LEVEL = "error";
    const logs = captureLogs();
    try {
      const mailer = createUnconfiguredMailer();
      await mailer.sendPasswordReset(TO, LINK);
      await mailer.sendPasswordReset(TO, LINK);
      expect(captureServerError).toHaveBeenCalledTimes(2);
      expect(logs.lines).toHaveLength(2);
      expect(logs.lines.join("\n")).toContain("mail_not_configured");
      expect(logs.lines.join("\n")).not.toContain(TO);
      expect(logs.lines.join("\n")).not.toContain("abc_DEF-123");
    } finally {
      logs.restore();
      delete process.env.LOG_LEVEL;
    }
  });
});

describe("createMailer", () => {
  const base = { from: "a@example.com", replyTo: "b@example.com" };

  it("uses Resend whenever a key is set", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      await createMailer({ ...base, resendApiKey: "re_x" }, false).sendPasswordReset(
        TO,
        LINK
      );
      expect(fetchSpy).toHaveBeenCalledWith(RESEND_EMAILS_URL, expect.anything());
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("logs in development and refuses to log links in production", () => {
    expect("sent" in createMailer({ ...base, resendApiKey: null }, false)).toBe(true);
    expect("sent" in createMailer({ ...base, resendApiKey: null }, true)).toBe(false);
  });
});
