import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "../../../src/auth/token.js";
import { AppError } from "../../../src/errors.js";

const secret = "test-secret";

function forge(payloadJson: string, sigOverride?: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url"
  );
  const payload = Buffer.from(payloadJson).toString("base64url");
  const data = `${header}.${payload}`;
  const sig =
    sigOverride ?? crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function expectInvalid(token: string) {
  let caught: unknown;
  try {
    verifyToken(token, secret);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(AppError);
  expect((caught as AppError).code).toBe("INVALID_TOKEN");
  expect((caught as AppError).status).toBe(401);
}

describe("verifyToken", () => {
  it("accepts a valid token", () => {
    const token = signToken({ sub: "1", username: "u" }, secret);
    expect(verifyToken(token, secret).sub).toBe("1");
  });

  it("rejects a signature of the wrong length with INVALID_TOKEN", () => {
    expectInvalid(forge('{"sub":"1"}', "short"));
  });

  it("rejects a correctly signed non-JSON payload with INVALID_TOKEN", () => {
    expectInvalid(forge("not json"));
  });

  it("rejects a correctly signed non-object payload with INVALID_TOKEN", () => {
    expectInvalid(forge("null"));
  });
});
