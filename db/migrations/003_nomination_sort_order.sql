-- Add sortable ordering for nominations within a category.
-- This supports admin reordering without changing nomination identity.

ALTER TABLE public.nomination
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill: preserve existing order by assigning sort_order per category by id.
WITH ranked AS (
  SELECT
    n.id,
    row_number() OVER (PARTITION BY n.category_edition_id ORDER BY n.id ASC) - 1 AS rn
  FROM public.nomination n
)
UPDATE public.nomination n
SET sort_order = r.rn
FROM ranked r
WHERE n.id = r.id;

