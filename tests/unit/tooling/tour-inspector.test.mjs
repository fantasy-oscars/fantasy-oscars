import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chooseInitialRun, runOptions } from "../../tour/support/runs.mjs";
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

async function open(runsDir, initialRun) {
  const inspector = await startInspector({ runsDir, initialRun, port: 0 });
  return { inspector, base: `http://localhost:${inspector.port}` };
}

const json = { "content-type": "application/json" };
const scratch = () => mkdtempSync(path.join(tmpdir(), "tour-inspect-"));

test("serves state with the previous run's matching shots, and only manifest images", async () => {
  const root = scratch();
  addRun(root, "2026-11-24-1000", [
    shot("001-home.png", "Home"),
    shot("002-old.png", "Old")
  ]);
  addRun(root, "2026-11-24-1100", [
    shot("002-home.png", "Home"),
    shot("003-new.png", "New")
  ]);
  const { inspector, base } = await open(root);
  try {
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.previousRun, "2026-11-24-1000");
    assert.deepEqual(state.previousFiles, { "002-home.png": "001-home.png" });
    const current = await fetch(`${base}/img/current/002-home.png`);
    assert.equal(await current.text(), "png:2026-11-24-1100:002-home.png");
    const previous = await fetch(`${base}/img/previous/001-home.png`);
    assert.equal(await previous.text(), "png:2026-11-24-1000:001-home.png");
    assert.equal((await fetch(`${base}/img/current/manifest.json`)).status, 404);
    assert.equal((await fetch(`${base}/img/current/001-home.png`)).status, 404);
    assert.equal(
      (await fetch(`${base}/img/current/..%2F2026-11-24-1000%2F001-home.png`)).status,
      404
    );
    assert.equal((await fetch(`${base}/`)).status, 200);
  } finally {
    await inspector.close();
  }
});

test("notes survive a restart, a blank note removes its entry, Finish writes notes.md", async () => {
  const root = scratch();
  const now = addRun(root, "2026-11-24-1100", [
    shot("001-home.png", "Home"),
    shot("002-draft.png", "Draft")
  ]);
  let session = await open(root);
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

  session = await open(root);
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
    assert.match(markdown, /^# Tour notes · 2026-11-24-1100/);
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
  const now = addRun(root, "2026-11-24-1100", [shot("001-home.png", "Home")]);
  const { inspector, base } = await open(root);
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

test("serves any run per request, with its own previous run, notes and Finish", async () => {
  const root = scratch();
  const a = addRun(root, "2026-11-24-1000", [shot("001-a.png", "A")]);
  const b = addRun(root, "2026-11-24-1100", [shot("001-b.png", "B")]);
  addRun(root, "2026-11-24-1200", [shot("001-b.png", "B")]);
  const { inspector, base } = await open(root);
  const put = (run, file, text) =>
    fetch(`${base}/api/note?run=${run}`, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ file, text })
    });
  try {
    const first = await (await fetch(`${base}/api/state`)).json();
    assert.equal(first.run, "2026-11-24-1200");
    assert.equal(first.initialRun, "2026-11-24-1200");
    assert.equal(first.previousRun, "2026-11-24-1100");
    assert.deepEqual(
      first.runs.map((r) => r.name),
      ["2026-11-24-1200", "2026-11-24-1100", "2026-11-24-1000"]
    );

    const oldest = await (await fetch(`${base}/api/state?run=2026-11-24-1000`)).json();
    assert.equal(oldest.run, "2026-11-24-1000");
    assert.equal(oldest.previousRun, null);
    assert.deepEqual(
      oldest.shots.map((s) => s.file),
      ["001-a.png"]
    );
    const middle = await (await fetch(`${base}/api/state?run=2026-11-24-1100`)).json();
    assert.equal(middle.previousRun, "2026-11-24-1000");

    const img = await fetch(`${base}/img/current/001-b.png?run=2026-11-24-1100`);
    assert.equal(await img.text(), "png:2026-11-24-1100:001-b.png");
    assert.equal(
      (await fetch(`${base}/img/current/001-a.png?run=2026-11-24-1100`)).status,
      404
    );

    assert.equal((await put("2026-11-24-1000", "001-a.png", "in a")).status, 200);
    assert.equal((await put("2026-11-24-1100", "001-b.png", "in b")).status, 200);
    assert.deepEqual(JSON.parse(readFileSync(path.join(a, "notes.json"), "utf8")), {
      "001-a.png": "in a"
    });
    assert.deepEqual(JSON.parse(readFileSync(path.join(b, "notes.json"), "utf8")), {
      "001-b.png": "in b"
    });
    assert.equal(existsSync(path.join(root, "2026-11-24-1200", "notes.json")), false);
    const listed = await (await fetch(`${base}/api/state`)).json();
    assert.deepEqual(
      listed.runs.map((r) => r.noted),
      [false, true, true]
    );

    const finish = await fetch(`${base}/api/finish?run=2026-11-24-1000`, {
      method: "POST",
      headers: json,
      body: "{}"
    });
    assert.match((await finish.json()).markdown, /^# Tour notes · 2026-11-24-1000/);
    assert.equal(existsSync(path.join(a, "notes.md")), true);
    assert.equal(existsSync(path.join(b, "notes.md")), false);
  } finally {
    await inspector.close();
  }
});

test("an unknown run is a 404 on every data route, never a crash", async () => {
  const root = scratch();
  addRun(root, "2026-11-24-1100", [shot("001-home.png", "Home")]);
  const { inspector, base } = await open(root);
  try {
    for (const bad of ["nope", "..", "latest", "..%2F..", "2026-11-24-1100%2F..%2Fx"]) {
      assert.equal((await fetch(`${base}/api/state?run=${bad}`)).status, 404, bad);
      assert.equal(
        (await fetch(`${base}/img/current/001-home.png?run=${bad}`)).status,
        404
      );
      const note = await fetch(`${base}/api/note?run=${bad}`, {
        method: "PUT",
        headers: json,
        body: JSON.stringify({ file: "001-home.png", text: "x" })
      });
      assert.equal(note.status, 404);
      const finish = await fetch(`${base}/api/finish?run=${bad}`, {
        method: "POST",
        headers: json,
        body: "{}"
      });
      assert.equal(finish.status, 404);
    }
    assert.equal((await fetch(`${base}/api/state`)).status, 200);
  } finally {
    await inspector.close();
  }
});

test("the initial run is the argument when given, else the newest", async () => {
  const root = scratch();
  addRun(root, "2026-11-24-1000", [shot("001-a.png", "A")]);
  addRun(root, "2026-11-24-1100", [shot("001-b.png", "B")]);
  const { inspector, base } = await open(root, "2026-11-24-1000");
  try {
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.run, "2026-11-24-1000");
    assert.equal(state.initialRun, "2026-11-24-1000");
  } finally {
    await inspector.close();
  }
});

test("with an output directory there is one run and no earlier one", async () => {
  const root = scratch();
  addRun(root, "2026-11-24-1000", [shot("001-a.png", "A")]);
  const out = addRun(root, "custom-out", [shot("001-c.png", "C")]);
  const inspector = await startInspector({
    runsDir: root,
    outputDir: out,
    initialRun: "custom-out",
    port: 0
  });
  const base = `http://localhost:${inspector.port}`;
  try {
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.run, "custom-out");
    assert.equal(state.previousRun, null);
    assert.equal((await fetch(`${base}/api/state?run=2026-11-24-1000`)).status, 404);
    assert.equal((await fetch(`${base}/api/state?run=custom-out`)).status, 200);
  } finally {
    await inspector.close();
  }
});

test("chooseInitialRun picks the argument or the newest run", () => {
  const names = ["2026-11-24-1100", "2026-11-24-1000", "latest", "notes"];
  assert.equal(chooseInitialRun(names, undefined), "2026-11-24-1100");
  assert.equal(chooseInitialRun(names, "latest"), "2026-11-24-1100");
  assert.equal(chooseInitialRun(names, "2026-11-24-1000"), "2026-11-24-1000");
  assert.equal(chooseInitialRun(names, "2026-01-01-0000"), null);
  assert.equal(chooseInitialRun([], "latest"), null);
});

test("runOptions lists newest first, marks the latest and runs with notes", () => {
  const options = runOptions(
    ["2026-11-24-1000", "2026-11-24-1200", "2026-11-24-1100", "latest"],
    ["2026-11-24-1000", "2026-11-24-1200"]
  );
  assert.deepEqual(
    options.map((o) => o.label),
    ["2026-11-24-1200 (latest) · notes", "2026-11-24-1100", "2026-11-24-1000 · notes"]
  );
  assert.deepEqual(
    options.map((o) => o.latest),
    [true, false, false]
  );
});
