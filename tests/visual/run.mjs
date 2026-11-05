#!/usr/bin/env node
// Runs the visual suite with the browser inside the official Playwright Docker image.
//
// The API, Postgres (Testcontainers) and web build run on the host exactly as in the
// e2e suite; only Chromium runs in the container, reached over Playwright's
// `run-server` websocket and tunnelled back to the host's loopback ports. Pinning the
// image (and the linux/amd64 platform) is what makes baselines identical on macOS and
// on the Linux CI runner.
//
// Usage: node tests/visual/run.mjs [--update] [--tier screenshots|assertions] [extra playwright args...]
// --tier runs one half of the suite (CI runs them as two parallel jobs): `screenshots`
// is the baseline comparisons plus the baseline orphan check, `assertions` the
// structural and contrast checks with the stale-allowlist judgement. Default: both.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(repoRoot, "package.json"));
const args = process.argv.slice(2);
const update = args.includes("--update");
const TIER_FILES = {
  screenshots: ["tests/visual/screens.spec.ts", "tests/visual/baselines.spec.ts"],
  assertions: ["tests/visual/assertions.spec.ts"]
};
const tierAt = args.indexOf("--tier");
const tier = tierAt >= 0 ? args[tierAt + 1] : undefined;
if (tierAt >= 0 && !(tier in TIER_FILES)) {
  console.error("--tier must be one of: screenshots, assertions");
  process.exit(2);
}
const tierArgs = new Set(tierAt >= 0 ? [tierAt, tierAt + 1] : []);
const passthrough = args.filter((a, i) => a !== "--update" && !tierArgs.has(i));

const testPkg = realpathSync(
  path.dirname(require.resolve("@playwright/test/package.json"))
);
const pwDir = path.join(path.dirname(path.dirname(testPkg)), "playwright");
const version = require(path.join(pwDir, "package.json")).version;
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const platform = "linux/amd64";
const containerName = `fo-visual-${process.pid}`;

function docker(cmdArgs, opts = {}) {
  return spawnSync("docker", cmdArgs, { encoding: "utf8", ...opts });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error("browser server did not start"));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function stopContainer() {
  docker(["rm", "-f", containerName], { stdio: "ignore" });
}

if (docker(["version"], { stdio: "ignore" }).status !== 0) {
  console.error("Docker is required to run the visual suite.");
  process.exit(1);
}
const inspect = docker(["image", "inspect", "--platform", platform, image], {
  stdio: "ignore"
});
if (inspect.status !== 0) {
  console.log(`Pulling ${image} (${platform})...`);
  const pull = docker(["pull", "--platform", platform, image], { stdio: "inherit" });
  if (pull.status !== 0) process.exit(pull.status ?? 1);
}

const port = await freePort();
const started = docker([
  "run",
  "-d",
  "--rm",
  "--name",
  containerName,
  "--platform",
  platform,
  "--init",
  "--ipc=host",
  "-p",
  `127.0.0.1:${port}:3000`,
  "-v",
  `${repoRoot}:/work:ro`,
  "-w",
  "/work",
  image,
  "node",
  `/work/${path.relative(repoRoot, pwDir)}/cli.js`,
  "run-server",
  "--port",
  "3000",
  "--host",
  "0.0.0.0",
  "--path",
  "/pw"
]);
if (started.status !== 0) {
  console.error(started.stderr);
  process.exit(started.status ?? 1);
}
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129]
]) {
  process.on(signal, () => {
    stopContainer();
    process.exit(code);
  });
}

let code = 1;
try {
  await waitForPort(port, 60_000);
  const pwArgs = ["exec", "playwright", "test", "-c", "playwright.visual.config.ts"];
  if (update) pwArgs.push("--update-snapshots");
  pwArgs.push(...passthrough, ...(tier ? TIER_FILES[tier] : []));
  code = await new Promise((resolve) => {
    const child = spawn("pnpm", pwArgs, {
      cwd: repoRoot,
      stdio: "inherit",
      env: { ...process.env, VISUAL_BROWSER_WS: `ws://127.0.0.1:${port}/pw` }
    });
    child.on("exit", (c) => resolve(c ?? 1));
  });
} finally {
  stopContainer();
}
process.exit(code);
