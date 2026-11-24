// Runs a command and stops it when this process's stdin closes. The parent that
// starts it holds the write end of the pipe, so the pipe closes when the parent
// exits for any reason, SIGKILL included, and the command does not outlive it.
// Usage: node tie-to-parent.mjs <command> [args...]
import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  process.stderr.write("usage: tie-to-parent.mjs <command> [args...]\n");
  process.exit(2);
}

const GRACE_MS = 3_000;
const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
let stopping = false;

function stopChild() {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), GRACE_MS).unref();
}

child.on("error", (err) => {
  process.stderr.write(`failed to start ${command}: ${err.message}\n`);
  process.exit(127);
});
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 128 : 0));
});

process.stdin.on("end", stopChild);
process.stdin.on("close", stopChild);
process.stdin.on("error", stopChild);
process.stdin.resume();
process.on("SIGTERM", stopChild);
process.on("SIGINT", stopChild);
process.on("SIGHUP", stopChild);
