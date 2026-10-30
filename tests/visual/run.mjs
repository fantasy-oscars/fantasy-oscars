#!/usr/bin/env node
// Runs the visual suite with the browser inside the official Playwright Docker image.
//
// The API, Postgres (Testcontainers) and web build run on the host exactly as in the
// e2e suite; only Chromium runs in the container, reached over Playwright's
// `run-server` websocket and tunnelled back to the host's loopback ports. Pinning the
// image (and the linux/amd64 platform) is what makes baselines identical on macOS and
// on the Linux CI runner.
//
// Usage: node tests/visual/run.mjs [--update] [extra playwright args...]
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
const passthrough = args.filter((a) => a !== "--update");

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
  pwArgs.push(...passthrough);
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
