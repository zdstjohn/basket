# Post-launch backlog (from the phase-1 final review)

*Launched v0.1.0 on 2026-11-26 (commit 15ede9b). Fixed before launch: 6-digit code sign-in, root redirect, offline cold start, veg-swap failure, honest list total, 16 px inputs, Find my dish time limit, photo bucket limits, neutral User-Agent. Everything below is still open. Items marked for the redesign are folded into the premium-pass plan where they touch the same screens.*

## Important, still open

**I4. Sign-up is open to anyone with the URL, and paid/limited services have no per-user rate limit.** — config tonight, code post-launch
`app/login/LoginForm.tsx:29`, `app/api/estimates/route.ts:10-22`, `app/api/recipes/search/route.ts:11`.
- Any visitor can create an account and a household. Each household gets its own $3 AI cap (which also bounds Brave at about 600 searches). Kroger lookups are not capped at all: 120 items per request, unlimited requests, against a 10,000/day quota shared by everyone. Spoonacular's daily points are shared too.
- The real backstop is the $5/month AI Gateway budget, which the ledger could not verify (403).
- Tonight: confirm the gateway budget in the dashboard and check Brave's plan has a hard limit. Consider switching off new sign-ups in Supabase once both parents are in, and back on when inviting friends.
- Post-launch: a per-household request limit on the three routes, or invite-only sign-up.

**I5. A person who signs in before opening their invite is locked out of the family household.** — instruction tonight, fix post-launch
`supabase/migrations/0001_init.sql:33` (`unique (user_id)`), `:273` (`already_in_household`), `app/onboarding/page.tsx`. A new user who lands on `/week` is sent to onboarding and creates their own household. The invite then says "You're already in a household", and there is no way to leave. Recovery needs manual SQL.
- Tonight: the second parent must open the invite link first, before anything else.
- Later: a "have an invite?" note on onboarding and a leave-household action.

**I6. An AI hiccup blocks adding most meals, and the cap message promises something that doesn't exist.** — post-launch
`lib/ai/recipes.ts:92`, `components/add-meal/api.ts:71`.
- With a vegetarian in the house, every meat or fish recipe makes a swap call. If that call fails (gateway out of credits, as happened today, or a timeout), the whole draft fails, even for Spoonacular recipes whose ingredients are already structured. The UI already has a "no swap yet" state; catch the failure and return `vegSwap: null`.
- The cap message says "You can still type the ingredients in", but there is no way to start a meal by hand; the editor only opens on an AI draft. The plan's constraint says manual entry still works at the cap. Add a "Type it myself" start (blank draft into the existing editor).

**I7. "Fred Meyer price" is the shelf price pro-rated to the recipe amount, so the budget reads low.** — post-launch, tell the users tonight
`lib/list/prices.ts:55-58`, `components/ListRow.tsx:80-86`. Two tablespoons of olive oil shows about 30 cents as a "Fred Meyer price"; the bottle costs several dollars. Package rounding is phase 2 by design, but the label reads as what you will pay, and the weekly total against $200 will be noticeably under the receipt. Until package math lands, say so near the total ("for the amounts you'll use") or label these rows as estimates.


## Minor


- `lib/ui.ts:9`, `components/add-meal/IngredientEditor.tsx:28`: inputs use 15 px text, so iPhone Safari zooms the page on focus (login email, household, price, ZIP). Use 16 px. One-line change; fine to fold into the redesign.
- `lib/ai/estimate.ts:148-181`: Kroger rows are saved only after the AI call. If the AI part throws, the shelf prices just fetched are lost and every Kroger lookup repeats on the next list change. Save shelf rows first.
- `lib/list/offline.ts:86-94`: any non-network failure drops the queued change, including an expired session after a long offline spell. Narrow window; keep the entry on auth errors.
- Functions run in `iad1` (seen in response headers) while the database is in us-west-1. Each page render makes three or more cross-country round trips. Set the Vercel function region to the US west coast.
- No route sets `maxDuration`. Find my dish can take 30 s of model time plus two searches. Fine under Vercel's current defaults; an explicit 60 s is cheap insurance.
- No security headers (no frame-ancestors or CSP). Low risk for this app; add with the redesign.
- `lib/photos/upload.ts:6`: photo orientation relies on `createImageBitmap` honouring EXIF on iPhone. Check one portrait camera photo on the real iPhone.
- `lib/useWeekList.ts:126`: one `list:<weekId>` cache entry is written per week and never pruned.
- Screens read the household (budget, store, category stores) from the server render; a change on the other phone shows only after navigation.


## Deferred minors to do later


- T2 unit display and aliases: float boundary (16 tbsp vs 1 cup), "453 g shows 16 oz", missing aliases (tsps, tbsps, "fl. oz"), zero/negative/NaN contract, thin tests. The alias gap is the one with user effect (an odd unit won't merge or price); do it first.
- T2 vegans not modelled for dairy and eggs: before sharing with a vegan household.
- T4 realtime DELETE events reach other households (ids only) and T7 unfiltered DELETE listener: before friends' households join.
- T4 default privileges still auto-grant new tables: put the `alter default privileges … revoke` in the next migration (the redesign adds one).
- T4 CI nits (guard empty key export, `supabase start -x …`) and T1 action versions on Node 20: CI chores.
- T5 household screen: swallowed members error, person sort collision, delete with no confirm and last-person delete, finish-mode ignores edited name, invited member lands in finish mode, non-atomic count-then-insert, extra count per navigation, budget-update failure after people insert. The redesign rewrites this screen.
- T5 accessibility: per-store labels on "Coming soon", `aria-live` per keystroke, whitespace-only names, borderline sale-tint contrast. T7: tab and radiogroup keyboard semantics, 9 px "Add a photo" text, sheet scroll lock. T9: `role="alert"` with `aria-live="polite"`, thumbnail alt. T11: no contrast check. Do these as one accessibility sweep in the redesign.
- T5 `/login` doesn't redirect signed-in users: after I2.
- T6 cap check-then-spend race, failed or retried Brave calls under-recorded, T10 retry search not counted: bounded to fractions of a cent; fix with I4's rate limit.
- T6 SSRF hardening (`fec0::/10`, `::ffff:0:a.b.c.d`, ports): hardening only; no reachable target on Vercel today.
- T6 JSON-LD `mainEntity` nesting, bad numeric entity returning 500, top-up dedupe by exact URL, estimates re-ask for omitted names, 4000-token ceiling for very large estimate batches, paste triggering a paid photo search, `generateObject` deprecation, no `engines` field.
- T7 add-meal: search request sequencing, duplicate meal after reload on a failed add, "Scaled to 0 servings" flash, signed photo links expiring after an hour, removing the last ingredient, errors persisting across tabs, `times_planned` read-then-write, non-transactional `copyWeek`, Repeat with an empty source, no DB CHECK on day/slot.
- T8 list: `requested` marks after partial answers, second realtime channel from `/week`, focus return, "Under $15" flash, tab totals including outside-budget items, no week rollover while open, endless skeleton on a first offline load, shared `refused` flag, sign-out stall on a hung network, timeouts counted as refusals.
- T9 Kroger: unpriceable AI rows re-offered every session, string date compare, old store's prices kept up to 24 h after a store change, no overall deadline, one log line per failing item.
- T10 Find my dish: stale photo on tab switch mid-lookup, inert checkbox with a custom photo, `getElementById`, no body size limit before auth (Vercel caps bodies at 4.5 MB anyway), three-word retry can't broaden.
- T11: vacuous pinned-control check, service worker untested in WebKit, safe areas not emulated (tonight's real-iPhone check is the test), trim not in `waitUntil`, eviction order.

