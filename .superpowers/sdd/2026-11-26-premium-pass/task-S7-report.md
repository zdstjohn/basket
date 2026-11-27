# S7 report
Commit 4e0e35c on premium. Migration 0017_photo_preview.sql (two nullable columns; meals already has a table-level update grant from 0001, so no new grant; 3 pgTAP assertions, plan 219 -> 222). Not applied locally; pgTAP passed in CI.
- fetchGuarded extracted from import-url (fetchRecipePage and fetchPublicBytes are callers; new code not_image). Existing tests unchanged.
- Route /api/meals/preview, makePreview (sharp 0.35.5 pinned exactly), ensurePreviews (3 at once, once per id), bestPhotoUrl, widest ImageObject in JSON-LD, setMealPhoto clears preview/width.
- Signed link reuse (50 min, 3600 s expiry, in-memory by path) built here in lib/db/queries/meals.ts. Family Task 8 must now skip P7.
- ensurePreviews is called via setTimeout(0) after setData / setRows so it sits outside the load's try.
- CI: unit, lint, typecheck, pgTAP and build passed. e2e failed with the identical set of specs as the preceding commit (layout, sheet, week budget); none touch photos.

## Fix round 1
- Route: selects photo_preview and photo_width; returns a stored preview, or 422 for width 0, without fetching. maxDuration = 30. Cap: 60 builds per household per hour, counted in memory per server instance (lib/photos/preview-limit.ts), 429 beyond it. Chosen over the AI spend table, which is for paid calls and would need a migration; per-instance counting is approximate but bounds the work.
- makePreview: width from metadata() (swapped for EXIF 5 to 8), only the 16 px copy is decoded, limitInputPixels 50 MP plus an explicit check, sharp timeout 10 s, SVG refused; every decode failure is a PreviewError.
- Permanent (width 0): blocked_host, bad_url, not_image, too_large, PreviewError. Everything else (timeout, fetch_failed, storage error, failed write) is 503 and stores nothing. The write is filtered on the photo_path and photo_url that were read; no row updated returns 409.
- fetchGuarded now requires a content-type (missing means wrong type, for pages as well as images); fetchPublicBytes refuses image/svg*.
- 0017 edited in place: photo_preview check (null, or data:image/ and <= 4096 chars), photo_width >= 0. rls_test: the vacuous HB-preview assertion moved into B's section, plus two check assertions; plan 247 -> 249. Not run locally (CI runs pgTAP).
- Signed-link cache is browser-only (typeof window). JSON-LD bestImage reads string and QuantitativeValue widths.
- Tests: photo-preview, photo-signed-reuse, jsonld, import-url, new migration-0017 test; each was seen failing first.
