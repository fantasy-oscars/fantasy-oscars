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

export type ApiConfig = {
  port: number;
  authSecret: string;
  realtimeEnabled: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = parsePort(requireEnv(env, "PORT"));
  const authSecret = requireEnv(env, "AUTH_SECRET");
  const realtimeEnabled = parseOptionalBool(env.REALTIME_ENABLED, true);
  return { port, authSecret, realtimeEnabled };
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
