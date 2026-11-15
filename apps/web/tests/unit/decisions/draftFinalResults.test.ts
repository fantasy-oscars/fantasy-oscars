import { describe, expect, it } from "vitest";
import { isFinalResults } from "@/decisions/draft/finalResults";

describe("isFinalResults", () => {
  it.each(["COMPLETE", "ARCHIVED"])("is final for a completed draft and %s", (c) => {
    expect(isFinalResults({ draftStatus: "COMPLETED", ceremonyStatus: c })).toBe(true);
  });

  it.each(["LOCKED", "PUBLISHED", "DRAFT", null, undefined, "BOGUS"])(
    "is not final for a completed draft and ceremony %s",
    (c) => {
      expect(isFinalResults({ draftStatus: "COMPLETED", ceremonyStatus: c })).toBe(false);
    }
  );

  it.each(["IN_PROGRESS", "PAUSED", "PENDING", null, undefined])(
    "is never final for draft %s, even when archived",
    (d) => {
      expect(isFinalResults({ draftStatus: d, ceremonyStatus: "ARCHIVED" })).toBe(false);
    }
  );
});
