# Fred Meyer Products and Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Fred Meyer list item shows a real product with a whole-package price, one row per food, and a reviewed tap adds the list to the shopper's own Fred Meyer cart, with a record that prevents silent double sends.

**Architecture:** The server caches each store's candidate products per food (one Kroger search per food per day, capped per household) in a household table; the phone does the package math and product choice with pure functions in `lib/domain`, so amounts, swaps and counts change without a network call and the list still works offline. Each person's Kroger tokens are sealed with AES-256-GCM under a Vercel-only key and stored in a row only that person can read. A cart send is recorded as pending before Kroger is called and settled after, and the server refuses a repeat unless the person confirms.

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript strict, Tailwind v4, Supabase Postgres/RLS/Realtime (user session only), `node:crypto`, `zod`, Vitest, Playwright, pgTAP. No new dependencies.

**Spec:** `/home/claude/basket-redesign/spec-fred-meyer-cart.md` (addendum; the controller commits it as `docs/superpowers/specs/2026-11-26-fred-meyer-cart.md`) on top of `docs/superpowers/specs/2026-11-26-basket-design.md` §6–§9. Executors read both.

## Global Constraints

- Read `AGENTS.md` first: this Next.js differs from older versions. Check `node_modules/next/dist/docs/` for route handlers, `cookies()`, redirects and `searchParams` before using them.
- No Supabase service-role key. Every database call uses the signed-in user's session and row-level security.
- Kroger user tokens, authorization codes, PKCE verifiers and `Authorization` headers are never sent to the browser in plaintext and never logged. Log lines for Kroger are `kroger <path> <status>` or a short fixed reason, nothing else.
- Server-only modules start with `import 'server-only'`. Nothing under `lib/domain` imports from `lib/kroger`, `lib/db` or React.
- Money is integer cents. Packages are whole numbers 1–99. Quantities use `Quantity` from `lib/domain/types.ts`; no ad-hoc unit math outside `lib/domain`.
- Kroger endpoints (spec §4): authorize `https://api.kroger.com/v1/connect/oauth2/authorize`; token `https://api.kroger.com/v1/connect/oauth2/token` (HTTP Basic, form body); `PUT https://api.kroger.com/v1/cart/add` with `{ items: [{ upc, quantity, modality }] }`, `modality` `PICKUP` or `DELIVERY`; `GET /v1/identity/profile`; `GET /v1/products`. Scopes for the shopper: `cart.basic:write profile.compact`.
- Redirect URI comes only from `KROGER_REDIRECT_URI` (production: `https://basket-ashy.vercel.app/api/kroger/callback`), never from the request host.
- Limits: Kroger product lookups 400 per household per UTC day, 60 foods per request, 6 at once; product cache 24 h per household + store + food; cart sends 20 per household per 24 h, 150 lines per send.
- With `KROGER_FAKE=1` no request leaves the machine: products, sign-in, token, profile and cart all use fakes. e2e and CI run only this way.
- Product mode is on when `household.kroger_location_id` is set. With no store chosen, the list behaves as in v0.1.0 (estimates) apart from Tasks 3 and 6.
- Keep the current look: existing colour tokens, `lib/ui.ts` class strings, `Sheet`, `pillButton`, `primaryButton`, `bigGreenLink`. Touch targets ≥ 44 px, inputs 16 px text, contrast ≥ 4.5:1, real buttons/links/labels. No sideways scroll at 360 px.
- Copy is plain kitchen language. Fixed strings are quoted in the tasks; use them exactly.
- Existing tests keep passing. An existing assertion may change only where it pins behaviour this plan replaces (two rows for one food; a pro-rated "Fred Meyer price"; "estimate" on Amazon/Costco rows; "estimate" on Fred Meyer rows when a store is chosen). List each changed assertion in the commit body.
- The branch starts from `ratings` once it is merged; `/list` already has "Check off all (N)" with Undo per store tab. Leave it working.
- Every task ends with `npm run lint && npm run typecheck && npm test && npm run build` green and one commit. Database and e2e tests run in GitHub Actions; run them locally only if the Supabase stack starts.
- Supabase and Vercel changes on the real projects are the controller's steps (marked **controller**), through the MCP tools.

## Review Focus

1. **A second send** (double tap, both phones, a timeout with no answer): the cart must never be filled twice without a plain warning and a confirmation; an unknown outcome reads "We couldn't tell if Fred Meyer got it." → tests in Task 8 (route) and Task 9 (e2e).
2. **A dead Kroger token** (revoked, key changed, refresh lost a race): the person sees "Connect Fred Meyer again", the list keeps working, nothing secret is logged, and no half-send is recorded as sent. → tests in Tasks 7 and 8.
3. **Sizes and foods Kroger answers oddly** ("1/2 gal", "5 lb bag", "each", blank size, no results, a food with no real amount): a row still reads sensibly with a count of 1 and a real price, never `NaN`, `Infinity`, `$0.00` or 0 packages. → tests in Tasks 2 and 4.
4. **A phone that was mid-week before the update** (cached list, offline queue, saved flags keyed `food#kind`): have-it and checked survive and still toggle. → tests in Task 3.
5. **Kroger down, slow, or the daily cap reached**: the last products and prices stay on screen with "Fred Meyer prices may be out of date."; the list never goes blank and never falls back to a guess in product mode. → tests in Tasks 4 and 5.

---

## File Structure

```
supabase/migrations/0006_fred_meyer_cart.sql     tables, grants, kroger_spend(), realtime
supabase/migrations/0007_item_keys_by_food.sql   rewrite week_item_state keys (after deploy)
lib/domain/density.ts        g/ml and typical item weights by food name (pure)
lib/domain/packages.ts       Candidate, Offer, packagesNeeded, recommend, perBase (pure)
lib/domain/cart.ts           CartLine, CartSend, cartDiff (pure)
lib/domain/list.ts           one row per food: parts, key = food
lib/domain/units.ts          isVague, formatNeed
lib/list/state.ts            foldItemState (old keys → food keys)
lib/list/matches-client.ts   requestMatches (browser → /api/kroger/match)
lib/list/cart-client.ts      sendCart (browser → /api/kroger/cart)
lib/kroger/size.ts           parseSize: fractions, multipacks, trailing words
lib/kroger/products.ts       searchProducts, toCandidates (priceFor kept on top)
lib/kroger/matches.ts        getMatches: cache, cap, price log
lib/kroger/vault.ts          seal / unseal (AES-256-GCM)
lib/kroger/oauth.ts          PKCE, authorize URL, code exchange, refresh, profile
lib/kroger/link.ts           saveLink, getUserAccess, linkStatus, deleteLink
lib/kroger/cart.ts           addToCart
lib/kroger/fake.ts           fakes for all of the above
lib/db/queries/kroger.ts     listMatches, listChoices, setChoice, clearChoice, listCartSends
app/api/kroger/match/route.ts
app/api/kroger/connect/route.ts, callback/route.ts, disconnect/route.ts
app/api/kroger/cart/route.ts
app/(app)/list/review/page.tsx
components/ReviewScreen.tsx, ReviewLine.tsx, SwapSheet.tsx
components/ListRow.tsx, ListScreen.tsx, ListSheet.tsx   (modified)
lib/useWeekList.ts                                      (modified)
```

---

### Task 1: Migration 0006, row-level security tests, types

**Files:**
- Create: `supabase/migrations/0006_fred_meyer_cart.sql`
- Modify: `supabase/tests/rls_test.sql` (raise `plan(96)` by the number of tests added), `lib/db/types.ts` (regenerated), `lib/db/rows.ts`
- Test: `supabase/tests/rls_test.sql`

**Interfaces:**
- Produces (tables, all with `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` unless noted; RLS enabled; `revoke all … from anon, authenticated` before the grants below):
  - `kroger_matches`: `household_id uuid not null → households on delete cascade`, `location_id text not null`, `canonical text not null`, `term text not null`, `candidates jsonb not null default '[]'`, `fetched_at timestamptz not null default now()`, `unique (household_id, location_id, canonical)`. Members: select, insert, update. No delete.
  - `item_product_choice`: `household_id`, `canonical text not null`, `upc text` (check `upc ~ '^[0-9]{13}$'` when not null), `search_term text` (check `char_length between 2 and 80` when not null), `updated_at timestamptz not null default now()`, `unique (household_id, canonical)`. Members: select, insert, update, delete.
  - `kroger_links`: primary key `user_id uuid references auth.users on delete cascade default auth.uid()` (no `id`), `sealed text not null`, `profile_id text`, `updated_at timestamptz not null default now()`. Policies on all four verbs: `user_id = (select auth.uid())`. Grants: select, insert, update, delete.
  - `cart_sends`: `household_id`, `week_id uuid not null` with `foreign key (week_id, household_id) references weeks (id, household_id) on delete cascade`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `profile_id text`, `modality text not null check (modality in ('PICKUP','DELIVERY'))`, `status text not null default 'pending' check (status in ('pending','sent','failed'))`, `items jsonb not null default '[]'`, `total_cents int not null default 0 check (total_cents >= 0)`; index on `(week_id)`. Select: `is_member(household_id)`. Insert: `is_member(household_id) and user_id = (select auth.uid())`. Update: using and check `user_id = (select auth.uid()) and is_member(household_id)`. Grants: `select`, `insert`, `update (status, items, total_cents)`. No delete.
  - `price_observations`: `household_id`, `location_id text not null`, `upc text not null`, `regular_cents int not null check (regular_cents > 0)`, `promo_cents int`, `seen_on date not null default current_date`, `unique (household_id, location_id, upc, seen_on)`. Members: select, insert.
  - `kroger_calls`: primary key `(household_id, day date)`, `calls int not null default 0`. RLS on, select for members, no write grants.
  - `week_item_state.pack_count int` with `check (pack_count between 1 and 99)`; `households.fulfillment text not null default 'PICKUP' check (fulfillment in ('PICKUP','DELIVERY'))` plus `grant update (fulfillment) on public.households to authenticated`.
  - `public.kroger_spend(h uuid, n int) returns int`, `security definer set search_path = ''`: raises `not_member` unless `public.is_member(h)`; raises `bad_count` unless `n between 0 and 60`; adds `n` to today's (UTC) `kroger_calls` row for `h` (insert or update) and returns the new total. Execute revoked from `public, anon`, granted to `authenticated`.
  - `alter publication supabase_realtime add table public.kroger_matches, public.item_product_choice, public.cart_sends;`
- Produces (TypeScript): regenerated `Database` types; in `lib/db/rows.ts` add `export type CartSendRow = Row<"cart_sends">; export type KrogerMatchRow = Row<"kroger_matches">;`

- [ ] **Step 1: Write the failing pgTAP tests** in `rls_test.sql`, after the block where C joins HA (A and C are then both in HA; B is in HB). Seed one row per new household table for HA and HB in `pg_temp.seed`. Tests:
  - A selects 1 `kroger_matches` row, 1 `item_product_choice`, 1 `price_observations`, 1 `cart_sends`; none of HB's.
  - A insert into each for HB → `42501`.
  - `delete from public.kroger_matches` as A → `42501`; `delete from public.cart_sends` as A → `42501`.
  - A inserts a `kroger_links` row; `select count(*)` as A = 1, as C (same household) = 0, as B = 0; C `update public.kroger_links set sealed = 'x'` changes 0 rows.
  - A inserts a `cart_sends` row with `user_id` = C's id → `42501`. C updating A's send `set status = 'sent'` changes 0 rows. A `update … set profile_id = 'x'` → `42501` (column not granted).
  - `select public.kroger_spend(HA, 5)` as A returns 5, again returns 10; `kroger_spend(HB, 1)` as A raises `not_member`; `kroger_spend(HA, 61)` raises `bad_count`; A `insert into public.kroger_calls …` → `42501`; `update public.kroger_calls set calls = 0` → `42501`.
  - A sets `households.fulfillment = 'DELIVERY'` on HA (reads back `DELIVERY`); `'DRONE'` → `23514`. `week_item_state.pack_count = 100` → `23514`.
- [ ] **Step 2: Write `0006_fred_meyer_cart.sql`** as described in Interfaces. Run `npx supabase test db` if the local stack starts; otherwise CI is the check. Expected: all tests pass.
- [ ] **Step 3 (controller):** apply 0006 to the production project through the Supabase MCP (it only adds; v0.1.0 keeps working), run the security advisors, regenerate `lib/db/types.ts`, hand it to the implementer.
- [ ] **Step 4:** add the two row types; lint, typecheck, unit tests, build. Commit `feat(db): tables for Fred Meyer products, links and cart sends`.

---

### Task 2: Package math (pure)

**Files:**
- Create: `lib/domain/density.ts`, `lib/domain/packages.ts`
- Modify: `lib/domain/units.ts`, `lib/kroger/size.ts`
- Test: `tests/unit/density.test.ts`, `tests/unit/packages.test.ts`, `tests/unit/kroger-size.test.ts` (extend), `tests/unit/units.test.ts` (extend)

**Interfaces:**
- Produces in `lib/domain/units.ts`:
  - `isVague(q: Quantity): boolean` — true for a count whose `countUnit` is one of `to taste, pinch, pinches, dash, dashes, sprinkle, splash, drizzle, as needed, garnish, for garnish, for serving`.
- Produces in `lib/domain/density.ts`:
  - `gramsPerMl(canonical: string): number` — the longest keyword found in the name wins; default `1`.
  - `eachGrams(canonical: string): number` — typical weight of one loose item; default `150`.
- Produces in `lib/domain/packages.ts`:

```ts
export interface Candidate {
  upc: string;                 // 13 digits
  name: string;
  brand: string | null;
  sizeText: string;            // as Kroger prints it, '' when absent
  size: Quantity | null;       // parsed sizeText
  soldBy: 'UNIT' | 'WEIGHT';
  regularCents: number;        // > 0
  promoCents: number | null;   // set only when 0 < promo < regular
  imageUrl: string | null;
  relevant: boolean;           // name has every search word
  inStock: boolean;
}
export interface Offer {
  candidate: Candidate;
  count: number;       // packages, or pounds for soldBy 'WEIGHT'; 1–99
  unitCents: number;   // promoCents ?? regularCents
  totalCents: number;  // count * unitCents
  onSale: boolean;
  approx: boolean;     // soldBy === 'WEIGHT'
}
export interface Recommendation {
  pick: Offer | null;
  options: Offer[];            // at most 5, cheapest first
  cheapestUpc: string | null;
  usualMissing: boolean;       // a chosen UPC was given but is not among the candidates
}
export function poolOf(candidates: Candidate[]): Candidate[];
export function packagesNeeded(canonical: string, parts: Quantity[], size: Quantity | null): number;
export function offerFor(canonical: string, parts: Quantity[], c: Candidate, count?: number | null): Offer;
export function recommend(
  canonical: string, parts: Quantity[], candidates: Candidate[],
  opts?: { chosenUpc?: string | null; count?: number | null },
): Recommendation;
export function perBase(canonical: string, kind: Quantity['kind'], candidates: Candidate[]):
  { centsPerBase: number; candidate: Candidate } | null;
```

- [ ] **Step 1: Write the failing tests.**

`tests/unit/density.test.ts`:
```ts
expect(gramsPerMl('honey')).toBe(1.42);
expect(gramsPerMl('olive oil')).toBe(0.92);
expect(gramsPerMl('all-purpose flour')).toBe(0.53);
expect(gramsPerMl('sugar')).toBe(0.85);
expect(gramsPerMl('light brown sugar')).toBe(0.9);
expect(gramsPerMl('salt')).toBe(1.2);
expect(gramsPerMl('kosher salt')).toBe(0.8);
expect(gramsPerMl('paprika')).toBe(0.5);
expect(gramsPerMl('garlic powder')).toBe(0.5);
expect(gramsPerMl('dried oregano')).toBe(0.2);
expect(gramsPerMl('peanut butter')).toBe(1.1);
expect(gramsPerMl('butter')).toBe(0.96);
expect(gramsPerMl('chicken broth')).toBe(1);
expect(gramsPerMl('dijon mustard')).toBe(1.05);
expect(gramsPerMl('something unheard of')).toBe(1);
expect(eachGrams('yellow onion')).toBe(225);
expect(eachGrams('lemon')).toBe(100);
expect(eachGrams('dragonfruit')).toBe(150);
```

`tests/unit/packages.test.ts` (build quantities with `toQuantity` / `quantityOrCount`; `size('12 oz')` means `parseSize('12 oz')`):
```ts
// packagesNeeded(canonical, parts, size)
['honey', [q(1.9,'tbsp')], size('12 oz')]                         → 1
['chicken broth', [q(3.8,'cups')], size('32 fl oz')]              → 1
['chicken broth', [q(4.5,'cups')], size('32 fl oz')]              → 2
['chicken broth', [q(3.8,'cups')], size('14.5 oz')]               → 3   // volume need, weight package, water density
['kosher salt', [q(2.4,'tsp'), q(1,'to taste')], size('3 lb')]    → 1
['kosher salt', [q(1,'to taste')], size('3 lb')]                  → 1
['black beans', [q(2,'cans')], size('15 oz')]                     → 2   // a can is a package
['yellow onion', [q(3,'')], size('3 lb')]                         → 1   // 3 × 225 g
['yellow onion', [q(3,'')], size('1 lb')]                         → 2
['yellow onion', [q(200,'g')], size('1 each')]                    → 1
['boneless chicken thighs', [q(1.5,'lb')], size('1 lb')]          → 2
['eggs', [q(18,'')], size('12 ct')]                               → 2
['garlic', [q(3,'cloves')], size('1 ct')]                         → 1   // cloves, slices, sprigs, leaves, stalks add nothing
['milk', [q(1,'gallon')], null]                                   → 1   // unreadable size
['rice', [q(500,'lb')], size('1 lb')]                             → 99  // capped
['flour', [], size('5 lb')]                                       → 1
```
```ts
// recommend
// A: 16 oz $2.49, B: 32 oz $3.99, both relevant, need 20 oz
expect(r.pick.candidate.upc).toBe(B.upc); expect(r.pick.count).toBe(1); expect(r.pick.totalCents).toBe(399);
expect(r.options.map(o => o.candidate.upc)).toEqual([B.upc, A.upc]); expect(r.cheapestUpc).toBe(B.upc);
// same total, one on sale (regular 349, promo 299 vs regular 299) → the sale one is picked, onSale true
// promoCents null → onSale false, unitCents = regularCents
// any relevant candidate → irrelevant ones are never picked; none relevant → pool is the first 3 in order
// more than 5 relevant → pool is the first 5 in order; a cheaper 6th is not picked
// an out-of-stock candidate is picked only when every pooled candidate is out of stock
// chosenUpc = A.upc → pick is A (count 2, 498); options still cheapest first and include A
// chosenUpc in candidates but outside the pool → it is the pick and is added to options
// chosenUpc = '0000000000000' (absent) → pick is B, usualMissing true
// count: 3 → pick.count 3, totalCents 3 × unitCents; count 0 or 100 is ignored
// soldBy 'WEIGHT', size 1 lb, 399/lb, need 11.2 oz → count 1, totalCents 399, approx true
// [] → { pick: null, options: [], cheapestUpc: null, usualMissing: false }
// every Offer in every case: Number.isInteger(count) && count >= 1 && Number.isInteger(totalCents) && totalCents > 0
```
```ts
// perBase: cheapest cents per gram / ml / item among poolOf(candidates), sizes converted by density;
// 'WEIGHT' candidates are per pound of their size. Null when the pool has no readable size.
perBase('honey', 'volume', [twelveOz599])   // 599 / (340.19 / 1.42) ≈ 2.50 cents per ml
perBase('eggs', 'mass', [dozen299])         // 299 / (12 × 150 g)
perBase('milk', 'volume', [])               // null
```

`kroger-size.test.ts` additions: `'1/2 gal'` → 1892.7 ml (±0.1); `'6 ct / 16.9 fl oz'` → 6 × 16.9 fl oz in ml; `'5 lb bag'` → 2267.96 g; `'each'` and `'1 each'` → count 1; `''`, `'assorted'`, `'0 oz'` → null; the existing cases unchanged.

`units.test.ts`: `isVague(quantityOrCount(1,'to taste'))` true; `isVague(toQuantity(1,'tsp'))` false; `isVague(quantityOrCount(2,'cans'))` false.

- [ ] **Step 2:** Run `npx vitest run tests/unit/density.test.ts tests/unit/packages.test.ts tests/unit/kroger-size.test.ts tests/unit/units.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** The rule `packagesNeeded` follows, per part, summed, then `min(99, max(1, ceil(sum − 1e-9)))`:

| Part | Package size | Packages |
|---|---|---|
| `isVague`, or count unit clove/slice/sprig/leaf/leaves/stalk (singular or plural) | any | 0 |
| count with a container unit (can, jar, pack, package, bunch, head, bottle, bag, box, carton, loaf, container) | any | the amount |
| anything else | `null` | 0 |
| mass | mass; or volume | grams ÷ size grams; or (grams ÷ `gramsPerMl`) ÷ size ml |
| volume | volume; or mass | ml ÷ size ml; or (ml × `gramsPerMl`) ÷ size grams |
| other count | count | amount ÷ size amount |
| other count | mass; or volume | amount × `eachGrams` ÷ size grams; or that weight ÷ `gramsPerMl` ÷ size ml |
| mass; or volume | count | grams ÷ `eachGrams` ÷ size amount; volume first × `gramsPerMl` |

  `recommend` order: in stock before out of stock, then lower `totalCents`, then on sale, then earlier in `candidates`. Density keywords beyond the tested ones are the implementer's (cover the groups in spec C4: salts, sugars, flours, honey and syrups, oils, ground spices, dried herbs, liquids, condiments, nut butters, rice, oats).
- [ ] **Step 4:** Run the same command. Expected: PASS. Then lint, typecheck, full unit run, build.
- [ ] **Step 5:** Commit `feat: package math and volume-to-weight conversion`.

---

### Task 3: One row per food

**Files:**
- Create: `lib/list/state.ts`, `supabase/migrations/0007_item_keys_by_food.sql`
- Modify: `lib/domain/list.ts`, `lib/domain/units.ts`, `lib/useWeekList.ts` (`buildList`, the missing-price effect, `setPrice`), `components/ListRow.tsx`, `components/ListSheet.tsx`
- Test: `tests/unit/list.test.ts`, `tests/unit/list-state.test.ts`, `tests/unit/units.test.ts`, `e2e/list.spec.ts`

**Interfaces:**
- Produces:
  - `ListItem` gains `parts: Quantity[]`; `key` is now the food name (`canonical`, trimmed lower case); `qty` stays and is the first part that is not vague (else the first part).
  - Part order: plain counts, named counts (by unit name), mass, volume, vague last. Same-kind amounts still add as today; counts still round up to whole numbers.
  - `formatNeed(parts: Quantity[]): string` in `units.ts`.
  - `foldItemState(state: Record<string, ItemState>): Record<string, ItemState>` in `lib/list/state.ts`: for each food, the row keyed exactly by the food wins whole; otherwise the flags are the OR of rows keyed `food#mass`, `food#volume`, `food#count…`.
  - `estimateCents` for a merged row: if a `user` price exists for `qty`'s kind, it alone (it is the total for the row); otherwise the sum over parts that have a price; `null` when no part has one.
  - Consumes `isVague` (Task 2).

- [ ] **Step 1: Write the failing tests.**

`list.test.ts` (new and changed cases):
```ts
// 'kosher salt' 2.4 tsp from one meal and 1 'to taste' from another → one item
expect(items).toHaveLength(1);
expect(items[0].key).toBe('kosher salt');
expect(items[0].parts.map(formatQuantity)).toEqual(['2.4 tsp', '1 to taste']);
expect(items[0].qty.kind).toBe('volume');
expect(items[0].sources).toEqual(['Meal A', 'Meal B']);
// '1 onion' + '200 g onion' → one item, parts [count 1, mass 200 g], qty is the count  (replaces "stays two lines")
// '2 cups milk' + '1 gallon milk' → one part, 4258.6 ml (unchanged behaviour)
// haveIt: new Set(['kosher salt']) → haveIt true; always-have by name still works
// estimateFor returns 50 for the volume part and 299 for the vague part → estimateCents 349; both null → null
```
`units.test.ts`:
```ts
formatNeed([q(2.4,'tsp'), q(1,'to taste')])  // '2.4 tsp + to taste'
formatNeed([q(1,'to taste')])                // 'to taste'
formatNeed([q(1,''), q(200,'g')])            // '1 + 7.1 oz'
formatNeed([q(2,'cans')])                    // '2 cans'
```
`list-state.test.ts`:
```ts
foldItemState({ 'salt#volume': {have_it:true, checked:false, outside_budget:false},
                'salt#count:to taste': {have_it:false, checked:true, outside_budget:false} })
  // → { salt: { have_it:true, checked:true, outside_budget:false } }
foldItemState({ 'salt#volume': {have_it:true,…}, salt: {have_it:false, checked:false, outside_budget:false} })
  // → salt.have_it false  (the food-keyed row wins whole)
foldItemState({ rice: {…checked:true} })   // unchanged
// a list built from a cached ListInputs whose itemState has only 'olive oil#volume' checked → item 'olive oil' is in `checked`
```
`e2e/list.spec.ts`: add "one food, one row": a household with two dinners that both use the same food in different units shows `getByTestId('list-row').filter({ hasText: <food> })` count 1 and the joined amount; ticking it, reloading, and unticking it both stick.

- [ ] **Step 2:** Run `npx vitest run tests/unit/list.test.ts tests/unit/list-state.test.ts tests/unit/units.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `buildList` calls `foldItemState(raw.itemState)` before reading flags; writes use the new key. The missing-price effect asks per part. `setPrice` keeps using `item.qty`. `ListRow` and `ListSheet` show `formatNeed(item.parts)` wherever they showed `formatQuantity(item.qty)`.
- [ ] **Step 4: Write `0007_item_keys_by_food.sql`** (not applied until Task 10):
```sql
-- Shopping-list flags are now keyed by the food alone. Fold 'food#kind' rows into one row per food.
with old as (
  delete from public.week_item_state
  where item_key ~ '#(mass|volume|count(:.*)?)$'
  returning household_id, week_id,
            regexp_replace(item_key, '#(mass|volume|count(:.*)?)$', '') as food,
            have_it, checked, outside_budget
), folded as (
  select household_id, week_id, food,
         bool_or(have_it) as have_it, bool_or(checked) as checked, bool_or(outside_budget) as outside_budget
  from old group by household_id, week_id, food
)
insert into public.week_item_state (household_id, week_id, item_key, have_it, checked, outside_budget)
select household_id, week_id, food, have_it, checked, outside_budget from folded
on conflict (week_id, item_key) do nothing;
```
  Add a pgTAP check that seeds `beans#mass` (have_it) and `beans#count:can` (checked) as the superuser, runs the same statement (repeated inline in the test file, since migrations have already run by then), and finds one row `beans` with both true and no row containing `#`.
- [ ] **Step 5:** Run the unit command again. Expected: PASS. Lint, typecheck, full unit run, build.
- [ ] **Step 6:** Commit `feat: one list row per food`.

---

### Task 4: Fred Meyer product matches (server, cache, cap, price log)

**Files:**
- Create: `lib/kroger/matches.ts`, `app/api/kroger/match/route.ts`, `lib/db/queries/kroger.ts`, `lib/list/matches-client.ts`, `tests/fixtures/kroger/products-kosher-salt.json`, `products-olive-oil.json`, `products-honey.json`
- Modify: `lib/kroger/products.ts`, `lib/kroger/fake.ts`, existing `tests/fixtures/kroger/products-*.json` (add `"upc"` equal to `productId`; one product per file gets `"inventory": { "stockLevel": "TEMPORARILY_OUT_OF_STOCK" }` only in a new `products-out-of-stock.json`), `lib/ai/estimate.ts`
- Test: `tests/unit/kroger-candidates.test.ts`, `tests/unit/kroger-matches.test.ts`, `tests/unit/kroger-match-route.test.ts`, `tests/unit/kroger-products.test.ts`, `tests/unit/estimates-kroger.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `poolOf`, `perBase` (Task 2); `kroger_matches`, `price_observations`, `item_product_choice`, `kroger_spend` (Task 1).
- Produces:
```ts
// lib/kroger/products.ts
export async function searchProducts(term: string, locationId: string): Promise<KrogerProduct[]>; // filter.limit 20
export function toCandidates(products: KrogerProduct[], term: string): Candidate[];              // at most 10, Kroger's order
// priceFor(canonical, kind, locationId) keeps its signature and return type; it becomes
// perBase(canonical, kind, toCandidates(await searchProducts(canonical, locationId), canonical)) mapped to KrogerPrice.

// lib/kroger/matches.ts
export interface MatchRow { canonical: string; locationId: string; term: string; candidates: Candidate[]; fetchedAt: string }
export const MATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DAILY_LOOKUPS = 400;
export async function getMatches(
  canonicals: string[],
  ctx: { sb: SupabaseClient<Database>; householdId: string; locationId: string },
): Promise<{ matches: MatchRow[]; limited: boolean; failed: number }>;

// lib/db/queries/kroger.ts  (browser-safe; no 'server-only')
export interface Choice { canonical: string; upc: string | null; searchTerm: string | null }
export async function listMatches(sb, householdId: string, locationId: string): Promise<MatchRow[]>;
export async function listChoices(sb, householdId: string): Promise<Choice[]>;

// lib/list/matches-client.ts
export async function requestMatches(canonicals: string[]): Promise<{ matches: MatchRow[]; limited: boolean }>;
// batches of 60; resolves { matches: [], limited: false } on any failure
```
- `POST /api/kroger/match`, body `{ canonicals: string[] }` (1–60 names, each 1–80 chars, trimmed lower case, de-duplicated) → `200 { matches, limited, failed }` | `400 bad_request` | `401` | `404 no_household` | `409 no_store` (no `kroger_location_id`) | `503 not_configured`.
- `toCandidates` rules: skip a product with no description, no item priced above 0, or no 13-digit `upc ?? productId`; use the first priced item; `promoCents` only when `0 < promo < regular`; `size = parseSize(item.size)`; `relevant` = every word of `term` is in the description (the existing singular/plural-tolerant match); `inStock` false only for `inventory.stockLevel === 'TEMPORARILY_OUT_OF_STOCK'`; `imageUrl` as today.
- `getMatches` rules: the wanted term for a food is its `item_product_choice.search_term`, else the food name. A cached row is fresh when `fetched_at` is under 24 h old and its `term` equals the wanted term. For the `n` foods that are not fresh: call `kroger_spend(householdId, n)`; if the returned total is over 400, look nothing up and set `limited`; otherwise search each (6 at once). A search that throws keeps the old row and adds to `failed`. A search with no usable products is saved with `candidates: []` (so it is not asked again for 24 h). Saved rows set `fetched_at` to now. Every candidate saved also goes to `price_observations` (`upsert … ignoreDuplicates`). The result holds every row that exists for the asked foods, fresh or not.
- `lib/ai/estimate.ts`: the per-item `priceFor` calls are replaced by one `getMatches(names, ctx)` and `perBase` per item; everything else in that function stays (user rows win, AI for what has no shelf price, the two upserts, the same result shape). With `limited` or a failed search, the item keeps its old price as today.
- Fake (`KROGER_FAKE=1`): `fakeProductsResponse(term)` serves a fixture by keyword: `chicken thigh`, `black bean`, `egg`, `milk`, `kosher salt`, `olive oil`, `honey`; anything else → empty.

- [ ] **Step 1: Write the failing tests.**
  - `kroger-candidates.test.ts`: chicken fixture → 2 candidates, first `{ upc: '0020000000001', soldBy: 'WEIGHT', regularCents: 399, promoCents: null, sizeText: '1 lb', relevant: true, inStock: true }`; a product without `upc` uses `productId`; `productId: 'abc'` is skipped; `promo: 0` and `promo ≥ regular` → `promoCents` null; `size: '1/2 gal'` parsed; missing `size` → `sizeText ''`, `size null`; out-of-stock fixture → `inStock false`; 14 priced products → 10 candidates; term `'organic black beans'` marks only names with all three words relevant.
  - `kroger-matches.test.ts` (mock `searchProducts`, and a Supabase stand-in in the style of `estimates-kroger.test.ts`): a fresh cached row → 0 searches and 0 `kroger_spend`; a row 25 h old → 1 search, row replaced; a `search_term` different from the cached `term` → searched with the new term; `kroger_spend` returning 401 → `limited: true`, 0 searches, the stale row still returned; a search that throws → old row returned, `failed: 1`, `console.error` called with a string that contains no token; empty result → row saved with `candidates: []` and not searched again on the next call; `price_observations` upsert receives one row per candidate with `regular_cents`/`promo_cents`.
  - `kroger-match-route.test.ts`: 401 signed out; 400 for `[]`, 61 names, an 81-char name; 409 with no store; 200 shape; 503 when `getMatches` throws `KrogerNotConfigured`.
  - `kroger-products.test.ts`, `estimates-kroger.test.ts`: existing cases still pass (adapt the mocks to `getMatches`); add: a volume need priced from a weight-sized product is `source: 'kroger'` (honey fixture, `kind: 'volume'`), and no Kroger search happens for a food with a fresh `kroger_matches` row.
- [ ] **Step 2:** Run `npx vitest run tests/unit/kroger-candidates.test.ts tests/unit/kroger-matches.test.ts tests/unit/kroger-match-route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules, route, client and fixtures.
- [ ] **Step 4:** Run `npm test`. Expected: PASS (all files). Lint, typecheck, build.
- [ ] **Step 5:** Commit `feat: Fred Meyer product matches with a daily cache and cap`.

---

### Task 5: The list shows products and package totals

*Stronger model recommended: `lib/useWeekList.ts` has load races, an offline cache and a write queue that must keep their guarantees.*

**Files:**
- Modify: `lib/useWeekList.ts`, `lib/list/offline.ts` (`ItemPatch`), `lib/db/queries/list.ts` (`ItemState`, `listItemState`), `lib/list/state.ts`, `components/ListRow.tsx`, `components/ListScreen.tsx`, `components/ListSheet.tsx`, `lib/list/prices.ts`
- Test: `tests/unit/build-list.test.ts` (new), `tests/unit/list-state.test.ts`, `e2e/fred-meyer-prices.spec.ts`, `e2e/list.spec.ts`

**Interfaces:**
- Consumes: `recommend`, `Offer`, `Recommendation` (Task 2); `MatchRow`, `Choice`, `listMatches`, `listChoices`, `requestMatches`, `MATCH_MAX_AGE_MS` (Task 4); merged `ListItem` (Task 3).
- Produces:
  - `ItemPatch` and `ItemState` gain `pack_count?: number | null`; `foldItemState` carries `pack_count` from the food-keyed row only.
  - `ListInputs` gains `matches: MatchRow[]`, `choices: Choice[]`, `locationId: string | null` (all optional when read from an older cache: treat missing as `[]` / `null`).
  - `buildList(raw)` also returns `products: Record<string, Recommendation>` (by item key) and `productMode: boolean` (`!!raw.locationId`).
  - `useWeekList` also returns `products`, `productMode`, `stalePrices: boolean` (a lookup came back `limited`, or failed while a to-buy Fred Meyer item has no fresh match) and `setPackCount(item: ListItem, count: number | null): Promise<void>` (through the existing `update` queue).
  - Price rule for `ListItem.estimateCents` (the only number totals and the budget meter read):

| Store | Mode | `estimateCents` |
|---|---|---|
| Fred Meyer | product | `pick.totalCents`; else a `user` price; else `null`. Never an AI price. |
| Fred Meyer | no store chosen | as v0.1.0 |
| Amazon, Costco | any | a `user` price; else `null` |

  - `recommend` is called with `chosenUpc` from `choices` and `count` from the item's `pack_count`.
  - Lookups: after a load, to-buy Fred Meyer items in product mode with no match row, a row older than `MATCH_MAX_AGE_MS`, or a row whose `term` differs from the choice's `searchTerm` are sent to `requestMatches` once per visit (same "requested" guard and "fetched this visit" merge the price effect uses). `/api/estimates` is no longer called for Amazon, Costco, or Fred Meyer in product mode. The realtime table list adds `kroger_matches` and `item_product_choice`.
- Screen copy (exact):
  - Product row, right column: `$3.99` (prefixed `about ` when `approx`); below it `1 package`, or `2 × $1.25`, or for by-the-pound `2 lb`; `Sale` pill when `onSale`.
  - Product line under the amount: `<product name> · <sizeText>` (name alone when `sizeText` is empty).
  - No candidates: `No Fred Meyer match yet`, price `—`.
  - `usualMissing`: `Your usual isn't on the shelf today`.
  - `stalePrices`: `Fred Meyer prices may be out of date.` (`role="status"`, above the rows).
  - Fred Meyer tab with no store chosen: `Choose your Fred Meyer in Household to see real products and prices.` with "Household" a link to `/household`.
  - List bar label: product mode `This week's total`; otherwise the existing sentence. `N items without a price` stays.
  - `ListSheet` hides "Set price" for an item that has a `pick`.
  - `data-testid="row-total"` on the row's price, `data-testid="row-count"` on the count line.

- [ ] **Step 1: Write the failing tests.**

`build-list.test.ts` (call `buildList` with hand-made `ListInputs`):
```ts
// product mode, olive oil 1.9 tbsp, one candidate 16.9 fl oz at 799 on promo 699
expect(item.estimateCents).toBe(699);                 // the whole bottle, not 34 cents
expect(products['olive oil'].pick.count).toBe(1);
// chicken thighs 11.2 oz, candidate WEIGHT 1 lb 399 → estimateCents 399, pick.approx true
// black beans 2 cans, candidate 15 oz 125 → estimateCents 250, count 2
// pack_count 3 on black beans → estimateCents 375
// choice { canonical: 'black beans', upc: other } → pick is the other candidate
// a Fred Meyer item with matches [] and an 'ai' price row → estimateCents null (no guess)
// the same item with a 'user' price row → the user price
// an Amazon item with only an 'ai' row → null; with a 'user' row → the user price
// locationId null → every value equals what v0.1.0 computed (snapshot of the existing list fixture)
// totals: listTotals(items).totalCents is the sum of the package totals; have-it and outside-budget excluded as before
// ListInputs without matches/choices/locationId (an old cache) builds without throwing
```
`e2e/fred-meyer-prices.spec.ts` (replace the pro-rated assertions): after choosing the store and adding the tacos, the chicken row shows the product name, `row-total` `about $3.99`, `row-count` `1 lb`; the black beans row shows a product name, a photo and a `row-count`; no row on the Fred Meyer tab has the text `estimate`; `list-total` equals the sum of the visible `row-total` values on all tabs (parse and add in the test); the Week tab's budget meter shows the same total. Screenshot `fred-meyer-products.png`.
`e2e/list.spec.ts`: with no store chosen the Fred Meyer tab shows the "Choose your Fred Meyer" line and still shows `estimate`.

- [ ] **Step 2:** Run `npx vitest run tests/unit/build-list.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `buildList` pure. Load `listMatches` and `listChoices` in the same `Promise.all` as the other inputs (skip both when there is no store).
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Lint, typecheck, build. Push and confirm CI e2e is green on both phone projects.
- [ ] **Step 5:** Commit `feat: real Fred Meyer products and package totals on the list`.

---

### Task 6: Swap, own search words, Amazon and Costco links

**Files:**
- Create: `components/SwapSheet.tsx`, `e2e/swap.spec.ts`
- Modify: `lib/db/queries/kroger.ts`, `lib/useWeekList.ts`, `components/ListRow.tsx`, `components/ListScreen.tsx`, `lib/list/prices.ts`
- Test: `tests/unit/list-prices.test.ts`, `tests/unit/kroger-queries.test.ts`, `e2e/swap.spec.ts`, `e2e/list.spec.ts`

**Interfaces:**
- Consumes: `Recommendation`, `Offer`; `requestMatches`; `item_product_choice`.
- Produces:
```ts
// lib/db/queries/kroger.ts
export async function setChoice(sb, householdId: string, canonical: string,
  patch: { upc?: string | null; searchTerm?: string | null }): Promise<void>;   // upsert on (household_id, canonical), sets updated_at
export async function clearChoice(sb, householdId: string, canonical: string): Promise<void>;
// lib/useWeekList.ts
chooseProduct(item: ListItem, upc: string): Promise<void>;    // setChoice({ upc }); the list re-picks at once
searchWith(item: ListItem, term: string): Promise<void>;      // setChoice({ searchTerm: term, upc: null }) then requestMatches([item.canonical])
resetChoice(item: ListItem): Promise<void>;                   // clearChoice, then requestMatches if the cached term was a custom one
// lib/list/prices.ts
export function storeSearchUrl(store: 'amazon' | 'costco', canonical: string): string;
```
- `SwapSheet` props: `{ item: ListItem; rec: Recommendation; searchTerm: string | null; busy: boolean; onChoose(upc): void; onSearch(term): Promise<void>; onReset(): void; onClose(): void }`, built on `Sheet`.
- Screen copy (exact): row button `Swap` with `aria-label="Swap <Food> product"`; sheet title `Swap <food>`; each option is a button showing photo, name, `sizeText`, `1 package · $3.99` / `2 × $1.25 · $2.50` / `about $3.99 · 1 lb`; tags `Cheapest` (on `cheapestUpc`) and `Your usual` (on the chosen UPC); `Out of stock` on such options; field label `Search with other words`, button `Search`, validation `Use 2 to 80 letters.`; after a custom search a line `Searching for "<term>"`; `Back to Basket's pick` (shown when a choice row exists); empty state `Nothing matched at your Fred Meyer. Try other words.`
- A row with no match shows a `Find a product` button that opens the same sheet.
- Amazon and Costco rows without a `user` price show a link in place of the price: `Search Amazon` / `Search Costco`, `target="_blank" rel="noopener noreferrer"`, a sibling of the row button (not nested), ≥ 44 px tall.

- [ ] **Step 1: Write the failing tests.**
```ts
storeSearchUrl('amazon', 'corn tortillas')   // 'https://www.amazon.com/s?k=corn%20tortillas'
storeSearchUrl('costco', 'olive oil & salt') // 'https://www.costco.com/CatalogSearch?keyword=olive%20oil%20%26%20salt'
```
  `kroger-queries.test.ts`: `setChoice` upserts with `onConflict: 'household_id,canonical'` and sends `search_term`/`upc` only for the keys given; `clearChoice` deletes by household and food.
  `e2e/swap.spec.ts` (both phone projects, fake): choose the store, add the tacos, open `Swap` on Black beans → the sheet lists at least 2 options with one `Cheapest`; choose the other → the row shows its name and its total, the `list-total` changes by the difference; reload → still chosen and tagged `Your usual` in the sheet; `Back to Basket's pick` → the first product returns. Search with `organic black beans` → `Searching for "organic black beans"` shows and survives a reload; `a` → `Use 2 to 80 letters.` A second signed-in partner (`joinAsPartner`) sees the swapped product without reloading. Screenshot `swap.png`.
  `e2e/list.spec.ts`: on the Amazon tab a moved item shows `Search Amazon` with `href` `https://www.amazon.com/s?k=…` and no `estimate`; after "Set price" it shows the price and `your price`. Update the existing Amazon/Costco `estimate` assertions accordingly.
- [ ] **Step 2:** Run `npx vitest run tests/unit/list-prices.test.ts tests/unit/kroger-queries.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The row becomes: checkbox, the open-sheet button, then `Swap` (or the search link) as a sibling. Check the row at 360 px: no sideways scroll, names clamp to two lines.
- [ ] **Step 4:** `npm test`; lint, typecheck, build; CI e2e green.
- [ ] **Step 5:** Commit `feat: swap products, search with your own words, Amazon and Costco search links`.

---

### Task 7: Connect a Fred Meyer account

*Stronger model recommended (implementer or at least reviewer): token handling and the sign-in round trip.*

**Files:**
- Create: `lib/kroger/vault.ts`, `lib/kroger/oauth.ts`, `lib/kroger/link.ts`, `app/api/kroger/connect/route.ts`, `app/api/kroger/callback/route.ts`, `app/api/kroger/disconnect/route.ts`
- Modify: `lib/kroger/fake.ts`, `lib/kroger/http.ts`, `app/(app)/household/page.tsx`, `app/(app)/household/HouseholdScreen.tsx`, `.env.example`, `.github/workflows/ci.yml` (e2e env `KROGER_TOKEN_KEY: MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=`), `README.md` (the two new variables)
- Test: `tests/unit/kroger-vault.test.ts`, `tests/unit/kroger-oauth.test.ts`, `tests/unit/kroger-link.test.ts`, `tests/unit/kroger-connect-routes.test.ts`, `e2e/fred-meyer-connect.spec.ts`

**Interfaces:**
- Consumes: `kroger_links` (Task 1); `safeNext` (`lib/auth/safe-next.ts`); `requireHousehold`.
- Produces:
```ts
// lib/kroger/vault.ts  — AES-256-GCM, key = base64 of 32 bytes in KROGER_TOKEN_KEY
export const isVaultConfigured: () => boolean;                 // false when unset or not 32 bytes
export function seal(plain: string, aad: string): string;      // 'v1.<iv>.<ciphertext>.<tag>', base64url, random 12-byte iv
export function unseal(sealed: string, aad: string): string | null;   // null on any failure; never throws
// lib/kroger/oauth.ts
export const isCartConfigured: () => boolean;  // fake, or (client id + secret + vault + KROGER_REDIRECT_URI)
export function newPkce(): { verifier: string; challenge: string };   // 32 random bytes base64url; challenge = base64url(sha256(verifier))
export function authorizeUrl(state: string, challenge: string): string;
export interface UserTokens { access: string; accessExp: number /* ms epoch */; refresh: string }
export async function exchangeCode(code: string, verifier: string): Promise<UserTokens>;
export async function refreshTokens(refresh: string): Promise<UserTokens | 'refused'>;  // 'refused' on 400/401; throws on network/5xx
export async function fetchProfileId(access: string): Promise<string | null>;           // never throws
// lib/kroger/link.ts
export async function saveLink(sb, userId: string, tokens: UserTokens, profileId: string | null): Promise<void>;
export async function getUserAccess(sb, userId: string, opts?: { force?: boolean }):
  Promise<{ access: string; profileId: string | null } | null>;
export async function linkStatus(sb, userId: string): Promise<{ connected: boolean; profileId: string | null }>;
export async function deleteLink(sb, userId: string): Promise<void>;
```
- `authorizeUrl` query, in this order: `scope=cart.basic:write profile.compact`, `response_type=code`, `client_id`, `redirect_uri`, `state`, `code_challenge`, `code_challenge_method=S256`, and `banner=<KROGER_BANNER>` only when that variable is set.
- Token calls: `POST` form body, `Authorization: Basic base64(id:secret)`, 10 s timeout, `cache: 'no-store'`; `authorization_code` sends `code`, `redirect_uri`, `code_verifier`; `refresh_token` sends `refresh_token`. `accessExp = now + expires_in × 1000`. When a refresh answer has no `refresh_token`, keep the old one.
- `kroger_links.sealed` = `seal(JSON.stringify(tokens), userId)`.
- `getUserAccess`: no row, or `unseal` fails → delete the row if any, return `null`. Access valid for more than 60 s and not `force` → return it, no network. Otherwise refresh: `'refused'` → delete the row, `null`; success → `update … where user_id = <id> and updated_at = <the value read>`; if that updates 0 rows another request won, so read the row again and return its token.
- `GET /api/kroger/connect?next=<path>`: signed out → redirect `/login`; `!isCartConfigured()` → redirect `safeNext(next)?fm=failed`. Sets cookie `kroger_oauth` = `seal(JSON.stringify({ state, verifier, next: safeNext(next), uid }), 'oauth')`, `httpOnly`, `sameSite: 'lax'`, `secure` when the request URL is https, `path: '/api/kroger'`, `maxAge: 600`; redirects (302) to `authorizeUrl`. Fake: redirects to `/api/kroger/callback?code=fake-code&state=<state>`.
- `GET /api/kroger/callback`: always deletes the cookie. Cookie missing, unreadable, `state` not equal (`crypto.timingSafeEqual`), or `uid` not the signed-in user → redirect `/list/review?fm=failed`, nothing saved. `error` param present → `<next>?fm=denied`. Otherwise `exchangeCode` → `fetchProfileId` → `saveLink` → `<next>?fm=connected`; any throw → `<next>?fm=failed` with one log line `kroger connect failed`.
- `POST /api/kroger/disconnect` → `204` after `deleteLink` (401 signed out).
- Fake: `exchangeCode` returns `{ access: 'fake-access', refresh: 'fake-refresh', accessExp: now + 30 min }`; `refreshTokens` the same; `fetchProfileId` → `'fake-profile'`.
- Household screen, Fred Meyer row (only when `cartEnabled`, a new prop from `isCartConfigured()`): line `Fred Meyer account`; not connected: link `Connect` (`href="/api/kroger/connect?next=/household"`) and `You'll sign in on Fred Meyer's own page. Basket never sees your password.`; connected: `Connected` and a `Disconnect` button. Notices from `?fm=`: `Fred Meyer is connected.` / `Fred Meyer wasn't connected.` / `That didn't work. Try connecting again.` (`role="status"`).

- [ ] **Step 1: Write the failing tests.**
  - `kroger-vault.test.ts`: `unseal(seal('secret', 'u1'), 'u1') === 'secret'`; two seals of the same text differ; wrong aad → null; one character of the ciphertext changed → null; a different key → null; `'garbage'` → null; key of 16 bytes → `isVaultConfigured()` false and `seal` throws `KrogerNotConfigured`; the sealed string does not contain `'secret'`.
  - `kroger-oauth.test.ts` (mock `fetch`): `authorizeUrl('S', 'C')` equals `https://api.kroger.com/v1/connect/oauth2/authorize?scope=cart.basic%3Awrite%20profile.compact&response_type=code&client_id=<id>&redirect_uri=https%3A%2F%2Fbasket-ashy.vercel.app%2Fapi%2Fkroger%2Fcallback&state=S&code_challenge=C&code_challenge_method=S256`; the challenge of a known verifier matches its SHA-256; `exchangeCode` posts `grant_type=authorization_code&code=…&redirect_uri=…&code_verifier=…` with the Basic header; `refreshTokens` → `'refused'` on 400, throws on 503, keeps the old refresh token when none is returned.
  - `kroger-link.test.ts`: fresh access → no fetch; access expiring in 30 s → one refresh and the row updated with the new refresh token; `'refused'` → row deleted, `null`; update hits 0 rows → the re-read token is returned and no second refresh is made; `unseal` null (key changed) → row deleted, `null`; with `console.error` and `console.log` spied through every case above, no call argument contains `fake-access`, `fake-refresh` or a code.
  - `kroger-connect-routes.test.ts`: callback with no cookie, with a wrong `state`, and with a cookie whose `uid` is another user → redirect has `fm=failed` and `saveLink` is not called; `error=access_denied` → `fm=denied`; happy path → `saveLink` called once, cookie cleared, redirect to the `next` in the cookie (a `next` of `https://evil.test` in the connect call becomes `/week`); connect signed out → `/login`.
  - `e2e/fred-meyer-connect.spec.ts` (fake): Household → `Connect` → back on `/household` with `Fred Meyer is connected.` and `Connected`; reload keeps it; `Disconnect` → `Connect` returns. A partner in the same household still sees `Connect` (per person). `document.cookie` and `localStorage` contain no `fake-access`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/kroger-vault.test.ts tests/unit/kroger-oauth.test.ts tests/unit/kroger-link.test.ts tests/unit/kroger-connect-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `node:crypto` (`createCipheriv('aes-256-gcm')`, `setAAD`). Read the Next docs for setting and deleting cookies in a route handler and for redirects.
- [ ] **Step 4:** `npm test`; lint, typecheck, build; CI e2e green.
- [ ] **Step 5:** Commit `feat: connect a Fred Meyer account`.

---

### Task 8: Send to the cart (server) and the sent record

**Files:**
- Create: `lib/domain/cart.ts`, `lib/kroger/cart.ts`, `app/api/kroger/cart/route.ts`, `lib/list/cart-client.ts`
- Modify: `lib/kroger/fake.ts`, `lib/db/queries/kroger.ts`, `lib/ai/schemas.ts` (the body schema, beside the others)
- Test: `tests/unit/cart-diff.test.ts`, `tests/unit/kroger-cart.test.ts`, `tests/unit/kroger-cart-route.test.ts`

**Interfaces:**
- Consumes: `getUserAccess`, `deleteLink` (Task 7); `listMatches` (Task 4); `cart_sends` (Task 1).
- Produces:
```ts
// lib/domain/cart.ts
export type Modality = 'PICKUP' | 'DELIVERY';
export interface CartLine { key: string; canonical: string; upc: string; name: string; quantity: number; cents: number }
export interface CartSend { id: string; sentAt: string; userId: string; profileId: string | null;
  modality: Modality; status: 'pending' | 'sent' | 'failed'; items: CartLine[]; totalCents: number }
export interface CartDiff {
  toSend: CartLine[];                                             // new items in full; increases as the difference
  alreadySent: CartLine[];                                        // lines fully covered by earlier sends
  toRemove: { upc: string; name: string; quantity: number }[];    // sent before, no longer wanted (or wanted less)
  lastSentAt: string | null;
  unsure: boolean;                                                // a counted send is still 'pending'
  byOther: boolean;                                               // the last counted send was made by someone else
}
export function cartDiff(lines: CartLine[], sends: CartSend[], me: { userId: string; profileId: string | null }): CartDiff;
// lib/kroger/cart.ts
export class KrogerUnsure extends Error {}   // timeout, network error, 5xx: Kroger may have added the items
export class KrogerAuth extends Error {}     // 401 or 403
export async function addToCart(access: string, items: { upc: string; quantity: number; modality: Modality }[]):
  Promise<{ ok: string[]; rejected: string[] }>;   // UPCs
// lib/db/queries/kroger.ts
export async function listCartSends(sb, weekId: string): Promise<CartSend[]>;   // newest first
// lib/list/cart-client.ts
export type SendResult =
  | { ok: true; sent: number; rejected: { key: string; name: string }[] }
  | { ok: false; reason: 'not_connected' | 'already_sent' | 'unsure' | 'rejected' | 'too_many' | 'failed' };
export async function sendCart(body: { weekId: string; modality: Modality; lines: { key: string; upc: string; quantity: number }[]; resend: boolean }): Promise<SendResult>;
```
- `cartDiff` rules: a send counts when its status is `sent` or `pending` and it went to the same account (both profile ids set → equal; otherwise same `userId`). Sent quantity per UPC is the sum over counted sends. Line with sent 0 → `toSend`; sent ≥ wanted → `alreadySent`; in between → `toSend` with `quantity = wanted − sent` and `cents` scaled by that share (rounded). UPCs sent but not wanted, or sent more than wanted → `toRemove` with the surplus.
- `addToCart`: one `PUT /v1/cart/add`, `Authorization: Bearer`, JSON body, 10 s timeout. 2xx → all ok. 401/403 → `KrogerAuth`. 400 with more than one item → send each item on its own (4 at once): 2xx ok, 400 rejected, anything else `KrogerUnsure`. 400 with one item → rejected. Timeout, network error, 5xx → `KrogerUnsure`. Fake: all ok except UPC `0020000000999` (rejected).
- `POST /api/kroger/cart`, body `{ weekId: uuid, modality, lines: [{ key: 1–120 chars, upc: 13 digits, quantity: int 1–99 }] (1–150, unique UPCs), resend: boolean }`. Steps, in order:
  1. `requireHousehold`; no store → `409 no_store`; body invalid → `400`.
  2. More than 20 `cart_sends` rows for the household in the last 24 h → `429 too_many`.
  3. `getUserAccess` null → `409 not_connected`.
  4. The week must be readable (row-level security) → else `404`.
  5. Each UPC must be a candidate in the household's `kroger_matches` for its store → else `400 unknown_product`. Names and prices come from that cache, never from the body: `cents = quantity × (promoCents ?? regularCents)`.
  6. `cartDiff` against `listCartSends`: when `resend` is false and any line's UPC has a sent quantity above 0 → `409 already_sent`.
  7. Insert the `cart_sends` row (`status: 'pending'`, `items`, `total_cents`, `profile_id`, `modality`). If the insert fails → `500`, Kroger is not called.
  8. `addToCart`. `KrogerAuth` → once more with `getUserAccess(…, { force: true })`; again `KrogerAuth` or null → mark the row `failed`, `deleteLink`, `409 not_connected`.
  9. `KrogerUnsure` → leave the row `pending`, `504 unsure`.
  10. All rejected → row `failed`, `502 rejected`. Otherwise row `sent` with only the accepted lines and their total → `200 { sent, rejected: [{ key, name }] }`. A failure of this last update still answers `200`.
- `sendCart` maps 409/504/502/429 to the reasons above, anything else (and a thrown fetch) to `failed`.

- [ ] **Step 1: Write the failing tests.**

`cart-diff.test.ts` (`L(upc, qty, cents)` makes a line; `S(status, userId, profileId, items)` a send):
```ts
cartDiff([L('A',2,500)], [], me)                               // toSend [A×2 500], alreadySent [], toRemove [], lastSentAt null
cartDiff([L('A',2,500)], [S('sent','u1','p1',[L('A',2,500)])], me)   // toSend [], alreadySent [A×2]
cartDiff([L('A',3,750)], [S('sent',…,[L('A',2,500)])], me)     // toSend [A×1 250]
cartDiff([L('A',1,250)], [S('sent',…,[L('A',2,500), L('B',1,300)])], me)   // toRemove [A×1, B×1], alreadySent [A×1]
cartDiff([L('A',1,250)], [S('failed',…,[L('A',1,250)])], me)   // toSend [A×1]   (failed sends don't count)
cartDiff([L('A',1,250)], [S('pending',…,[L('A',1,250)])], me)  // alreadySent [A×1], unsure true
// same profile id, different user (a shared login) → counts, byOther true
// different profile ids → does not count
// my profileId null → only sends with my userId count
// two sends of A×1 each, wanted A×2 → alreadySent
```
`kroger-cart.test.ts` (mock `fetch`): body is exactly `{"items":[{"upc":"0020000000001","quantity":2,"modality":"PICKUP"}]}` to `https://api.kroger.com/v1/cart/add` with method `PUT`; 204 → ok; 401 → `KrogerAuth`; abort/timeout → `KrogerUnsure`; 500 → `KrogerUnsure`; 400 on three items → three single calls, the one answering 400 is in `rejected`; a 500 during the single calls → `KrogerUnsure`.
`kroger-cart-route.test.ts`: happy path → one `pending` insert before the Kroger call (assert call order), then `sent`, `200 { sent: 2, rejected: [] }`; the body's UPC not in the cache → `400` and no insert; a second identical request → `409 already_sent`, no Kroger call; with `resend: true` → sent; `KrogerUnsure` → `504` and the row still `pending`; then the next request without `resend` → `409 already_sent`; first call `KrogerAuth`, forced refresh succeeds → sent; both fail → `409 not_connected`, row `failed`, link deleted; all rejected → `502`, row `failed`; partial → `200` with the rejected names and a row holding only accepted lines; insert failure → `500` and no Kroger call; 21st send in a day → `429`; a price in the request body is ignored (the recorded `cents` is the cached one); no log argument contains the access token.
- [ ] **Step 2:** Run `npx vitest run tests/unit/cart-diff.test.ts tests/unit/kroger-cart.test.ts tests/unit/kroger-cart-route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm test`; lint, typecheck, build.
- [ ] **Step 5:** Commit `feat: add to Fred Meyer cart with a sent record`.

---

### Task 9: Review screen and the whole flow end to end

**Files:**
- Create: `app/(app)/list/review/page.tsx`, `components/ReviewScreen.tsx`, `components/ReviewLine.tsx`, `lib/list/review.ts`, `e2e/fred-meyer-cart.spec.ts`
- Modify: `components/ListScreen.tsx` (entry link), `lib/db/queries/household.ts` (`HouseholdPatch` gains `fulfillment`), `e2e/layout.spec.ts` (add `{ name: "review", path: "/list/review" }`)
- Test: `tests/unit/review-lines.test.ts`, `e2e/fred-meyer-cart.spec.ts`, `e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `useWeekList` with `products`, `setPackCount`, `chooseProduct`, `searchWith`, `resetChoice`, `update` (Tasks 5–6); `SwapSheet`; `cartDiff`, `listCartSends`, `sendCart` (Task 8); `linkStatus`, `isCartConfigured` (Task 7); `BUDGET_LOOK`, `budgetState`.
- Produces:
  - `reviewLines(items: ListItem[], products: Record<string, Recommendation>): { lines: CartLine[]; unmatched: ListItem[] }` in `lib/list/review.ts`: to-buy Fred Meyer items with a pick become lines (`quantity = pick.count`, `cents = pick.totalCents`, `name = pick.candidate.name`); to-buy Fred Meyer items without one are `unmatched`. Two foods that picked the same UPC become one line with the quantities and cents added and `key` of the first.
  - Page (server): redirects to `/onboarding` without a household and to `/list` without a store; passes `household`, `userId`, `connected`, `profileId`, `cartEnabled`, and the `fm` search param.
  - `ReviewScreen` subscribes to `cart_sends` for live updates from the other phone.
- Screen copy (exact):
  - `/list`, Fred Meyer tab, product mode, at least one line: link `Review and send to Fred Meyer` (`bigGreenLink`) above the total card.
  - Heading `Review your Fred Meyer cart`; back link `Back to list`.
  - Not connected: `Connect Fred Meyer` (`href="/api/kroger/connect?next=/list/review"`) and `You'll sign in on Fred Meyer's own page. Basket never sees your password.` Cart not configured: `Cart filling isn't set up yet.` and no button.
  - `Pickup` | `Delivery` (a radiogroup labelled `How you'll get it`; saved to `households.fulfillment`).
  - Each line: photo, product name, size, the food it is for, `−` / `+` buttons labelled `One fewer <product>` / `One more <product>` (1–99; a changed count is saved with `setPackCount`), line total, `Swap`, `I have it`.
  - Section `Not in this order` for `unmatched`, each with `Find a product`.
  - Totals: `Fred Meyer total` and `This week` with `of $200` and the budget pill. Red state: tapping the send button first asks `You're $X over your budget. Add to cart anyway?` with `Add anyway` / `Go back`.
  - Earlier send: `You added N items on <weekday h:mm am/pm>.` (`byOther`: `N items were added from another phone on …`); `unsure`: `We couldn't tell if Fred Meyer got the last send. Check your Fred Meyer cart before sending again.`
  - `New since then` (the `toSend` lines, selected), `Already in your cart` (the `alreadySent` lines, not selected) with a button `Send these again` that first shows `This adds them a second time. Fred Meyer can't tell Basket what's already in your cart.` and `Add again` / `Cancel`; `Take these out in the Fred Meyer app` (the `toRemove` lines).
  - Send button: `Add N items to my Fred Meyer cart` (N = lines being sent); disabled with `Nothing new to send` when `toSend` is empty and resend isn't chosen; disabled offline with `You're offline.`; while sending `Adding…` and disabled.
  - Results: success `Added. Check out in the Fred Meyer app.` with link `Open my Fred Meyer cart` (`https://www.fredmeyer.com/cart`, new tab); partial adds `Fred Meyer wouldn't take: <names>.`; `not_connected` → `Connect Fred Meyer again.` with the connect link; `unsure` → the sentence above; `rejected` → `Fred Meyer wouldn't take these items. Try swapping them.`; `too_many` → `That's a lot of sends for one day. Try again tomorrow.`; `failed` → `That didn't go through. Nothing was added.`
  - Footer: `Basket never places an order. You check out at Fred Meyer.`

- [ ] **Step 1: Write the failing tests.**
  - `review-lines.test.ts`: have-it items and Amazon items are left out; an item with no pick is in `unmatched`; `pack_count` 3 gives `quantity 3`; two foods with the same UPC give one line with summed quantity and cents.
  - `e2e/fred-meyer-cart.spec.ts` (both phone projects, fake; use `clientFor` to read `cart_sends`):
    1. Household with a store and the tacos → `/list` → `Review and send to Fred Meyer` → `Connect Fred Meyer` → back on the review screen with `Fred Meyer is connected.`
    2. Lines show product names, counts and totals; `Fred Meyer total` equals the sum of the line totals; `One more` on black beans raises its count and both totals; reload keeps the count.
    3. Choose `Delivery`; tap `Add N items to my Fred Meyer cart` → `Added. Check out in the Fred Meyer app.`; the database has one `cart_sends` row, `status = 'sent'`, `modality = 'DELIVERY'`, N items.
    4. Reload → `You added N items on …`, the button reads `Nothing new to send` and is disabled.
    5. Add a staple that matches a fixture (milk) → `New since then` has 1 line and the button reads `Add 1 item to my Fred Meyer cart`; send → two rows in the database.
    6. Mark one sent item `I have it` → it appears under `Take these out in the Fred Meyer app`.
    7. `Send these again` → the warning → `Add again` → a third row.
    8. A partner on a second context opens the review screen: sees `N items were added from another phone on …` after connecting (the fake gives both the same account), and `Connect Fred Meyer` before.
    9. Budget of $1 → the over-budget question appears and `Go back` sends nothing (row count unchanged).
    10. Double tap: `dblclick` on the send button in a fresh household → exactly one `cart_sends` row.
    Screenshots `review.png`, `review-sent.png`.
  - `layout.spec.ts`: the review screen has no sideways scroll at 360, 402 and 412 px and its send button sits above the bottom nav.
- [ ] **Step 2:** Run `npx vitest run tests/unit/review-lines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse `Sheet` for the two confirmations. The send button is `stickyAboveNav`.
- [ ] **Step 4:** `npm test`; lint, typecheck, build; CI green on `iphone-17`, `pixel-7`, `android-small`. Look at the uploaded screenshots.
- [ ] **Step 5:** Commit `feat: review and fill the Fred Meyer cart`.

---

### Task 10: Release and live check (controller and owner)

**Files:**
- Modify: `package.json` (`0.2.0`), `docs/superpowers/specs/2026-11-26-post-launch-backlog.md` (close I7; note I4's Kroger part as capped, sign-up still open; close the T9 "re-offered every session" item), `README.md`

- [ ] **Step 1 (owner, before the deploy):** Kroger developer portal: the production app lists redirect URI `https://basket-ashy.vercel.app/api/kroger/callback` and has the Cart and Identity (profile) products with scopes `cart.basic:write` and `profile.compact`. Vercel → Basket → Environment Variables → Production: `KROGER_TOKEN_KEY` (the controller supplies the command `openssl rand -base64 32`; mark Sensitive) and `KROGER_REDIRECT_URI=https://basket-ashy.vercel.app/api/kroger/callback`.
- [ ] **Step 2 (controller):** confirm 0006 is applied and the advisors are clean; merge; production deploy; confirm the deployment is Ready and `/list` loads signed in.
- [ ] **Step 3 (controller):** apply `0007_item_keys_by_food.sql` right after the deploy is live. Check: `select count(*) from week_item_state where item_key like '%#%'` is 0.
- [ ] **Step 4 (controller, on production, signed in as the test account, no cart send):**
  - `/list` Fred Meyer tab: every to-buy row has a product, a count and a whole-package price; salt, garlic powder, honey, brown sugar, paprika, mustard and broth show products (the foods from the owner's screenshot); Kosher salt is one row; olive oil shows the bottle price.
  - The list total equals the sum of the rows; the Week meter matches.
  - Amazon tab rows show `Search Amazon` and open Amazon's search.
  - `select calls from kroger_calls` for today is about the number of foods, and does not grow on a second open.
  - Runtime logs for the last 15 minutes contain no token, code or `Authorization` text; errors only of the form `kroger <path> <status>`.
  - Note the `size` strings Kroger returned that parsed to null (`select … from kroger_matches, jsonb_array_elements(candidates) c where c->>'size' is null`); if a common shape is missing, add it to `parseSize` with a test before the owner's check.
- [ ] **Step 5 (owner taps, on his phone, about five minutes):**
  1. Open the list. Tap **Swap** on one item and pick another; it stays after closing the app.
  2. Tap **Review and send to Fred Meyer** → **Connect Fred Meyer** → sign in on Fred Meyer's page → you land back on the review screen saying it's connected. (On the iPhone, do this from the installed app as well as the browser, and say if either doesn't come back.)
  3. Mark everything but two or three cheap items "I have it" for this test, or lower counts; pick Pickup; tap **Add N items to my Fred Meyer cart**.
  4. Open the Fred Meyer app: the items are in the cart with the right counts. For one by-the-pound item (chicken), tell the controller what quantity the cart shows.
  5. Back in Basket, the review screen says what was added and has nothing new to send.
  6. Wife: open the review screen on her phone, connect her own account (or the shared one) and confirm what she sees.
- [ ] **Step 6 (controller):** from the owner's answers: if by-the-pound quantities mean "each" in the cart, open a follow-up to count those items as 1; if the sign-in did not return to the installed iPhone app, open a follow-up. Tag `v0.2.0`. Record in the ledger: refresh-token lifetime and whether one bad UPC fails a whole batch, if either was observed.

---

## Self-review (done)

- **Spec coverage:** D1 → whole plan. D2 → Tasks 2, 4, 5. D3 → Tasks 2, 6. D4 → Task 3. D5 → Tasks 3, 5, 9. D6 → Tasks 5, 6. D7 → Task 7. D8 → Task 9. D9 → Tasks 8, 9. C9 cap/cache → Tasks 1, 4. Price logging → Task 4. Budget meter → Task 5 (totals) and Task 9 (over-budget question). Design §9 "changed since you filled the cart" → `cartDiff` and the three review sections. Migration 0006/0007 → Tasks 1, 3, 10.
- **Types:** `Candidate`, `Offer`, `Recommendation` (Task 2) are the only product shapes; `MatchRow`, `Choice` (Task 4); `CartLine`, `CartSend`, `CartDiff`, `Modality` (Task 8) are used unchanged in Task 9. `ItemPatch.pack_count` is defined in Task 5 and used in Task 9 through `setPackCount`.
- **Review Focus:** 1 → Task 8 route tests (pending-before-call, 409, 504) and Task 9 e2e 4, 7, 10. 2 → Task 7 link tests, Task 8 `KrogerAuth` cases. 3 → Task 2 size/package cases and the "every Offer" invariant, Task 4 candidate cases. 4 → Task 3 `foldItemState` and cached-input cases, 0007 pgTAP. 5 → Task 4 `limited`/`failed` cases, Task 5 "no guess in product mode" and `stalePrices`.
- **Left open on purpose:** the facts marked unverified in spec §4 (checked in Task 10); density values beyond the tested ones; layout within the current style.
