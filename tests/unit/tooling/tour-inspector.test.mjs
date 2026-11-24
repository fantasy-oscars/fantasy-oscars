import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startInspector } from "../../tour/support/inspector-server.mjs";

const shot = (file, title) => ({
  file,
  section: "Setup",
  title,
  caption: `${title} caption`,
  persona: "cora",
  path: "/home",
  day: 0
});

function addRun(root, name, shots) {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({ generated: "2026-11-24", shots })
  );
  for (const s of shots) writeFileSync(path.join(dir, s.file), `png:${name}:${s.file}`);
  return dir;
}

async function open(runDir, previous) {
  const inspector = await startInspector({ runName: "run-b", runDir, previous, port: 0 });
  return { inspector, base: `http://localhost:${inspector.port}` };
}

const json = { "content-type": "application/json" };
const scratch = () => mkdtempSync(path.join(tmpdir(), "tour-inspect-"));

test("serves state with the previous run's matching shots, and only manifest images", async () => {
  const root = scratch();
  const before = addRun(root, "run-a", [
    shot("001-home.png", "Home"),
    shot("002-old.png", "Old")
  ]);
  const now = addRun(root, "run-b", [
    shot("002-home.png", "Home"),
    shot("003-new.png", "New")
  ]);
  const { inspector, base } = await open(now, { name: "run-a", dir: before });
  try {
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.previousRun, "run-a");
    assert.deepEqual(state.previousFiles, { "002-home.png": "001-home.png" });
    const current = await fetch(`${base}/img/current/002-home.png`);
    assert.equal(await current.text(), "png:run-b:002-home.png");
    const previous = await fetch(`${base}/img/previous/001-home.png`);
    assert.equal(await previous.text(), "png:run-a:001-home.png");
    assert.equal((await fetch(`${base}/img/current/manifest.json`)).status, 404);
    assert.equal((await fetch(`${base}/img/current/001-home.png`)).status, 404);
    assert.equal(
      (await fetch(`${base}/img/current/..%2Frun-a%2F001-home.png`)).status,
      404
    );
    assert.equal((await fetch(`${base}/`)).status, 200);
  } finally {
    await inspector.close();
  }
});

test("notes survive a restart, a blank note removes its entry, Finish writes notes.md", async () => {
  const root = scratch();
  const now = addRun(root, "run-b", [
    shot("001-home.png", "Home"),
    shot("002-draft.png", "Draft")
  ]);
  let session = await open(now, null);
  try {
    const put = (file, text) =>
      fetch(`${session.base}/api/note`, {
        method: "PUT",
        headers: json,
        body: JSON.stringify({ file, text })
      });
    assert.equal((await put("002-draft.png", "Button is cut off")).status, 200);
    assert.equal((await put("001-home.png", "tmp")).status, 200);
    assert.equal((await put("001-home.png", "  ")).status, 200);
    assert.equal((await put("nope.png", "x")).status, 400);
  } finally {
    await session.inspector.close();
  }
  assert.deepEqual(JSON.parse(readFileSync(path.join(now, "notes.json"), "utf8")), {
    "002-draft.png": "Button is cut off"
  });

  session = await open(now, null);
  try {
    const state = await (await fetch(`${session.base}/api/state`)).json();
    assert.deepEqual(state.notes, { "002-draft.png": "Button is cut off" });
    assert.equal(state.previousRun, null);
    assert.equal(existsSync(path.join(now, "notes.md")), false);
    const res = await fetch(`${session.base}/api/finish`, {
      method: "POST",
      headers: json,
      body: "{}"
    });
    const { markdown } = await res.json();
    assert.match(markdown, /^# Tour notes · run-b/);
    assert.match(
      markdown,
      /### 002 · Draft\n\n- Path: `\/home`\n- Persona: cora\n- Day: 0\n\nButton is cut off/
    );
    assert.equal(readFileSync(path.join(now, "notes.md"), "utf8"), markdown);
  } finally {
    await session.inspector.close();
  }
});

test("refuses non-JSON writes and foreign Host headers", async () => {
  const root = scratch();
  const now = addRun(root, "run-b", [shot("001-home.png", "Home")]);
  const { inspector, base } = await open(now, null);
  try {
    const form = await fetch(`${base}/api/note`, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ file: "001-home.png", text: "x" })
    });
    assert.equal(form.status, 415);
    assert.equal(existsSync(path.join(now, "notes.json")), false);
    const foreign = await new Promise((resolve, reject) => {
      request(
        {
          host: "127.0.0.1",
          port: inspector.port,
          path: "/api/state",
          headers: { host: "evil.example" }
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        }
      )
        .on("error", reject)
        .end();
    });
    assert.equal(foreign, 403);
  } finally {
    await inspector.close();
  }
});
