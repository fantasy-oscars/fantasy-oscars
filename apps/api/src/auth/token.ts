import crypto from "crypto";
import { AppError } from "../errors.js";

export type TokenClaims = {
  sub: string;
  username: string;
  is_admin?: boolean;
  exp?: number; // unix seconds
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function parseBase64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function signToken(
  claims: TokenClaims,
  secret: string,
  expiresInSeconds = 60 * 60
) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = { ...claims, is_admin: Boolean(claims.is_admin), exp };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyToken(token: string, secret: string): TokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AppError("INVALID_TOKEN", 401, "Invalid token");
  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    throw new AppError("INVALID_TOKEN", 401, "Invalid token");
  }
  const payload = JSON.parse(
    parseBase64url(encodedPayload).toString("utf8")
  ) as TokenClaims;
  // Back-compat for older tokens that used `handle` instead of `username`.
  const anyPayload = payload as unknown as { handle?: unknown; username?: unknown };
  if (typeof anyPayload.username !== "string" && typeof anyPayload.handle === "string") {
    (payload as unknown as { username: string }).username = anyPayload.handle;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError("TOKEN_EXPIRED", 401, "Token expired");
  }
  return payload;
}
