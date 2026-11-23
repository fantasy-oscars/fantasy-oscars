import type { Pool } from "pg";
import { vi } from "vitest";

/**
 * A simulated clock for a whole test database. It moves two clocks together:
 *
 * - JavaScript: `Date` is faked (timers stay real), so every service default
 *   of `now = new Date()`, token expiry and route handler sees the simulated
 *   instant.
 * - Postgres: a BEFORE INSERT OR UPDATE trigger on every `circuit_*` table
 *   replaces a timestamp equal to `now()` (the database stamped it, by a
 *   column default or an explicit `now()`) with the simulated instant, so
 *   transactions, ownership intervals, draft and waiver rows are dated in the
 *   simulation. Timestamps passed in from JavaScript are left alone.
 *
 * Install it once per test database; the triggers stay for the container's
 * life and do nothing while the clock is unset.
 */
export async function installSimulatedClock(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS simulated_clock (at timestamptz);
    DO $install$
    DECLARE
      t record;
    BEGIN
      FOR t IN
        SELECT c.table_name,
               string_agg(
                 format('IF NEW.%1$I = now() THEN NEW.%1$I := simulated; END IF;',
                        c.column_name),
                 ' ') AS restamp
        FROM information_schema.columns c
        JOIN information_schema.tables tb
          ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND tb.table_type = 'BASE TABLE'
          AND c.table_name LIKE 'circuit\\_%'
          AND c.data_type = 'timestamp with time zone'
        GROUP BY c.table_name
      LOOP
        EXECUTE format(
          $fn$CREATE OR REPLACE FUNCTION simulated_clock_%1$s() RETURNS trigger
              LANGUAGE plpgsql AS $body$
              DECLARE simulated timestamptz := (SELECT at FROM simulated_clock LIMIT 1);
              BEGIN
                IF simulated IS NOT NULL THEN %2$s END IF;
                RETURN NEW;
              END $body$$fn$,
          t.table_name, t.restamp);
        EXECUTE format(
          'CREATE OR REPLACE TRIGGER zz_simulated_clock BEFORE INSERT OR UPDATE ON %1$I
           FOR EACH ROW EXECUTE FUNCTION simulated_clock_%1$s()',
          t.table_name);
      END LOOP;
    END $install$;
  `);
  vi.useFakeTimers({ toFake: ["Date"] });

  let current = new Date();
  const set = async (instant: Date) => {
    if (instant.getTime() < current.getTime()) {
      throw new Error("The simulated clock only moves forward");
    }
    current = new Date(instant.getTime());
    vi.setSystemTime(current);
    await pool.query(`DELETE FROM simulated_clock`);
    await pool.query(`INSERT INTO simulated_clock (at) VALUES ($1)`, [current]);
  };
  return {
    now: () => new Date(current.getTime()),
    set,
    advance: (ms: number) => set(new Date(current.getTime() + ms)),
    /** Restores the real `Date` and leaves the database clock unset. */
    async restore() {
      vi.useRealTimers();
      await pool.query(`DELETE FROM simulated_clock`);
    }
  };
}
