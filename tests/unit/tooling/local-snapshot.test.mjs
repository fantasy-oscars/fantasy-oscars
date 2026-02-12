import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { defaultIssuesSnapshotPath } from "../../../.github/scripts/lib/local-snapshot.mjs";

test("defaultIssuesSnapshotPath uses .dev/github-issues and a safe filename", () => {
  const out = defaultIssuesSnapshotPath("owner/repo");
  assert.equal(out, path.join(".dev", "github-issues", "owner_repo.json"));
});
