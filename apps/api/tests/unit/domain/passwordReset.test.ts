import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_TTL_MS,
  buildPasswordResetEmail,
  buildPasswordResetLink,
  maskEmail
} from "../../../src/domain/passwordReset.js";

describe("password reset domain", () => {
  it("expires links after 60 minutes", () => {
    expect(PASSWORD_RESET_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("builds the reset link on the web origin", () => {
    expect(buildPasswordResetLink("https://example.com", "a-b_C")).toBe(
      "https://example.com/reset-password?token=a-b_C"
    );
  });

  it("escapes the link in the HTML body", () => {
    const { html, text } = buildPasswordResetEmail('https://x.test/?a=1&b="2"');
    expect(html).toContain("https://x.test/?a=1&amp;b=&quot;2&quot;");
    expect(text).toContain('https://x.test/?a=1&b="2"');
  });

  it("masks an address down to its first letter and domain", () => {
    expect(maskEmail("player@example.com")).toBe("p***@example.com");
    expect(maskEmail("nope")).toBe("***");
  });
});
