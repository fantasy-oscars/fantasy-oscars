// Tour inspector page: one shot at a time, a debounced note per shot, compare with the
// previous run, Finish. All text goes in through textContent.
const SAVE_DELAY_MS = 600;
const $ = (id) => document.getElementById(id);
const els = {
  runSelect: $("run-select"),
  position: $("position"),
  saveState: $("save-state"),
  title: $("title"),
  caption: $("caption"),
  details: $("details"),
  banner: $("compare-banner"),
  image: $("image"),
  note: $("note"),
  list: $("list"),
  done: $("done"),
  donePath: $("done-path"),
  markdown: $("markdown"),
  copyState: $("copy-state")
};

let state = null;
let index = 0;
let comparing = false;
let initialRun = null; // the run the server was started on (the latest without an argument)
let runs = []; // [{ name, latest, noted, label }] newest first
let pending = null; // { run, file, text } waiting to be saved
let timer = null;
const rows = new Map(); // shot file -> list button

const runQuery = (run) => `run=${encodeURIComponent(run)}`;
const imageUrl = (which, file) =>
  `/img/${which}/${encodeURIComponent(file)}?${runQuery(state.run)}`;
const pageUrl = (run, file) =>
  `?${runQuery(run)}${file ? `#${encodeURIComponent(file)}` : ""}`;
const numberOf = (shot) => /^(\d+)-/.exec(shot.file)?.[1] ?? shot.file;
const hasNote = (file) => (state.notes[file] ?? "").trim() !== "";

async function putNote(run, file, text, keepalive = false) {
  const res = await fetch(`/api/note?${runQuery(run)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file, text }),
    keepalive
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

async function flush(keepalive = false) {
  clearTimeout(timer);
  timer = null;
  if (!pending) return;
  const { run, file, text } = pending;
  pending = null;
  try {
    await putNote(run, file, text, keepalive);
    if (!pending) els.saveState.textContent = "Saved";
  } catch (error) {
    els.saveState.textContent = String(error.message);
  }
}

function onNoteInput() {
  const shot = state.shots[index];
  state.notes[shot.file] = els.note.value;
  pending = { run: state.run, file: shot.file, text: els.note.value };
  els.saveState.textContent = "Saving…";
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY_MS);
  markRow(shot.file);
}

function markRow(file) {
  const row = rows.get(file);
  if (row) row.querySelector(".mark").textContent = hasNote(file) ? "●" : "";
  markRun();
}

function markRun() {
  const option = [...els.runSelect.options].find((o) => o.value === state.run);
  const entry = runs.find((r) => r.name === state.run);
  if (!option || !entry) return;
  const noted = Object.values(state.notes).some((text) => text.trim() !== "");
  const suffix = " · notes";
  const base = entry.label.endsWith(suffix)
    ? entry.label.slice(0, -suffix.length)
    : entry.label;
  option.textContent = noted ? `${base}${suffix}` : base;
}

function renderRuns() {
  els.runSelect.replaceChildren();
  for (const run of runs) {
    const option = document.createElement("option");
    option.value = run.name;
    option.textContent = run.label;
    els.runSelect.append(option);
  }
}

function renderList() {
  els.list.replaceChildren();
  rows.clear();
  let section = null;
  state.shots.forEach((shot, i) => {
    if (shot.section !== section) {
      section = shot.section;
      const h = document.createElement("h2");
      h.textContent = section;
      els.list.append(h);
    }
    const button = document.createElement("button");
    button.type = "button";
    for (const [cls, text] of [
      ["num", numberOf(shot)],
      ["title", shot.title],
      ["mark", ""]
    ]) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = text;
      button.append(span);
    }
    button.addEventListener("click", () => go(i));
    rows.set(shot.file, button);
    els.list.append(button);
    markRow(shot.file);
  });
}

function show() {
  const shot = state.shots[index];
  const previousFile = state.previousFiles[shot.file];
  if (comparing && !previousFile) comparing = false;
  els.title.textContent = `${numberOf(shot)} · ${shot.title}`;
  els.caption.textContent = shot.caption;
  els.details.textContent = `${shot.persona} · ${shot.path} · day ${shot.day}`;
  els.position.textContent = `${index + 1} of ${state.shots.length}`;
  els.image.src = comparing
    ? imageUrl("previous", previousFile)
    : imageUrl("current", shot.file);
  els.image.alt = shot.title;
  els.banner.hidden = !comparing;
  els.banner.textContent = comparing
    ? `Previous run ${state.previousRun} · press c to return`
    : "";
  if (els.note.value !== (state.notes[shot.file] ?? "")) {
    els.note.value = state.notes[shot.file] ?? "";
  }
  for (const [file, row] of rows) {
    if (file === shot.file) {
      row.setAttribute("aria-current", "true");
      row.scrollIntoView({ block: "nearest" });
    } else row.removeAttribute("aria-current");
  }
  history.replaceState(null, "", pageUrl(state.run, shot.file));
}

function go(next) {
  const clamped = Math.max(0, Math.min(state.shots.length - 1, next));
  if (clamped === index) return;
  flush();
  index = clamped;
  comparing = false;
  show();
  els.note.blur();
  document.querySelector("main").scrollTop = 0;
}

function toggleCompare() {
  const file = state.shots[index].file;
  if (!state.previousFiles[file]) {
    els.saveState.textContent = state.previousRun
      ? `No matching shot in ${state.previousRun}`
      : "No earlier run to compare";
    return;
  }
  comparing = !comparing;
  show();
}

async function finish() {
  await flush();
  const res = await fetch(`/api/finish?${runQuery(state.run)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  if (!res.ok) {
    els.saveState.textContent = `Finish failed (${res.status})`;
    return;
  }
  const { markdown } = await res.json();
  els.markdown.value = markdown;
  els.donePath.textContent = `Written to notes.md in run ${state.run}`;
  els.copyState.textContent = "";
  els.done.showModal();
  els.markdown.select();
}

async function copy() {
  try {
    await navigator.clipboard.writeText(els.markdown.value);
  } catch {
    els.markdown.select();
    document.execCommand("copy");
  }
  els.copyState.textContent = "Copied";
}

function onKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (els.done.open) return; // the dialog handles its own Esc
  if (event.target === els.note) {
    if (event.key === "Escape") els.note.blur();
    return;
  }
  if (event.target === els.runSelect) return; // keys belong to the select while it has focus
  switch (event.key) {
    case "ArrowRight":
    case "j":
      go(index + 1);
      break;
    case "ArrowLeft":
    case "k":
      go(index - 1);
      break;
    case "n":
      event.preventDefault();
      els.note.focus();
      break;
    case "c":
      toggleCompare();
      break;
    default:
      return;
  }
  event.preventDefault();
}

async function fetchState(run) {
  const res = await fetch(run ? `/api/state?${runQuery(run)}` : "/api/state");
  if (!res.ok) throw new Error(`${(await res.text()).trim()} (${res.status})`);
  return res.json();
}

// Load a run in place, starting at its first shot (or the hash's shot on first load).
async function loadRun(run, { wantedFile = null, mode = "push" } = {}) {
  await flush();
  state = await fetchState(run);
  index = 0;
  comparing = false;
  els.runSelect.value = state.run;
  els.saveState.textContent = "";
  renderList();
  markRun();
  if (mode === "push") history.pushState(null, "", pageUrl(state.run));
  else if (mode === "replace") history.replaceState(null, "", pageUrl(state.run));
  if (state.shots.length === 0) {
    els.title.textContent = "This run has no screenshots";
    els.caption.textContent = "";
    els.details.textContent = "";
    els.position.textContent = "";
    els.banner.hidden = true;
    els.image.removeAttribute("src");
    els.note.value = "";
    return;
  }
  if (wantedFile) {
    index = Math.max(
      0,
      state.shots.findIndex((s) => s.file === wantedFile)
    );
  }
  show();
  document.querySelector("main").scrollTop = 0;
}

const requestedRun = () => new URLSearchParams(location.search).get("run");

async function start() {
  const overview = await fetchState();
  runs = overview.runs;
  initialRun = overview.initialRun;
  renderRuns();
  const hash = decodeURIComponent(location.hash.slice(1));
  await loadRun(requestedRun() ?? initialRun, {
    wantedFile: hash || null,
    mode: "replace"
  });
  els.runSelect.addEventListener("change", () => {
    const chosen = els.runSelect.value;
    loadRun(chosen).catch((error) => {
      els.runSelect.value = state.run;
      els.saveState.textContent = `Could not load ${chosen}: ${error.message}`;
    });
  });
  window.addEventListener("popstate", () => {
    loadRun(requestedRun() ?? initialRun, { mode: "none" }).catch((error) => {
      els.title.textContent = `Could not load the run: ${error.message}`;
    });
  });
  els.note.addEventListener("input", onNoteInput);
  els.note.addEventListener("blur", () => flush());
  document.addEventListener("keydown", onKey);
  $("finish").addEventListener("click", finish);
  $("copy").addEventListener("click", copy);
  $("close").addEventListener("click", () => els.done.close());
  window.addEventListener("pagehide", () => flush(true));
}

start().catch((error) => {
  els.title.textContent = `Could not load the run: ${error.message}`;
});
