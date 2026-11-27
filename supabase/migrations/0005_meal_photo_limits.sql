-- Meal photos are always resized and re-encoded to JPEG in the browser (lib/photos/upload.ts),
-- and stay well under 1 MB. Cap the bucket so nothing else can be stored there.
-- (Find my dish "use my photo" sends the image to the API only; it is never stored.)
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg']
 where id = 'meal-photos';
