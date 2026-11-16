import { describe, expect, it } from "vitest";
import {
  readResetToken,
  validatePasswordConfirmMessage,
  withoutResetToken
} from "@/decisions/auth";

describe("password reset link decisions", () => {
  it("reads the token from the link's query string", () => {
    expect(readResetToken("?token=abc123")).toBe("abc123");
    expect(readResetToken("?other=1&token=abc123")).toBe("abc123");
  });

  it("treats a missing or blank token as no token", () => {
    expect(readResetToken("")).toBeNull();
    expect(readResetToken("?token=")).toBeNull();
    expect(readResetToken("?token=%20")).toBeNull();
  });

  it("builds the address without the token, keeping anything else", () => {
    expect(
      withoutResetToken({ pathname: "/reset-password", search: "?token=abc", hash: "" })
    ).toBe("/reset-password");
    expect(
      withoutResetToken({
        pathname: "/reset-password",
        search: "?token=abc&from=mail",
        hash: "#top"
      })
    ).toBe("/reset-password?from=mail#top");
  });

  it("requires the confirmation to match the new password", () => {
    expect(validatePasswordConfirmMessage("secret123", "")).toBe("Required");
    expect(validatePasswordConfirmMessage("secret123", "secret124")).toBe(
      "Passwords don't match"
    );
    expect(validatePasswordConfirmMessage("secret123", "secret123")).toBeNull();
  });
});
