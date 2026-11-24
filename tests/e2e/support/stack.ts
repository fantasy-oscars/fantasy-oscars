import { randomUUID } from "node:crypto";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestDatabase } from "../../../apps/api/tests/db";
import {
  assertPortsFree,
  runToCompletion,
  startProcess,
  stopProcess,
  waitForHttp,
  type Running
} from "./processes";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const E2E_WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 4174);
export const E2E_WEB_ORIGIN = `http://127.0.0.1:${E2E_WEB_PORT}`;
export const E2E_API_ORIGIN = `http://127.0.0.1:${E2E_API_PORT}`;

/** Served from the build output so readiness can tell this run's preview from another. */
const WEB_TOKEN_FILE = "fo-e2e-token.txt";

export type E2eStack = {
  pool: Awaited<ReturnType<typeof startTestDatabase>>["pool"];
  databaseUrl: string;
  /** The API's stdout as JSON log lines, including the logging mailer's reset links. */
  apiLogPath: string;
  stop: () => Promise<void>;
};

/**
 * Boots a throwaway Postgres container, the API against it, and a production
 * build of the web app pointed at that API. Everything is torn down by `stop`.
 * `webMode` builds with a named Vite mode; `enableAllBrands` turns on unreleased brands
 * and needs a non-production mode (the build refuses the flag in production);
 * `enableSpecimen` includes the test-only `/__specimen` route in the bundle.
 * `enableDraftSweeper` runs the draft sweeper, so a pick clock that runs out
 * auto-drafts or records a miss.
 * The API sends no real email: without `RESEND_API_KEY` outside production it uses the
 * logging mailer, whose `mail_logged` lines land in `apiLogPath`.
 */
export async function startStack(
  opts: {
    webMode?: string;
    enableAllBrands?: boolean;
    enableSpecimen?: boolean;
    enableDraftSweeper?: boolean;
  } = {}
): Promise<E2eStack> {
  await assertPortsFree([
    { env: "E2E_WEB_PORT", port: E2E_WEB_PORT },
    { env: "E2E_API_PORT", port: E2E_API_PORT }
  ]);
  const processes: Running[] = [];
  let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
  let webDist: string | null = null;
  const apiLogDir = mkdtempSync(path.join(tmpdir(), "fo-e2e-api-log-"));
  const apiLogPath = path.join(apiLogDir, "api.log");

  const stop = async () => {
    await Promise.all(processes.map(stopProcess));
    if (db) await db.stop();
    if (webDist) rmSync(webDist, { recursive: true, force: true });
    rmSync(apiLogDir, { recursive: true, force: true });
  };

  try {
    db = await startTestDatabase();
    const baseEnv: NodeJS.ProcessEnv = { ...process.env };
    delete baseEnv.NODE_ENV;
    delete baseEnv.RESEND_API_KEY;

    const api = startProcess(
      "api",
      process.execPath,
      ["--import", "tsx", "src/index.ts"],
      {
        cwd: path.join(repoRoot, "apps/api"),
        env: {
          ...baseEnv,
          DATABASE_URL: db.connectionString,
          PORT: String(E2E_API_PORT),
          AUTH_SECRET: "e2e-auth-secret",
          CORS_ALLOWED_ORIGINS: E2E_WEB_ORIGIN,
          WEB_BASE_URL: E2E_WEB_ORIGIN,
          LOG_LEVEL: "info",
          LOG_FORMAT: "json",
          // The sweeper ends timed-out picks; seeded screens must not move.
          DRAFT_SWEEPER_ENABLED: opts.enableDraftSweeper ? "true" : "false"
        },
        tied: true
      }
    );
    processes.push(api);
    api.child.stdout?.on("data", (chunk: Buffer) => appendFileSync(apiLogPath, chunk));

    webDist = mkdtempSync(path.join(tmpdir(), "fo-e2e-web-"));
    const webDir = path.join(repoRoot, "apps/web");
    const viteBin = path.join(webDir, "node_modules/vite/bin/vite.js");
    const build = startProcess(
      "web build",
      process.execPath,
      [
        viteBin,
        "build",
        "--outDir",
        webDist,
        "--emptyOutDir",
        ...(opts.webMode ? ["--mode", opts.webMode] : [])
      ],
      {
        cwd: webDir,
        env: {
          ...baseEnv,
          VITE_API_BASE: E2E_API_ORIGIN,
          ...(opts.enableAllBrands ? { VITE_FO_ENABLE_ALL_BRANDS: "1" } : {}),
          ...(opts.enableSpecimen ? { VITE_FO_ENABLE_SPECIMEN: "1" } : {})
        }
      }
    );
    await runToCompletion(build);
    const webToken = randomUUID();
    writeFileSync(path.join(webDist, WEB_TOKEN_FILE), webToken);

    const web = startProcess(
      "web preview",
      process.execPath,
      [
        viteBin,
        "preview",
        "--outDir",
        webDist,
        "--host",
        "127.0.0.1",
        "--port",
        String(E2E_WEB_PORT),
        "--strictPort"
      ],
      { cwd: webDir, env: baseEnv, tied: true }
    );
    processes.push(web);

    await Promise.all([
      waitForHttp(`${E2E_API_ORIGIN}/health`, api, 60_000),
      waitForHttp(`${E2E_WEB_ORIGIN}/${WEB_TOKEN_FILE}`, web, 60_000, {
        accept: async (res) => (await res.text()) === webToken
      })
    ]);

    return { pool: db.pool, databaseUrl: db.connectionString, apiLogPath, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}
