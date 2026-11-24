// Tour inspector page: one shot at a time, a debounced note per shot, compare with the
// previous run, Finish. All text goes in through textContent.
const SAVE_DELAY_MS = 600;
const $ = (id) => document.getElementById(id);
const els = {
  run: $("run"),
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
let pending = null; // { file, text } waiting to be saved
let timer = null;
const rows = new Map(); // shot file -> list button

const imageUrl = (which, file) => `/img/${which}/${encodeURIComponent(file)}`;
const numberOf = (shot) => /^(\d+)-/.exec(shot.file)?.[1] ?? shot.file;
const hasNote = (file) => (state.notes[file] ?? "").trim() !== "";

async function putNote(file, text, keepalive = false) {
  const res = await fetch("/api/note", {
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
  const { file, text } = pending;
  pending = null;
  try {
    await putNote(file, text, keepalive);
    if (!pending) els.saveState.textContent = "Saved";
  } catch (error) {
    els.saveState.textContent = String(error.message);
  }
}

function onNoteInput() {
  const shot = state.shots[index];
  state.notes[shot.file] = els.note.value;
  pending = { file: shot.file, text: els.note.value };
  els.saveState.textContent = "Saving…";
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY_MS);
  markRow(shot.file);
}

function markRow(file) {
  const row = rows.get(file);
  if (row) row.querySelector(".mark").textContent = hasNote(file) ? "●" : "";
}

function renderList() {
  els.list.replaceChildren();
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
  history.replaceState(null, "", `#${encodeURIComponent(shot.file)}`);
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
  const res = await fetch("/api/finish", {
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

async function start() {
  state = await (await fetch("/api/state")).json();
  els.run.textContent = `Tour ${state.run}`;
  if (state.shots.length === 0) {
    els.title.textContent = "This run has no screenshots";
    return;
  }
  const wanted = decodeURIComponent(location.hash.slice(1));
  index = Math.max(
    0,
    state.shots.findIndex((s) => s.file === wanted)
  );
  renderList();
  show();
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
