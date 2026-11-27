-- A tiny blurred preview and the source width of each meal's photo, filled in by /api/meals/preview.
-- photo_width = 0 means the photo is permanently unreadable (blocked, not an image, too large, undecodable), so it is not asked for again.
-- meals already grants select/insert/update/delete to authenticated at table level (0001), which covers these columns.
alter table public.meals
  add column if not exists photo_preview text,
  add column if not exists photo_width integer;

alter table public.meals
  drop constraint if exists meals_photo_preview_check,
  drop constraint if exists meals_photo_width_check,
  add constraint meals_photo_preview_check
    check (photo_preview is null or (photo_preview like 'data:image/%' and length(photo_preview) <= 4096)),
  add constraint meals_photo_width_check
    check (photo_width is null or photo_width >= 0);
