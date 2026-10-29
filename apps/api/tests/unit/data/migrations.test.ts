import { describe, expect, it } from "vitest";
import {
  assertMigrationsCurrent,
  getMigrationStatus,
  MigrationsBehindError
} from "../../../src/data/migrations.js";

const files = ["001_a.sql", "002_b.sql", "003_c.sql"];
const poolWith = (rows: string[]) =>
  ({
    query: async () => ({ rows: rows.map((filename) => ({ filename })) })
  }) as never;

describe("migration status", () => {
  it("reports current when every file is applied", async () => {
    const expected = { applied: "003_c.sql", expected: "003_c.sql", pending: [] };
    expect(await getMigrationStatus(poolWith(files), files)).toEqual(expected);
    expect(await assertMigrationsCurrent(poolWith(files), files)).toEqual(expected);
  });

  it("throws when behind", async () => {
    await expect(
      assertMigrationsCurrent(poolWith(["001_a.sql"]), files)
    ).rejects.toBeInstanceOf(MigrationsBehindError);
  });

  it("treats a missing migration_history table as nothing applied", async () => {
    const pool = {
      query: async () => {
        throw Object.assign(new Error("no table"), { code: "42P01" });
      }
    } as never;
    const status = await getMigrationStatus(pool, files);
    expect(status.applied).toBeNull();
    expect(status.pending).toEqual(files);
  });

  it("rethrows other database errors", async () => {
    const pool = {
      query: async () => {
        throw new Error("boom");
      }
    } as never;
    await expect(getMigrationStatus(pool, files)).rejects.toThrow("boom");
  });
});
