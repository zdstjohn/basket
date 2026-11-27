# Pre-flight: Fred Meyer products and cart plan

Checked 2026-11-26 against `plan-fred-meyer-cart.md`, `spec-fred-meyer-cart.md`, base design §6/§8/§9, and the code at `/home/claude/basket` on branch `ratings` (cc255e7). Read-only; nothing in the repo was changed and `.env.local` was not opened.

**Verdict:** the plan is sound in shape (server cache + pure package math, pending-before-send, sealed per-person tokens). It is not ready to dispatch as written: 4 findings would break the build/tests or defeat the double-send guarantee, and 12 more should be ruled before the task they touch starts.

**Counts:** Blocking 4 · Important 12 · Minor 18.

**State of the repo to know first:** the working tree is on `ratings` with uncommitted edits to `components/add-meal/SearchTab.tsx` and `e2e/week.spec.ts`. The plan must branch only after those are committed and `ratings` is merged.

---

## 1. Task pairs that share a file or an interface

| Pair | One produces | The other consumes | Result |
|---|---|---|---|
| 1 ↔ 3 | `week_item_state` (unique `week_id,item_key`), `rls_test.sql` with `plan(N)` | 0007 rewrite; a pgTAP check "in the test file" | **Conflict (M18):** Task 3 edits `rls_test.sql` and must raise `plan()` again, but the file is not in Task 3's Files. `on conflict (week_id, item_key)` matches the real constraint. |
| 1 ↔ 4 | `kroger_spend(h, n)` with `n between 0 and 60`; `kroger_matches`, `price_observations` | `getMatches` calls `kroger_spend(householdId, n)` once for all not-fresh foods; `estimate.ts` passes up to 120 names | **Conflict (I1):** `/api/estimates` accepts 120 items (`EstimatesBodySchema`), so `n` can be 61–120 → `bad_count` → 500. |
| 1 ↔ 4 | `fetched_at default now()`, members may update the row | "Saved rows set `fetched_at` to now" from server code | OK for the cap (the cap lives in `kroger_calls`, not writable). Differs from spec §7 "stamped by the database" (M7). |
| 1 ↔ 5 | `week_item_state.pack_count`, realtime on `kroger_matches`, `item_product_choice` | `ItemState.pack_count`, realtime table list | OK. |
| 1 ↔ 6 | `item_product_choice` with delete grant | `setChoice` upsert, `clearChoice` delete | OK. |
| 1 ↔ 7 | `kroger_links(user_id pk, sealed, profile_id, updated_at)`, no trigger | `update … where updated_at = <read>` | OK only if the code sets `updated_at` on every write (I4). |
| 1 ↔ 8 | `cart_sends`, update grant `(status, items, total_cents)`, no uniqueness | check for earlier sends, then insert `pending` | **Conflict (B2):** nothing makes check-then-insert atomic. |
| 1 ↔ 9 | `households.fulfillment` + column grant | `HouseholdPatch.fulfillment` | OK. |
| 1 ↔ 10 | 0006 applied to production in Task 1 step 3 | release | Order risk (I12): schema rulings below must be folded into 0006 before it is applied. |
| 2 ↔ 3 | `isVague` in `units.ts` | `formatNeed`, part order | OK (both edit `units.ts`, in sequence). |
| 2 ↔ 4 | `Candidate`, `poolOf`, `perBase`, `parseSize` | `toCandidates`, `priceFor` rewritten on `perBase` | Interface OK. Tests conflict (B3). |
| 2 ↔ 5 | `recommend(canonical, parts, candidates, {chosenUpc, count})` | `buildList` products and `estimateCents` | OK. Default densities flow straight into totals (I2). |
| 2 ↔ 6, 2 ↔ 9 | `Recommendation`, `Offer` | `SwapSheet`, `reviewLines` | OK. |
| 3 ↔ 5 | `ListItem.parts`, `key = food`, `foldItemState` | product rows, `pack_count` carried from the food-keyed row | OK. Task 3's merged `estimateCents` rule is replaced in product mode by Task 5; fine. |
| 3 ↔ 10 | 0007 deletes `food#kind` rows | "apply right after the deploy" | Risk (I7). |
| 4 ↔ 5 | `MatchRow`, `MATCH_MAX_AGE_MS` exported from `lib/kroger/matches.ts` (server-only) | imported by `lib/useWeekList.ts` ("use client") and by browser-safe `lib/db/queries/kroger.ts` | **Conflict (B4):** a value import from a `server-only` module into client code fails the build. |
| 4 ↔ 5 | `requestMatches` → `{ matches, limited }` | `stalePrices` needs to know a lookup failed | **Conflict (M1):** `failed` is returned by the route and dropped by the client. |
| 4 ↔ 5 | `listMatches(sb, householdId, locationId)` = every row | cached inside `ListInputs` in localStorage | Risk (I6): unbounded growth. |
| 4 ↔ 6 | `requestMatches`, `search_term` freshness rule | `searchWith`, `resetChoice` | OK. |
| 4 ↔ 8 | `kroger_matches` cache (member-writable) | UPC, name and price for the cart "come from that cache" | Works; trust note (I8). |
| 4, 7, 8 | all extend `lib/kroger/fake.ts` | — | OK in sequence. |
| 5 ↔ 6 | `products`, `setPackCount` | `chooseProduct` re-picks | **Conflict (I3):** `pack_count` is not cleared on a swap. |
| 5 ↔ 9, 6 ↔ 9 | hook additions, `SwapSheet` | review screen | OK. |
| 7 ↔ 8 | `getUserAccess` (may throw on network/5xx; deletes the row on `refused`) | cart route steps 3 and 8 | Gaps (I4, I5, M11). |
| 7 ↔ 9 | `?fm=` notices defined for Household only | review screen shows `Fred Meyer is connected.` in e2e step 1 | Gap (M5). |
| 8 ↔ 9 | route refuses when "any line's UPC has a sent quantity above 0" and `resend` is false | review sends `toSend`, which includes increases of already-sent UPCs | **Conflict (B1).** |
| 3, 5, 6, 9 ↔ `ratings` | `key = food`; new rows above the list | `keysToCheck` / `updateMany` use `item.key`; Undo keeps keys in memory only | OK. Check-off-all works unchanged with food keys. |

---

## 2. Each task against itself, the Global Constraints, the code and `ratings`

| Task | Finding |
|---|---|
| 1 | Self-consistent. `weeks (id, household_id)` unique exists; `is_member` exists; `plan(96)` is current. Missing: size limits on `kroger_links.sealed` and `kroger_matches.candidates` (M8). Applies to production before any review (I12). |
| 2 | Tests agree with the rule table (I worked each `packagesNeeded` row by hand). Gaps: container units are listed singular, but `quantityOrCount` keeps `bottles`, `bags`, `boxes` plural (M6); `perBase('eggs','mass')` pins an egg at 150 g (M6); defaults of 1 g/ml and 150 g over-count light or small foods (I2). |
| 3 | The "user price alone" rule has no test, and the domain's `estimateFor(canonical, qty, store)` returns a number only, so it cannot tell a typed price from a guess (M3). Changed key assertions (`tests/unit/list.test.ts` lines 42, 50, 103–119; `e2e/list.spec.ts:238` `milk#volume`) are not in the Global Constraints' list of allowed changes (M2). Writes to the new key send only the patch, while "the food-keyed row wins whole", so other flags on old-key rows are dropped (I7). With `ratings`: OK. The total label "Estimated total, for the amounts you'll use" stays true here (no store = pro-rated). |
| 4 | **Contradicts itself (B3).** "Add `upc` equal to `productId`" gives `"1"`, `"2"`, `"3"`, `"10"`, `"11"` in the black-beans and eggs fixtures; `toCandidates` skips anything that is not 13 digits, so both fixtures yield nothing. "Existing cases still pass" is false for at least four `kroger-products.test.ts` cases: `filter.limit` `'10'` (plan says 20); the gallon in the milk fixture is the second item ("first priced item" picks the half gallon); "returns null when nothing matches the item kind" (density now converts); the inline `productId: '1'` rice case. Also I1 (60 vs 120) and B4 (where the shared types live). |
| 5 | Files list is enough (the price rule can be applied in `buildList` without touching `lib/domain/list.ts`). `WeekScreen` also mounts `useWeekList`, so the Week meter follows the same number; good. Label: product mode `This week's total`, otherwise the existing sentence; no test pins the old copy, and both are accurate. Risks: I6 (cache size), M1. Must keep `updateMany` in the hook's return. |
| 6 | Self-consistent. `pack_count` survives a swap (I3). Costco search URL is not verified anywhere (M15). Row gets a third control at 360 px; the layout test covers it. |
| 7 | `lib/kroger/http.ts` is listed as modified with no stated change (M4). `state` generation is not specified; `timingSafeEqual` throws on unequal lengths; deleting the cookie needs the same `path`; `<next>?fm=` breaks if `next` already has a query (M4). Refresh race and row deletion (I4, I5). |
| 8 | B1, B2. A throw from the forced refresh in step 8 leaves the row `pending` although a 401 means nothing was added (M11). 409 carries three meanings (`no_store`, `not_connected`, `already_sent`); `sendCart` must read the body's code, not the status. No `isCartConfigured()` check (I5). No origin check (I9). |
| 9 | No copy for `already_sent` or for the `fm` notices on this screen (M5). "I have it" on a line merged from two foods marks only the first (M16). Ticked ("got it") items are still sent; undecided (M17). e2e step 10 (`dblclick`) passes on the button's disabled state and does not test the server (B2). |
| 10 | 0007 timing (I7). The log check will find `code=` in the callback's request URL in Vercel's request log; that code is spent and bound to the verifier (M10). No Costco link check (M15). By-the-pound check should come before real use (M12). |

---

## 3. Security review of Tasks 7–8 as written

| Area | As written | Assessment |
|---|---|---|
| PKCE | 32 random bytes, S256, verifier kept in a sealed httpOnly cookie, sent only at the token call | Good. |
| State | In the same sealed cookie with `uid` and `next`; compared on return; cookie always deleted | Good design; it stops an attacker linking their Fred Meyer account to a victim. Specify `state` = 32 random bytes base64url and compare lengths before `timingSafeEqual` (M4). |
| Cookie | `httpOnly`, `sameSite: lax`, `secure` on https, `path: /api/kroger`, 10 min | Good. Narrow the path to `/api/kroger/callback`. |
| Redirect | URI only from `KROGER_REDIRECT_URI`; `next` through `safeNext` | Good. |
| Sealing | AES-256-GCM, random 12-byte IV, `v1.` prefix, AAD = user id (row) or `'oauth'` (cookie), 32-byte key check | Good. One key serves both uses; the AAD keeps them apart. |
| Key handling | Production-only env var; a failed `unseal` deletes the row | **I5:** with the key missing or wrong (a Preview deployment on the same database, a typo on rotation) a direct call to the cart route deletes a good production link. |
| RLS, `kroger_links` | all four verbs `user_id = auth.uid()`; not in realtime | Good. Owner can read their own sealed text (accepted in the spec). Add a length check (M8). |
| RLS, `cart_sends` | members read; only the sender inserts and updates `status, items, total_cents`; no delete | Good. A member can insert rows through the data API directly; effect is limited to their own household's "already sent" view. |
| Logging | fixed lines only; tests spy on `console.*` | Good. Make token-call errors `kroger token <status>` with no body. |
| Repeat send | check, then insert `pending`, then call | **B2:** not atomic. **B1:** the rule also blocks legitimate increases. |
| CSRF | none stated | **I9:** relies on Supabase's default `SameSite=Lax` cookie alone; `readJson` parses any content type. |
| Refresh failure | `refused` → delete row → "Connect Fred Meyer again"; network/5xx → throw | **I4:** a second concurrent refresh that is refused deletes the tokens the first one just saved. Throw in step 8 mislabels the outcome (M11). |
| Product trust | UPC, name and price read from `kroger_matches`, which members can write | **I8:** validate on read. |

---

## 4. Money and volume

| Item | Finding |
|---|---|
| Product lookups | One search per food per 24 h per household, shared by both phones. A normal week is about 60–80 calls a day; 400 is ample. |
| Shared 10,000/day | No global ceiling. 25 households at the cap use it all, and sign-up is open (backlog I4) (**I10**). |
| Spend before call | `kroger_spend` counts attempts. A food whose search fails and has no old row is asked again on the next visit and counted again; a Kroger outage can use up the household's day. Acceptable if lookups are once per visit; add a test that a `limited` or failed answer is not re-asked in the same visit. |
| Favorites | "Under $15" prices every favourite's ingredients through `/api/estimates` → `getMatches`, on the same 400. First use can take 150+ of the day's allowance, and when `limited` the items fall to the paid AI estimate (**I10**). |
| Cart calls | A 400 on a batch falls back to one call per item: up to 150 calls a send × 20 sends = 3,000 of the 5,000/day Cart limit from one household (**I11**). |
| Cache | Fresh = under 24 h and same search term. Empty results are cached, so no repeat. Rows are never pruned and all are loaded each time (**I6**). `price_observations` takes about 10 rows per food per day, roughly 290,000 a year (M9). |
| Totals | Over-counted packages (I2) and stale `pack_count` (I3) both raise the total and the cart quantity. By-the-pound quantity is still unverified (M12). |

---

## 5 and 6. Findings, rulings, cost if wrong

### Blocking (rule before dispatch)

| # | Finding | Recommended ruling (smallest change that keeps the spec) | Cost if wrong |
|---|---|---|---|
| B1 | Task 8 step 6 refuses any UPC already sent unless `resend`; Task 9 sends increases as `toSend`. No copy for `already_sent`. | `lines[].quantity` is the wanted total. With `resend: false` the server sends `wanted − sent` per UPC and answers `409 already_sent` only when nothing is left. With `resend: true` it sends the quantities given. Add the copy `Those are already in your cart.` and a route test "sent 2, wanted 3 → sends 1". | Tapping + after a send fails with no message, or the builder passes `resend: true` and switches the guard off for the commonest second send. |
| B2 | Check-then-insert race: two phones or two tabs both pass and both fill the cart. | Insert the `pending` row first, then read the sends again; if any other counted send (pending or sent, same account) overlaps, mark own row `failed` and answer `409`. No schema change. Add a route test with two interleaved requests → one Kroger call. | A doubled cart with no warning: the spec's first anti-goal. |
| B3 | Fixture IDs are not 13 digits; four existing assertions contradict the new rules. | Task 4 gives every fixture product a 13-digit `upc`, and may change those `kroger-products.test.ts` assertions, listing each in the commit body. | Tasks 5, 6 and 9 e2e cannot pass; an implementer stalls or weakens the UPC rule. |
| B4 | Client code imports `MATCH_MAX_AGE_MS` from a server-only module. | Put `MatchRow`, `Choice`, `MATCH_MAX_AGE_MS` in `lib/list/matches.ts` (no `server-only`), as `KROGER_PRICE_MAX_AGE_MS` already sits in `lib/list/prices.ts`. | Build fails in Task 5, or two tasks fix it two different ways. |

### Important

| # | Finding | Recommended ruling | Cost if wrong |
|---|---|---|---|
| I1 | `kroger_spend` allows 60; the estimate path can pass 120. | `getMatches` works in chunks of 60, one spend per chunk. | Favorites pricing returns 500 with more than 60 unpriced foods. |
| I2 | Unknown foods use 1 g/ml and 150 g each: 4 cups of spinach against a 5 oz bag is 7 bags; 2 cups of shredded cheese against 8 oz is 3; 8 buns against 12 oz is 4. | A plain count against a weight or volume package with no known item weight counts 1 package. Add density groups with pinned tests: leafy greens, shredded cheese, breadcrumbs, chopped nuts, dry pasta, berries. | Over-ordering sent to the real cart; totals too high. |
| I3 | `pack_count` outlives a swap. | `chooseProduct`, `searchWith`, `resetChoice` also clear `pack_count`. | Three small jars become three large ones. |
| I4 | A refused refresh deletes the row whatever its state. | On `refused`, read the row again; if `updated_at` moved, use the new tokens; otherwise delete `where updated_at = <read>`. Code sets `updated_at` on every write. | Random "Connect Fred Meyer again" after two requests overlap. |
| I5 | Missing or wrong key deletes links; no off switch. | `getUserAccess` returns null without deleting when `!isVaultConfigured()`; cart and disconnect routes answer `503 not_configured` when `!isCartConfigured()`. Removing `KROGER_REDIRECT_URI` then switches cart filling off. | A good link deleted from a Preview build; no quick way to stop sends. |
| I6 | Match rows grow without end and are all cached in localStorage on every change. | `listMatches` filters `fetched_at` to the last 8 days, and the cache keeps only rows for foods on this week's list. | After some months the cache write fails silently and the offline list goes stale. |
| I7 | 0007 deletes old-key rows while a phone may still run the old script; partial writes lose flags. | Writes send the folded flags merged with the patch. Apply 0007 a week later (old rows belong to the old week and `foldItemState` reads them meanwhile), not at release. | Ticks vanish mid-shop on the other phone; an "outside budget" flag is lost on first tap. |
| I8 | The client and the cart route trust a table members can write. | `listMatches` parses candidates with zod and passes `imageUrl` through `krogerImageUrl`, as `listPrices` does. | A member (or a bug) puts a wrong product or an off-site image in the partner's list. |
| I9 | No CSRF check on send or disconnect. | Both POST routes refuse when `Sec-Fetch-Site` is present and not `same-origin`, and require `application/json`. | Low today; the cart would be open if cookie defaults ever change. |
| I10 | No global Kroger ceiling; Favorites shares the 400 and falls to paid AI. | `kroger_spend` also keeps one all-households daily total and reports over 8,000 as limited. Owner switches sign-ups off when not inviting. Estimate path: when `limited`, leave the item unpriced instead of asking the AI. | A stranger or a loop leaves the family with stale prices for a day; small AI spend. |
| I11 | Per-item fallback can take 3,000 Cart calls a day. | Cap lines sent per household per 24 h at 300 alongside the 20 sends. | Cart API locked out for the day. |
| I12 | 0006 reaches production before these rulings. | Fold I10, M7, M8 into 0006 first; then apply. | A second migration and regenerated types mid-plan. |

### Minor

| # | Finding | Ruling |
|---|---|---|
| M1 | `requestMatches` drops `failed`. | Return `{ matches, limited, failed }`. |
| M2 | Allowed-assertion list lacks key format and Task 4's cases. | Add both to the Global Constraints. |
| M3 | Task 3 user-price rule untested; signature unclear. | Add one test; pass a `userCents(canonical, qty, store)` input to `buildShoppingList`. |
| M4 | Task 7 details: `http.ts` change, `state`, length guard, cookie path on delete, `next` with a query. | State each in the task; build redirects with `URL`. |
| M5 | Review screen lacks `fm` notices and `already_sent` copy. | Reuse Task 7's three strings; B1 adds the other. |
| M6 | Plural container units; egg weight. | Match singular or plural; add `egg: 50`, change the test value. |
| M7 | Spec says the database stamps `fetched_at`. | Amend the spec sentence (the cap does not depend on it). |
| M8 | Unbounded `sealed` and `candidates`. | `check (char_length(sealed) < 4000)`, `check (pg_column_size(candidates) < 65536)`. |
| M9 | Price log volume. | Log pooled candidates only. |
| M10 | `code=` in the request log. | Scope the Task 10 check to log messages. |
| M11 | Forced-refresh throw leaves `pending`. | Catch it, mark `failed`, answer `failed`. |
| M12 | By-the-pound quantity unverified. | Owner's live check uses one cheap by-the-pound item before normal use. |
| M13 | Uncommitted edits on `ratings`. | Commit and merge before branching. |
| M14 | Local e2e needs `KROGER_TOKEN_KEY`. | Note the test key in README. |
| M15 | Costco search URL unverified. | Add to Task 10 step 4. |
| M16 | Merged line "I have it". | Apply to every food on the line. |
| M17 | Ticked items still go to the cart. | Controller decides; simplest is to leave as written. |
| M18 | Task 3 edits `rls_test.sql` unlisted. | Add the file and the `plan()` bump to Task 3. |

---

## Model per task

The owner's saved preference is helpers on Haiku or Sonnet. Where a task needs more, the cheaper route is a Sonnet implementer with the stronger model as reviewer only.

| Task | Model | Why |
|---|---|---|
| 1 | Sonnet | RLS and grants must be exact; fully specified. |
| 2 | Sonnet | Pure functions pinned by tests; many edge cases, too many for Haiku. |
| 3 | Sonnet | Contained; the key migration needs care, not depth. |
| 4 | Sonnet | Clear rules once B3, B4, I1 are ruled. |
| 5 | Stronger (or Sonnet with stronger review) | `useWeekList` load races, offline cache and write queue. |
| 6 | Sonnet | UI with exact copy. |
| 7 | Sonnet with stronger review | Token handling; the review matters more than the typing. |
| 8 | Stronger (or Sonnet with stronger review) | Double-send ordering is the feature's main risk. |
| 9 | Sonnet | Large but literal; e2e heavy. |
| 10 | Controller | Release steps; the version and backlog edits could go to Haiku. |

**Faster without loss:** Tasks 2 and 3 touch only `lib/domain` and the list; Task 1 is SQL. Task 1 can run beside Task 2 (one Sonnet helper each is over the saved limit of one, so run Task 1's SQL in the controller while a helper does Task 2).
