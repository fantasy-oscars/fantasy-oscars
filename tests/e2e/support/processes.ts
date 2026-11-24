import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Running = { name: string; child: ChildProcess; output: string[] };

const tieScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "tie-to-parent.mjs"
);

/** True when something accepts connections or holds a bind on 127.0.0.1:port. */
function portInUse(port: number): Promise<boolean> {
  const connects = new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  return connects.then(
    (busy) =>
      busy ||
      new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.once("error", (err: NodeJS.ErrnoException) =>
          resolve(err.code === "EADDRINUSE")
        );
        server.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
          server.close(() => resolve(false))
        );
      })
  );
}

/**
 * Throws, naming the port, if any of the ports is in use. Never touches the process
 * that holds it. `env` names the variable that moves the port.
 */
export async function assertPortsFree(ports: { env: string; port: number }[]) {
  for (const { env, port } of ports) {
    if (!(await portInUse(port))) continue;
    throw new Error(
      `Port ${port} is already in use, so the e2e stack cannot start. ` +
        `Stop the process holding it (lsof -nP -iTCP:${port} -sTCP:LISTEN), ` +
        `or set E2E_WEB_PORT and E2E_API_PORT to free ports (${env} moves this one).`
    );
  }
}

/**
 * Starts a command with its output collected (last 200 chunks). With `tied`, the
 * command runs under `tie-to-parent.mjs`, which stops it when this process exits
 * without stopping it, SIGKILL included.
 */
export function startProcess(
  name: string,
  command: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; tied?: boolean }
): Running {
  const child = opts.tied
    ? spawn(process.execPath, [tieScript, command, ...args], {
        cwd: opts.cwd,
        env: opts.env,
        stdio: ["pipe", "pipe", "pipe"]
      })
    : spawn(command, args, {
        cwd: opts.cwd,
        env: opts.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
  // The pipe's closing is the signal; an error on it when the child is gone is not news.
  child.stdin?.on("error", () => undefined);
  const output: string[] = [];
  const collect = (chunk: Buffer) => {
    output.push(chunk.toString());
    if (output.length > 200) output.shift();
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  return { name, child, output };
}

export function hasExited(p: Running): boolean {
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

export async function runToCompletion(p: Running) {
  const code = await exited(p);
  if (code !== 0) {
    throw new Error(`${p.name} exited with code ${code}\n${p.output.join("")}`);
  }
}

export async function stopProcess(p: Running) {
  if (hasExited(p)) return;
  p.child.kill("SIGTERM");
  const killTimer = setTimeout(() => p.child.kill("SIGKILL"), 5_000);
  await exited(p);
  clearTimeout(killTimer);
}

/**
 * Resolves once `url` answers with a non-5xx reply that `accept` approves (any such
 * reply by default) and the spawned process `p` is still running `settleMs` later.
 * A reply can come from something else on the port, so it counts only while `p`, the
 * process meant to serve it, has not exited; a failed bind makes `p` exit within
 * moments of the first reply.
 */
export async function waitForHttp(
  url: string,
  p: Running,
  timeoutMs: number,
  opts: { accept?: (res: Response) => Promise<boolean>; settleMs?: number } = {}
) {
  const { accept, settleMs = 500 } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (hasExited(p)) {
      throw new Error(`${p.name} exited early\n${p.output.join("")}`);
    }
    let answered = false;
    try {
      const res = await fetch(url);
      answered = res.status < 500 && (!accept || (await accept(res)));
    } catch {
      // not listening yet
    }
    if (answered) {
      await new Promise((r) => setTimeout(r, settleMs));
      if (hasExited(p)) {
        throw new Error(
          `${p.name} exited after ${url} answered, so the reply was not its own\n${p.output.join("")}`
        );
      }
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${url}\n${p.output.join("")}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
