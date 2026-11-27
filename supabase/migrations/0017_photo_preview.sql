-- A tiny blurred preview and the source width of each meal's photo, filled in by /api/meals/preview.
-- photo_width = 0 means the photo could not be read, so it is not asked for again.
-- meals already grants select/insert/update/delete to authenticated at table level (0001), which covers these columns.
alter table public.meals
  add column if not exists photo_preview text,
  add column if not exists photo_width integer;
