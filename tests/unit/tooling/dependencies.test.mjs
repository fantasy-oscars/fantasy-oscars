import test from "node:test";
import assert from "node:assert/strict";

import { extractDependsOn } from "../../../.github/scripts/lib/dependencies.mjs";

test("extractDependsOn returns [] when section missing", () => {
  assert.deepEqual(extractDependsOn("Hello"), []);
});

test("extractDependsOn extracts issue numbers from a Depends On section", () => {
  const body = `
Intro

## Depends On
- #9
- blocks #10 (typo)
- owner/repo#11 (ignored)

## Notes
Also mentions #99 but not in section
`;
  assert.deepEqual(extractDependsOn(body), [9, 10]);
});
