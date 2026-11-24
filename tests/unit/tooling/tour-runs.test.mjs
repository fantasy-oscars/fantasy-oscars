import assert from "node:assert";
import test from "node:test";
import {
  hasNotes,
  matchPreviousShots,
  notesToMarkdown,
  pruneChoice,
  previousRun,
  runStamp,
  shotKey,
  sortRuns,
  uniqueRunName
} from "../../tour/support/runs.mjs";

test("runStamp is the local date and time to the minute, zero-padded", () => {
  assert.strictEqual(runStamp(new Date(2026, 0, 5, 9, 7)), "2026-01-05-0907");
  assert.strictEqual(runStamp(new Date(2026, 10, 24, 23, 59, 59)), "2026-11-24-2359");
});

test("uniqueRunName suffixes a run that starts in an occupied minute", () => {
  assert.strictEqual(uniqueRunName("2026-11-24-1030", []), "2026-11-24-1030");
  assert.strictEqual(
    uniqueRunName("2026-11-24-1030", ["2026-11-24-1030"]),
    "2026-11-24-1030-2"
  );
  assert.strictEqual(
    uniqueRunName("2026-11-24-1030", ["2026-11-24-1030", "2026-11-24-1030-2"]),
    "2026-11-24-1030-3"
  );
});

test("sortRuns orders oldest first, suffixed runs after their base, and drops non-runs", () => {
  assert.deepStrictEqual(
    sortRuns([
      "latest",
      "2026-11-24-1030-2",
      "2026-11-24-1100",
      ".gitignore",
      "2026-11-24-1030",
      "2026-11-24-1030-10",
      "2026-11-23-2359"
    ]),
    [
      "2026-11-23-2359",
      "2026-11-24-1030",
      "2026-11-24-1030-2",
      "2026-11-24-1030-10",
      "2026-11-24-1100"
    ]
  );
});

test("pruneChoice keeps the newest three and removes older runs", () => {
  const runs = [
    "2026-11-21-1000",
    "2026-11-22-1000",
    "2026-11-23-1000",
    "2026-11-24-1000"
  ];
  assert.deepStrictEqual(pruneChoice(runs), {
    keep: ["2026-11-22-1000", "2026-11-23-1000", "2026-11-24-1000"],
    remove: ["2026-11-21-1000"]
  });
});

test("pruneChoice keeps the newest three plus an older run that has notes", () => {
  const runs = [
    "2026-11-24-1000",
    "2026-11-21-1000",
    "2026-11-23-1000",
    "2026-11-22-1000",
    "2026-11-20-1000"
  ];
  assert.deepStrictEqual(pruneChoice(runs, ["2026-11-20-1000"]), {
    keep: ["2026-11-20-1000", "2026-11-22-1000", "2026-11-23-1000", "2026-11-24-1000"],
    remove: ["2026-11-21-1000"]
  });
});

test("pruneChoice removes nothing when there are three or fewer runs, and ignores non-runs", () => {
  assert.deepStrictEqual(pruneChoice(["latest", "2026-11-24-1000"]), {
    keep: ["2026-11-24-1000"],
    remove: []
  });
  assert.deepStrictEqual(pruneChoice([]), { keep: [], remove: [] });
});

test("previousRun is the run just before the given one", () => {
  const runs = ["2026-11-23-1000", "2026-11-21-1000", "2026-11-24-1000"];
  assert.strictEqual(previousRun(runs, "2026-11-24-1000"), "2026-11-23-1000");
  assert.strictEqual(previousRun(runs, "2026-11-21-1000"), null);
  assert.strictEqual(previousRun(runs, "missing"), null);
});

test("shotKey drops the number prefix only", () => {
  assert.strictEqual(shotKey("089-draft-room-live.png"), "draft-room-live.png");
  assert.strictEqual(shotKey("12-2026-recap.png"), "2026-recap.png");
});

test("matchPreviousShots pairs by file name minus number, across shifted numbers", () => {
  const current = [
    { file: "001-home.png" },
    { file: "002-new-step.png" },
    { file: "003-draft-room.png" }
  ];
  const previous = [{ file: "001-home.png" }, { file: "002-draft-room.png" }];
  const matches = matchPreviousShots(current, previous);
  assert.strictEqual(matches.get("001-home.png"), "001-home.png");
  assert.strictEqual(matches.get("003-draft-room.png"), "002-draft-room.png");
  assert.strictEqual(matches.has("002-new-step.png"), false);
});

test("matchPreviousShots pairs repeated names in order", () => {
  const matches = matchPreviousShots(
    [
      { file: "004-results.png" },
      { file: "009-results.png" },
      { file: "011-results.png" }
    ],
    [{ file: "003-results.png" }, { file: "007-results.png" }]
  );
  assert.strictEqual(matches.get("004-results.png"), "003-results.png");
  assert.strictEqual(matches.get("009-results.png"), "007-results.png");
  assert.strictEqual(matches.has("011-results.png"), false);
});

const shots = [
  { file: "001-home.png", title: "Home", persona: "ada", path: "/", day: 1 },
  {
    file: "002-draft-room.png",
    title: "Draft room",
    persona: "ben",
    path: "/drafts/7?tab=picks",
    day: 3
  },
  { file: "010-recap.png", title: "Recap", persona: "ada", path: "/recap", day: 9 }
];

test("notesToMarkdown writes noted shots in tour order, whatever the note order", () => {
  const md = notesToMarkdown(
    shots,
    {
      "010-recap.png": "Totals look off.",
      "002-draft-room.png": "  Timer hides the list.\n"
    },
    "2026-11-24-1000"
  );
  assert.strictEqual(
    md,
    [
      "# Tour notes · 2026-11-24-1000",
      "",
      "### 002 · Draft room",
      "",
      "- Path: `/drafts/7?tab=picks`",
      "- Persona: ben",
      "- Day: 3",
      "",
      "Timer hides the list.",
      "",
      "### 010 · Recap",
      "",
      "- Path: `/recap`",
      "- Persona: ada",
      "- Day: 9",
      "",
      "Totals look off.",
      ""
    ].join("\n")
  );
});

test("notesToMarkdown skips blank notes and notes for shots no longer in the run", () => {
  const md = notesToMarkdown(shots, {
    "001-home.png": "   ",
    "099-gone.png": "orphan"
  });
  assert.strictEqual(md, "# Tour notes\n\nNo notes.\n");
});

test("hasNotes is true only for a note with text", () => {
  assert.strictEqual(hasNotes({}), false);
  assert.strictEqual(hasNotes(undefined), false);
  assert.strictEqual(hasNotes({ "001-home.png": "  " }), false);
  assert.strictEqual(hasNotes({ "001-home.png": "x" }), true);
});
