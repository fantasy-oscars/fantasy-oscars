import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestDatabase } from "../../../apps/api/tests/db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const E2E_WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 4174);
export const E2E_WEB_ORIGIN = `http://127.0.0.1:${E2E_WEB_PORT}`;
export const E2E_API_ORIGIN = `http://127.0.0.1:${E2E_API_PORT}`;

type Running = { name: string; child: ChildProcess; output: string[] };

function run(
  name: string,
  command: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv }
): Running {
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output: string[] = [];
  const collect = (chunk: Buffer) => {
    output.push(chunk.toString());
    if (output.length > 200) output.shift();
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  return { name, child, output };
}

function hasExited(p: Running): boolean {
  return p.child.exitCode !== null || p.child.signalCode !== null;
}

function exited(p: Running): Promise<number | null> {
  return new Promise((resolve) => {
    if (hasExited(p)) {
      resolve(p.child.exitCode);
      return;
    }
    p.child.once("exit", (code) => resolve(code));
  });
}

async function runToCompletion(p: Running) {
  const code = await exited(p);
  if (code !== 0) {
    throw new Error(`${p.name} exited with code ${code}\n${p.output.join("")}`);
  }
}

async function stopProcess(p: Running) {
  if (hasExited(p)) return;
  p.child.kill("SIGTERM");
  const killTimer = setTimeout(() => p.child.kill("SIGKILL"), 5_000);
  await exited(p);
  clearTimeout(killTimer);
}

async function waitForHttp(url: string, p: Running, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (hasExited(p)) {
      throw new Error(`${p.name} exited early\n${p.output.join("")}`);
    }
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${url}\n${p.output.join("")}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

export type E2eStack = {
  pool: Awaited<ReturnType<typeof startTestDatabase>>["pool"];
  databaseUrl: string;
  stop: () => Promise<void>;
};

/**
 * Boots a throwaway Postgres container, the API against it, and a production
 * build of the web app pointed at that API. Everything is torn down by `stop`.
 */
export async function startStack(): Promise<E2eStack> {
  const processes: Running[] = [];
  let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
  let webDist: string | null = null;

  const stop = async () => {
    await Promise.all(processes.map(stopProcess));
    if (db) await db.stop();
    if (webDist) rmSync(webDist, { recursive: true, force: true });
  };

  try {
    db = await startTestDatabase();
    const baseEnv: NodeJS.ProcessEnv = { ...process.env };
    delete baseEnv.NODE_ENV;

    const api = run("api", process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: path.join(repoRoot, "apps/api"),
      env: {
        ...baseEnv,
        DATABASE_URL: db.connectionString,
        PORT: String(E2E_API_PORT),
        AUTH_SECRET: "e2e-auth-secret",
        CORS_ALLOWED_ORIGINS: E2E_WEB_ORIGIN,
        DRAFT_SWEEPER_ENABLED: "false"
      }
    });
    processes.push(api);

    webDist = mkdtempSync(path.join(tmpdir(), "fo-e2e-web-"));
    const webDir = path.join(repoRoot, "apps/web");
    const viteBin = path.join(webDir, "node_modules/vite/bin/vite.js");
    const build = run(
      "web build",
      process.execPath,
      [viteBin, "build", "--outDir", webDist, "--emptyOutDir"],
      { cwd: webDir, env: { ...baseEnv, VITE_API_BASE: E2E_API_ORIGIN } }
    );
    await runToCompletion(build);

    const web = run(
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
      { cwd: webDir, env: baseEnv }
    );
    processes.push(web);

    await Promise.all([
      waitForHttp(`${E2E_API_ORIGIN}/health`, api, 60_000),
      waitForHttp(E2E_WEB_ORIGIN, web, 60_000)
    ]);

    return { pool: db.pool, databaseUrl: db.connectionString, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}
