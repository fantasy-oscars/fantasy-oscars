// The tour inspector's HTTP side: serves the page, one run's images and manifest, and
// saves notes. Plain node:http, no dependencies. Decisions are in runs.mjs.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listRuns, RUNS_DIR, runHasNotes } from "./run-dirs.mjs";
import {
  chooseInitialRun,
  matchPreviousShots,
  notesToMarkdown,
  previousRun,
  runOptions
} from "./runs.mjs";

const PAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../inspector"
);
const PAGES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"]
};
const MAX_BODY = 1_000_000;

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** The manifest's shots, or [] when the run has none. */
export function readShots(runDir) {
  const manifest = readJson(path.join(runDir, "manifest.json"), null);
  return Array.isArray(manifest?.shots) ? manifest.shots : [];
}

/** The saved notes as `{ shotFile: text }`. */
export function readNotes(runDir) {
  const notes = readJson(path.join(runDir, "notes.json"), {});
  return notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
}

/** Saves one shot's note; a blank note removes the entry. Returns the notes saved. */
export function saveNote(runDir, file, text) {
  const notes = readNotes(runDir);
  if (String(text).trim() === "") delete notes[file];
  else notes[file] = String(text);
  writeFileSync(path.join(runDir, "notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  return notes;
}

/**
 * Starts the inspector over the runs in `runsDir`, or over the single run in `outputDir`
 * (TOUR_OUTPUT_DIR). Every route takes `?run=<name>`; a name that is not a run is a 404,
 * and without one the route serves `initialRun` (default: the newest run). Each run's
 * previous run and notes are its own. Resolves to `{ server, port, close }`; port 0
 * picks a free one.
 */
export function startInspector({
  runsDir = RUNS_DIR,
  outputDir = null,
  initialRun,
  port = 4400
}) {
  const names = () => (outputDir ? [path.basename(outputDir)] : listRuns(runsDir));
  const dirOf = (name) => (outputDir ? outputDir : path.join(runsDir, name));
  const fallback = () =>
    outputDir ? path.basename(outputDir) : chooseInitialRun(names(), initialRun);

  /** The run a request asks for, with its previous run, or null when there is none. */
  function select(url) {
    const asked = url.searchParams.get("run");
    const name = asked === null ? fallback() : names().includes(asked) ? asked : null;
    if (name === null) return null;
    const before = outputDir ? null : previousRun(names(), name);
    const dir = dirOf(name);
    return {
      name,
      dir,
      previous: before ? { name: before, dir: dirOf(before) } : null,
      shots: readShots(dir)
    };
  }

  function send(res, status, type, body) {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  }
  const sendJson = (res, status, value) =>
    send(res, status, "application/json", JSON.stringify(value));

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error("too large"));
          req.destroy();
        } else chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = url.pathname;

    if (req.method === "GET" && PAGES[route]) {
      const [name, type] = PAGES[route];
      return send(res, 200, type, readFileSync(path.join(PAGE_DIR, name)));
    }
    const chosen = select(url);
    if (!chosen) return send(res, 404, "text/plain", "No such run");
    const { dir: runDir, shots, previous } = chosen;
    const files = new Set(shots.map((s) => s.file));
    if (req.method === "GET" && route === "/api/state") {
      const previousShots = previous ? readShots(previous.dir) : [];
      const all = names();
      return sendJson(res, 200, {
        run: chosen.name,
        initialRun: fallback(),
        runs: runOptions(
          all,
          all.filter((n) => runHasNotes(dirOf(n)))
        ),
        generated: readJson(path.join(runDir, "manifest.json"), {}).generated ?? null,
        previousRun: previous?.name ?? null,
        shots,
        notes: readNotes(runDir),
        previousFiles: Object.fromEntries(matchPreviousShots(shots, previousShots))
      });
    }
    const image = /^\/img\/(current|previous)\/([^/]+)$/.exec(route);
    if (req.method === "GET" && image) {
      const [, which, encoded] = image;
      const file = decodeURIComponent(encoded);
      const known =
        which === "current"
          ? files
          : new Set((previous ? readShots(previous.dir) : []).map((s) => s.file));
      const dir = which === "current" ? runDir : previous?.dir;
      const full = dir ? path.join(dir, file) : "";
      if (!known.has(file) || !existsSync(full))
        return send(res, 404, "text/plain", "Not found");
      return send(res, 200, "image/png", readFileSync(full));
    }
    // JSON bodies only: a cross-site form cannot send this content type unprompted.
    const isJson = (req.headers["content-type"] ?? "").startsWith("application/json");
    if (req.method === "PUT" && route === "/api/note") {
      if (!isJson) return sendJson(res, 415, { error: "JSON only" });
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return sendJson(res, 400, { error: "Bad JSON" });
      }
      if (!files.has(body?.file) || typeof body?.text !== "string") {
        return sendJson(res, 400, { error: "Unknown shot or missing text" });
      }
      saveNote(runDir, body.file, body.text);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "POST" && route === "/api/finish") {
      if (!isJson) return sendJson(res, 415, { error: "JSON only" });
      const markdown = notesToMarkdown(shots, readNotes(runDir), chosen.name);
      writeFileSync(path.join(runDir, "notes.md"), markdown);
      return sendJson(res, 200, { markdown });
    }
    return send(res, 404, "text/plain", "Not found");
  }

  const server = createServer((req, res) => {
    // Only reachable by name from this machine (blocks DNS rebinding).
    const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
      return send(res, 403, "text/plain", "Forbidden");
    }
    handle(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: "Server error" });
      else res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        server,
        port: server.address().port,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          })
      });
    });
  });
}
