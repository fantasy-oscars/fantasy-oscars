export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new ConfigError(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parsePort(portValue: string): number {
  const parsed = Number(portValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`PORT must be a positive integer, received: ${portValue}`);
  }
  return parsed;
}

export type AuthCookieSameSite = "lax" | "strict" | "none";

/**
 * SameSite for the auth cookie. Unset keeps the historical default: `none` in
 * production (web and API on different sites), `lax` otherwise. `none` is only
 * valid when the cookie is Secure, which is the case in production only.
 */
export function parseAuthCookieSameSite(
  value: string | undefined,
  isProduction: boolean
): AuthCookieSameSite {
  if (value === undefined || value.trim() === "") return isProduction ? "none" : "lax";
  const normalized = value.trim().toLowerCase();
  if (normalized !== "lax" && normalized !== "strict" && normalized !== "none") {
    throw new ConfigError(
      `AUTH_COOKIE_SAMESITE must be one of lax, strict, none, received: ${value}`
    );
  }
  if (normalized === "none" && !isProduction) {
    throw new ConfigError(
      "AUTH_COOKIE_SAMESITE=none requires a Secure cookie, which is only issued when NODE_ENV=production"
    );
  }
  return normalized;
}

export type ApiConfig = {
  port: number;
  authSecret: string;
  realtimeEnabled: boolean;
  corsAllowedOrigins: string[];
  /** Value for Express `trust proxy`: hop count, or boolean. */
  trustProxy: boolean | number;
};

const DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173";

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function parseCorsAllowedOrigins(value: string | undefined): string[] {
  const raw = value === undefined || value.trim() === "" ? DEFAULT_CORS_ORIGINS : value;
  return raw.split(",").map(normalizeOrigin).filter(Boolean);
}

export function parseTrustProxy(
  value: string | undefined,
  isProduction: boolean
): boolean | number {
  if (value === undefined || value.trim() === "") return isProduction ? 1 : false;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  throw new ConfigError(
    `TRUST_PROXY must be a non-negative integer, true, or false, received: ${value}`
  );
}

export type PgPoolConfig = {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
};

function parsePositiveIntEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
): number {
  const value = env[key];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${key} must be a positive integer, received: ${value}`);
  }
  return parsed;
}

export function parsePgPoolConfig(env: NodeJS.ProcessEnv = process.env): PgPoolConfig {
  return {
    max: parsePositiveIntEnv(env, "PG_POOL_MAX", 10),
    connectionTimeoutMillis: parsePositiveIntEnv(env, "PG_CONNECTION_TIMEOUT_MS", 5000),
    idleTimeoutMillis: parsePositiveIntEnv(env, "PG_IDLE_TIMEOUT_MS", 30000)
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = parsePort(requireEnv(env, "PORT"));
  const authSecret = requireEnv(env, "AUTH_SECRET");
  const realtimeEnabled = parseOptionalBool(env.REALTIME_ENABLED, true);
  const corsAllowedOrigins = parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const trustProxy = parseTrustProxy(env.TRUST_PROXY, env.NODE_ENV === "production");
  // Fail fast on a bad value; the cookie module reads it again where it is used.
  parseAuthCookieSameSite(env.AUTH_COOKIE_SAMESITE, env.NODE_ENV === "production");
  return { port, authSecret, realtimeEnabled, corsAllowedOrigins, trustProxy };
}

function parseOptionalBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new ConfigError(
    `REALTIME_ENABLED must be a boolean (true/false), received: ${value}`
  );
}
