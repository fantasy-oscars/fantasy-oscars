import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DRAFT_ROOM_PREFERENCES,
  draftRoomPreferencesKey,
  parseDraftRoomPreferences,
  serializeDraftRoomPreferences,
  type DraftRoomPreferences
} from "@/decisions/draft/preferences";
import {
  loadDraftRoomPreferences,
  saveDraftRoomPreferences,
  type PreferenceStorage
} from "@/orchestration/draft/draftRoomPreferences";

function memoryStorage(): PreferenceStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v)
  };
}

const custom: DraftRoomPreferences = {
  poolMode: "UNDRAFTED_ONLY",
  soundEnabled: false,
  cursorSpyEnabled: false,
  rails: { ledger: false, roster: true, autodraft: null }
};

describe("draft room preferences", () => {
  it("round-trips through serialization", () => {
    expect(parseDraftRoomPreferences(serializeDraftRoomPreferences(custom))).toEqual(
      custom
    );
  });

  it("falls back to defaults for missing, malformed or wrongly typed data", () => {
    expect(parseDraftRoomPreferences(null)).toEqual(DEFAULT_DRAFT_ROOM_PREFERENCES);
    expect(parseDraftRoomPreferences("{nope")).toEqual(DEFAULT_DRAFT_ROOM_PREFERENCES);
    expect(parseDraftRoomPreferences("42")).toEqual(DEFAULT_DRAFT_ROOM_PREFERENCES);
    expect(
      parseDraftRoomPreferences(
        JSON.stringify({ poolMode: "bogus", soundEnabled: "yes", rails: "x" })
      )
    ).toEqual(DEFAULT_DRAFT_ROOM_PREFERENCES);
  });

  it("keeps preferences per user", () => {
    const storage = memoryStorage();
    saveDraftRoomPreferences(1, custom, storage);
    expect(loadDraftRoomPreferences(1, storage)).toEqual(custom);
    expect(loadDraftRoomPreferences(2, storage)).toEqual(DEFAULT_DRAFT_ROOM_PREFERENCES);
    expect(storage.data.has(draftRoomPreferencesKey(1))).toBe(true);
  });

  it("survives a reload (a fresh read of the same storage)", () => {
    const storage = memoryStorage();
    saveDraftRoomPreferences("42", custom, storage);
    // "Reload": nothing but the storage carries over.
    expect(loadDraftRoomPreferences("42", storage)).toEqual(custom);
  });

  it("does not throw when storage reads or writes fail", () => {
    const broken: PreferenceStorage = {
      getItem: vi.fn(() => {
        throw new Error("denied");
      }),
      setItem: vi.fn(() => {
        throw new Error("quota");
      })
    };
    expect(loadDraftRoomPreferences(1, broken)).toEqual(DEFAULT_DRAFT_ROOM_PREFERENCES);
    expect(() => saveDraftRoomPreferences(1, custom, broken)).not.toThrow();
  });

  it("copes with no storage at all", () => {
    expect(loadDraftRoomPreferences(1, null)).toEqual(DEFAULT_DRAFT_ROOM_PREFERENCES);
    expect(() => saveDraftRoomPreferences(1, custom, null)).not.toThrow();
  });

  it("only stores presentation fields", () => {
    expect(Object.keys(DEFAULT_DRAFT_ROOM_PREFERENCES).sort()).toEqual([
      "cursorSpyEnabled",
      "poolMode",
      "rails",
      "soundEnabled"
    ]);
  });
});
