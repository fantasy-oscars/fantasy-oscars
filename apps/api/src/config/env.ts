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
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = parsePort(requireEnv(env, "PORT"));
  return { port };
}
