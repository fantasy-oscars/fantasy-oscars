import assert from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertPortsFree,
  startProcess,
  stopProcess,
  waitForHttp
} from "../../e2e/support/processes.ts";

const processesModule = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../e2e/support/processes.ts"
);

function listen(server, host = "127.0.0.1") {
  return new Promise((resolve) => {
    server.listen(0, host, () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return check();
}

test("a port that is in use makes the guard throw an error naming it", async () => {
  const server = net.createServer();
  const port = await listen(server);
  try {
    await assert.rejects(assertPortsFree([{ env: "E2E_WEB_PORT", port }]), (err) => {
      assert.match(err.message, new RegExp(`Port ${port} is already in use`));
      assert.match(err.message, new RegExp(`lsof -nP -iTCP:${port} -sTCP:LISTEN`));
      assert.match(err.message, /E2E_WEB_PORT/);
      return true;
    });
  } finally {
    await close(server);
  }
});

test("the guard passes for ports nothing holds", async () => {
  const probe = net.createServer();
  const a = await listen(probe);
  await close(probe);
  await assertPortsFree([{ env: "E2E_API_PORT", port: a }]);
});

test("readiness rejects when a foreign server answers but the spawned child exits", async () => {
  const foreign = http.createServer((_req, res) => res.end("someone else"));
  const port = await listen(foreign);
  const child = startProcess(
    "web preview",
    process.execPath,
    ["-e", "setTimeout(() => process.exit(1), 200)"],
    { cwd: process.cwd(), env: process.env }
  );
  try {
    await assert.rejects(
      waitForHttp(`http://127.0.0.1:${port}/`, child, 10_000, { settleMs: 600 }),
      /web preview exited/
    );
  } finally {
    await stopProcess(child);
    await close(foreign);
  }
});

test("readiness rejects a reply that fails identity until the child exits", async () => {
  const foreign = http.createServer((_req, res) => res.end("not the token"));
  const port = await listen(foreign);
  const child = startProcess(
    "web preview",
    process.execPath,
    ["-e", "setTimeout(() => process.exit(1), 400)"],
    { cwd: process.cwd(), env: process.env }
  );
  try {
    await assert.rejects(
      waitForHttp(`http://127.0.0.1:${port}/`, child, 10_000, {
        accept: async (res) => (await res.text()) === "the token"
      }),
      /web preview exited early/
    );
  } finally {
    await stopProcess(child);
    await close(foreign);
  }
});

test("readiness resolves for the child's own server", async () => {
  const port = await freePort();
  const child = startProcess(
    "api",
    process.execPath,
    [
      "-e",
      "require('node:http').createServer((q, s) => s.end('the token')).listen(Number(process.env.P), '127.0.0.1')"
    ],
    { cwd: process.cwd(), env: { ...process.env, P: String(port) }, tied: true }
  );
  try {
    await waitForHttp(`http://127.0.0.1:${port}/`, child, 10_000, {
      accept: async (res) => (await res.text()) === "the token"
    });
  } finally {
    await stopProcess(child);
  }
  assert.ok(await until(() => !alive(child.child.pid), 5_000));
});

async function freePort() {
  const probe = net.createServer();
  const port = await listen(probe);
  await close(probe);
  return port;
}

test("a tied child exits within 5 s of its SIGKILLed parent", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fo-tie-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pidFile = path.join(dir, "child.pid");
  const parentScript = path.join(dir, "parent.mjs");
  fs.writeFileSync(
    parentScript,
    `import { startProcess } from ${JSON.stringify(processesModule)};
startProcess(
  "tied",
  process.execPath,
  [
    "-e",
    "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)",
    ${JSON.stringify(pidFile)}
  ],
  { cwd: process.cwd(), env: process.env, tied: true }
);
setInterval(() => {}, 1000);
`
  );

  const parent = spawn(process.execPath, [parentScript], { stdio: "ignore" });
  let childPid = 0;
  try {
    assert.ok(
      await until(
        () => fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8"),
        10_000
      ),
      "tied child never started"
    );
    childPid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.ok(alive(childPid), "tied child should be running before the parent dies");

    parent.kill("SIGKILL");
    const killedAt = Date.now();
    const gone = await until(() => !alive(childPid), 5_000);
    assert.ok(gone, "tied child still running 5 s after its parent was killed");
    assert.ok(Date.now() - killedAt <= 5_500);
  } finally {
    parent.kill("SIGKILL");
    if (childPid && alive(childPid)) process.kill(childPid, "SIGKILL");
  }
});
