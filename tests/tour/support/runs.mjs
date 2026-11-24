// Pure decisions for tour runs: naming, pruning, previous-run matching and the notes
// export. No file or network access, so the tour, the gallery and the inspector share
// it and the unit tests in tests/unit/tooling cover it.

/** @typedef {{ file: string, section?: string, title: string, caption?: string, persona: string, path: string, day: number }} TourShot */

const RUN_NAME = /^(\d{4})-(\d{2})-(\d{2})-(\d{4})(?:-(\d+))?$/;
const pad = (n) => String(n).padStart(2, "0");

/** The run directory name for a moment, in local time: YYYY-MM-DD-HHmm. */
export function runStamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** The stamp, with a -2, -3, ... suffix when a run of that minute already exists. */
export function uniqueRunName(stamp, existing) {
  const taken = new Set(existing);
  if (!taken.has(stamp)) return stamp;
  let n = 2;
  while (taken.has(`${stamp}-${n}`)) n += 1;
  return `${stamp}-${n}`;
}

export function isRunName(name) {
  return RUN_NAME.test(name);
}

/** Run names, oldest first. Anything that is not a run directory is ignored. */
export function sortRuns(names) {
  const key = (name) => {
    const m = RUN_NAME.exec(name);
    return `${m[1]}${m[2]}${m[3]}${m[4]}${String(m[5] ?? 1).padStart(4, "0")}`;
  };
  return names.filter(isRunName).sort((a, b) => key(a).localeCompare(key(b)));
}

/** True when any shot has a note with text in it. */
export function hasNotes(notes) {
  return Object.values(notes ?? {}).some((text) => String(text).trim() !== "");
}

/**
 * Which runs to keep and which to delete: the newest `keep` runs, plus any run that has
 * notes, however old. `noted` is the names of runs that have notes.
 */
export function pruneChoice(names, noted = [], keep = 3) {
  const runs = sortRuns(names);
  const withNotes = new Set(noted);
  const newest = new Set(runs.slice(Math.max(0, runs.length - keep)));
  return {
    keep: runs.filter((r) => newest.has(r) || withNotes.has(r)),
    remove: runs.filter((r) => !newest.has(r) && !withNotes.has(r))
  };
}

/** The run before `current` in time order, or null. */
export function previousRun(names, current) {
  const runs = sortRuns(names);
  const i = runs.indexOf(current);
  return i > 0 ? runs[i - 1] : null;
}

/** A shot's identity across runs: its file name without the number prefix. */
export function shotKey(file) {
  return file.replace(/^\d+-/, "");
}

/**
 * Pairs each current shot with the same shot in the previous run, by file name minus the
 * number prefix, since numbers shift when steps are added. When a name repeats, the
 * nth occurrence pairs with the nth occurrence. Returns current file -> previous file;
 * unmatched shots are absent.
 */
export function matchPreviousShots(current, previous) {
  const pool = new Map();
  for (const s of previous) {
    const key = shotKey(s.file);
    pool.set(key, [...(pool.get(key) ?? []), s.file]);
  }
  const seen = new Map();
  const matches = new Map();
  for (const s of current) {
    const key = shotKey(s.file);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const match = pool.get(key)?.[n];
    if (match) matches.set(s.file, match);
  }
  return matches;
}

/**
 * The notes as Markdown, one entry per noted shot in tour order:
 * `### <number> · <title>`, then path, persona, day and the note.
 * `notes` is keyed by shot file; blank notes are left out.
 */
export function notesToMarkdown(shots, notes, run) {
  const entries = shots
    .map((s) => ({ shot: s, note: String(notes?.[s.file] ?? "").trim() }))
    .filter((e) => e.note !== "")
    .map(({ shot, note }) => {
      const number = /^(\d+)-/.exec(shot.file)?.[1] ?? shot.file;
      return [
        `### ${number} · ${shot.title}`,
        "",
        `- Path: \`${shot.path}\``,
        `- Persona: ${shot.persona}`,
        `- Day: ${shot.day}`,
        "",
        note
      ].join("\n");
    });
  const heading = run ? `# Tour notes · ${run}` : "# Tour notes";
  if (entries.length === 0) return `${heading}\n\nNo notes.\n`;
  return `${heading}\n\n${entries.join("\n\n")}\n`;
}
