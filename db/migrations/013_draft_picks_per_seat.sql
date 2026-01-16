ALTER TABLE draft
  ADD COLUMN picks_per_seat INT;

-- Backfill existing drafts to preserve prior behavior based on league roster size.
UPDATE draft d
SET picks_per_seat = COALESCE(d.picks_per_seat, l.roster_size)
FROM league l
WHERE d.league_id = l.id;
