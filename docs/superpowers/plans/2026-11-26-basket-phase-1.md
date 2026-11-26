# Basket Phase 1 (Plan and List) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A household can sign in, set up who's eating and its budget, plan a week of dinners (typed, pasted, URL or favorite), and get one merged, age-scaled shopping list split by store with estimated prices and a budget meter, synced live between two phones and installable as an app.

**Architecture:** Next.js App Router app on Vercel; Supabase for Postgres, Auth and Realtime, with row-level security on every household table. All food math (portions, units, scaling, vegetarian swaps, list merging, budget) lives in pure TypeScript under `lib/domain` and is unit-tested without a database. AI calls go through the Vercel AI Gateway behind one provider module that has a deterministic fake for tests.

**Tech Stack:** Next.js (latest stable at Task 1), TypeScript strict, Tailwind CSS, `@supabase/supabase-js` + `@supabase/ssr`, Vercel AI SDK (`ai`) + `zod`, Serwist for the service worker, Vitest, Playwright, Supabase CLI (local stack and pgTAP in CI), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-26-basket-design.md` (approved 2026-11-26 with mockups at https://claude.ai/artifact/BZLCrgeJE3ab7TG8z9rxfh).

## Global Constraints

- Mobile-first. Every screen laid out and e2e-tested at iPhone 17 (402×874, WebKit) and Pixel 7 (412×915, Chromium); layout check at 360×800. Safe-area insets respected (`env(safe-area-inset-*)`).
- Touch targets ≥ 44px; text contrast ≥ 4.5:1; real `<button>`/`<a>`/`<input>`+`<label>`.
- Look matches the approved mockups: ground `#F7F8F5`, ink `#17201B`, muted `#5B6560`, line `#E3E7E2`, green `#1F7A4D`, green tint `#E6F2EB`, sale `#C2410C`, sale tint `#FFF1EA`; headings Bricolage Grotesque 600/700, body DM Sans 400/500/600.
- Screen copy as in the mockups: "This week", "Build shopping list", "Who's eating", "Wiggle room", "+ Add dinner", "Save as a favorite". Kitchen words, no "manage/optimize/workflow".
- Money is integer cents everywhere. Default budget target `20000`, cushion `2500`.
- Portion factor by age: 2–3 → 0.4, 4–5 → 0.5, 6–7 → 0.6, 8–10 → 0.7, 11–13 → 0.85, 14+ → 1.0; under 2 → 0.25 (Claude's call); times appetite (0.5–1.5, default 1).
- Budget meter: green ≤ target; amber ≤ target + cushion; red above.
- Price estimates are always labeled "estimate" in the UI until phase 2 replaces them.
- No retailer passwords or card numbers stored, ever. No secrets in client bundles; no Supabase service-role key in phase 1.
- AI only through `lib/ai/provider.ts` (Vercel AI Gateway). Per-household cap default `300` cents per calendar month; when reached, AI features show a friendly message and manual entry still works.
- Dinner slot on by default; breakfast/lunch slots off. Week start day default Sunday, household time zone default `America/Los_Angeles`.
- The workspace shell can reach only package registries and GitHub. Supabase and Vercel changes go through their MCP tools; database and end-to-end tests run in GitHub Actions.

## Review Focus

1. **Another household's data**: a signed-in member of household A must get zero rows and failed writes on every household B table. → pgTAP tests in Task 4.
2. **Odd or hostile recipe URLs**: non-http schemes, private/loopback addresses, pages over 2 MB, slow pages (> 8 s), and pages with no recipe data must return a friendly error and never crash or hang. → tests in Task 6.
3. **Units that don't convert**: "1 onion" plus "200 g onion" must stay two list lines, never a wrong sum; "2 cups milk" plus "1 gallon milk" must merge. → tests in Task 3.
4. **Being pulled away mid-task**: closing the Add-meal screen or losing signal must not lose the typed meal or the AI draft; reopening restores it. → test in Task 7.
5. **Both phones editing at once**: two members setting Thursday's dinner at the same moment must end with one dinner (last write wins), and check-offs from one phone must appear on the other within a few seconds. → tests in Tasks 7 and 8.

---

## File Structure

```
app/
  layout.tsx, globals.css, manifest.ts, sw.ts
  login/page.tsx                    sign-in (email link, Google)
  auth/callback/route.ts            Supabase code exchange
  onboarding/page.tsx               create household + people + budget
  invite/[token]/page.tsx           accept invite
  (app)/layout.tsx                  bottom nav, household guard
  (app)/week/page.tsx               This week
  (app)/week/add/page.tsx           Add a meal (?day=thu&slot=dinner)
  (app)/favorites/page.tsx
  (app)/list/page.tsx
  (app)/household/page.tsx
  api/meals/draft/route.ts          AI draft from name/text/url
  api/estimates/route.ts            AI price estimates
  api/test/login/route.ts           e2e-only sign-in (guarded)
components/                         BottomNav, BudgetMeter, DayRow, MealSheet, ListRow, PersonRow, StoreTabs
lib/domain/                         types, portions, units, scaling, list, budget, weeks (pure)
lib/ai/                             provider, schemas, recipes, estimate, usage, fake
lib/recipes/                        import-url, jsonld
lib/db/                             client, server, types (generated), queries/*
supabase/migrations/0001_init.sql
supabase/tests/rls_test.sql
tests/unit/**                       Vitest
e2e/**                              Playwright
.github/workflows/ci.yml
```

---

### Task 1: Scaffold, design tokens, CI

**Files:**
- Create: Next.js app at repo root (`/home/claude/basket`, which already holds `docs/`), `app/globals.css`, `app/layout.tsx`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `e2e/smoke.spec.ts`, `README.md`
- Test: `e2e/smoke.spec.ts`, `tests/unit/sanity.test.ts`

**Interfaces:**
- Produces: CSS variables `--ground --ink --muted --line --green --green-tint --sale --sale-tint`; font variables `--font-head` (Bricolage Grotesque via `next/font/google`) and `--font-body` (DM Sans); Playwright projects `iphone-17` (WebKit, 402×874, dpr 3, isMobile, hasTouch), `pixel-7` (`devices['Pixel 7']`), `android-small` (Chromium 360×800, layout specs only); npm scripts `dev build start lint typecheck test test:e2e`.

- [ ] **Step 1:** `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm` (keep existing `docs/`). `git init`, first commit.
- [ ] **Step 2:** Write `e2e/smoke.spec.ts`: visiting `/` shows a heading with text `Basket`; `document.documentElement.scrollWidth <= viewport width` (no sideways scroll). Run `npx playwright test e2e/smoke.spec.ts` → FAIL (default page).
- [ ] **Step 3:** Replace the home page with a minimal "Basket" heading on the ground colour; add tokens and fonts in `globals.css`/`layout.tsx`; `viewport-fit=cover` meta. Run the smoke test in both main projects in parallel → PASS.
- [ ] **Step 4:** `ci.yml`: on push and PR, Node 22, `npm ci`, `lint`, `typecheck`, `test`, install Playwright browsers (chromium, webkit), `supabase start` (from Task 4 on), `build`, `test:e2e`; upload `e2e/screenshots/**` and the Playwright report as artifacts.
- [ ] **Step 5:** Create private GitHub repo `zdstjohn/basket` (`gh repo create zdstjohn/basket --private --source . --push`; if `gh` isn't authorized, ask the user to create an empty repo and attach it with push access). Push; confirm CI is green with `gh run watch`.
- [ ] **Step 6:** Commit `chore: scaffold app, tokens, CI`.

### Task 2: Portions and units (pure)

**Files:**
- Create: `lib/domain/types.ts`, `lib/domain/portions.ts`, `lib/domain/units.ts`
- Test: `tests/unit/portions.test.ts`, `tests/unit/units.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `type Diet = 'none' | 'vegetarian' | 'vegan' | 'pescatarian'`
  - `interface Person { id: string; name: string; age: number; diet: Diet; appetite: number; dislikes: string[] }`
  - `type Role = 'meat' | 'fish' | 'veg_protein' | 'produce' | 'dairy' | 'bakery' | 'frozen' | 'pantry' | 'other'`
  - `interface Quantity { amount: number; kind: 'mass' | 'volume' | 'count'; base: 'g' | 'ml' | 'each'; countUnit?: string }`
  - `interface IngredientLine { canonical: string; amount: number; unit: string; role: Role; note?: string }`
  - `interface VegSwap { canonical: string; amountPerServing: number; unit: string; role: Role }`
  - `interface Meal { id: string; name: string; baseServings: number; ingredients: IngredientLine[]; vegSwap: VegSwap | null; everyoneVegetarian: boolean; isFavorite: boolean }`
- Produces (portions.ts): `portionFactor(age: number, appetite?: number): number`; `householdServings(people: Person[]): number` (sum, rounded to 0.1); `eatsRole(diet: Diet, role: Role): boolean` (meat: only `none`; fish: `none` and `pescatarian`; all other roles: everyone).
- Produces (units.ts): `toQuantity(amount: number, unit: string): Quantity | null`; `addQuantities(a: Quantity, b: Quantity): Quantity | null`; `formatQuantity(q: Quantity): string` (US units: mass shown in oz under 1 lb else lb to 1 decimal; volume in tsp/tbsp/cup/gallon; count as `n` plus countUnit).

- [ ] **Step 1: Failing tests** (`portions.test.ts`):
  - `portionFactor(4) === 0.5`, `portionFactor(6) === 0.6`, `portionFactor(8) === 0.7`, `portionFactor(13) === 0.85`, `portionFactor(38) === 1`, `portionFactor(1) === 0.25`, `portionFactor(8, 1.5) === 1.05`
  - `householdServings([38, 39, 8, 6, 4 as people]) === 3.8`
  - `eatsRole('vegetarian','meat') === false`, `eatsRole('pescatarian','fish') === true`, `eatsRole('vegan','produce') === true`
- [ ] **Step 2: Failing tests** (`units.test.ts`):
  - `toQuantity(1,'lb')` → `{amount: 453.59…, kind:'mass', base:'g'}` (toBeCloseTo, 1 decimal)
  - `toQuantity(2,'cups')` → 473.18 ml; `toQuantity(1,'gallon')` → 3785.41 ml; `toQuantity(3,'tbsp')` → 44.36 ml
  - `toQuantity(2,'cans')` → `{amount:2, kind:'count', base:'each', countUnit:'can'}`; `toQuantity(1,'')` → count, countUnit `undefined`
  - `toQuantity(1,'smidgen')` → `null`
  - `addQuantities(2 cups, 1 gallon)` → 4258.6 ml; `addQuantities(1 each, 200 g)` → `null`; `addQuantities(2 cans, 1 bunch)` → `null`
  - `formatQuantity(toQuantity(0.7,'lb'))` → `'11.2 oz'`; `formatQuantity(toQuantity(3.1,'lb'))` → `'3.1 lb'`; `formatQuantity(toQuantity(2,'cans'))` → `'2 cans'`
- [ ] **Step 3:** Run `npx vitest run tests/unit` → FAIL (modules missing).
- [ ] **Step 4:** Implement both modules. Unit aliases are case-insensitive and include singular/plural and `oz, ounce, lb, pound, g, gram, kg, ml, l, liter, tsp, teaspoon, tbsp, tablespoon, cup, fl oz, pint, quart, gallon`; count units `can, jar, pack, package, bunch, clove, head, slice, each, whole` and empty string.
- [ ] **Step 5:** Run → PASS. Commit `feat(domain): portions and units`.

### Task 3: Scaling, vegetarian swaps, list, budget, weeks (pure)

**Files:**
- Create: `lib/domain/scaling.ts`, `lib/domain/list.ts`, `lib/domain/budget.ts`, `lib/domain/weeks.ts`
- Test: `tests/unit/scaling.test.ts`, `tests/unit/list.test.ts`, `tests/unit/budget.test.ts`, `tests/unit/weeks.test.ts`

**Interfaces:**
- Consumes: Task 2 types and functions.
- Produces:
  - `interface ScaledLine { canonical: string; qty: Quantity; role: Role; sources: string[] }`
  - `scaleMeal(meal: Meal, people: Person[], servingsOverride?: number): ScaledLine[]`
  - `type Store = 'fred_meyer' | 'amazon' | 'costco'`
  - `interface ListItem { key: string; canonical: string; qty: Quantity; role: Role; store: Store; estimateCents: number | null; haveIt: boolean; alwaysHave: boolean; outsideBudget: boolean; sources: string[] }`
  - `buildShoppingList(input: { scaled: ScaledLine[]; staples: IngredientLine[]; alwaysHave: string[]; haveIt: Set<string>; outsideBudget: Set<string>; storeFor(canonical: string, role: Role): Store; estimateFor(canonical: string, qty: Quantity, store: Store): number | null }): ListItem[]`
  - `listTotals(items: ListItem[]): { totalCents: number; byStore: Record<Store, { cents: number; count: number }>; missingEstimates: number }`
  - `type BudgetState = 'green' | 'amber' | 'red'`; `budgetState(totalCents: number, targetCents: number, cushionCents: number): BudgetState`
  - `type Day = 'sun'|'mon'|'tue'|'wed'|'thu'|'fri'|'sat'`; `weekStartFor(now: Date, startDay: Day, timeZone: string): string` (YYYY-MM-DD); `daysOfWeek(startDay: Day): Day[]`

**Scaling rule (decided here):** `target = servingsOverride ?? householdServings(people)`. Non-protein lines: `amount × target / baseServings`. Meat/fish lines when not `everyoneVegetarian`: `amount × (target × eaterShare) / baseServings`, where `eaterShare` = sum of factors of people who `eatsRole` ÷ sum of all factors. Swap line, only if someone doesn't eat that role: `amountPerServing × target × (1 − eaterShare)`. If no one eats the role, the meat line is dropped. `everyoneVegetarian` meals have no meat/fish lines and no swap.

- [ ] **Step 1: Failing tests** (`scaling.test.ts`), with the five-person household (Dad 38 none, Mom 39 vegetarian, Son 8, Daughter 6, Daughter 4) and the shared tacos fixture `lib/fixtures/tacos.ts`: name "Chicken tacos", base 4 servings, 1 lb `boneless chicken thighs` (meat), 12 `corn tortillas` (bakery, count), 1 `yellow onion` (produce, count), swap `black beans` 0.25 can per serving (veg_protein):
  - chicken → 317.5 g (±0.5), i.e. 0.7 lb
  - tortillas → 11.4 each; onion → 0.95 each
  - black beans → 0.25 can
  - servingsOverride 5.8 (+2 leftovers) → chicken 484.6 g (±0.5); beans 0.3816 can (±0.001)
  - household with no vegetarian → no swap line; all-vegetarian household → no chicken line, beans `0.25 × 3.8`
  - `everyoneVegetarian: true` → no chicken, no beans
  - every line's `sources` is `['Chicken tacos']`
- [ ] **Step 2: Failing tests** (`list.test.ts`):
  - two meals each needing 1 cup milk plus staples 1 gallon milk → one `milk` item of 4258.6 ml
  - `1 onion` plus `200 g onion` → two items, keys `onion#count` and `onion#mass`
  - count amounts rounded up: 11.4 tortillas → 12; 0.25 can → 1 can
  - canonical names are trimmed and lower-cased before merging (`"Milk "` + `"milk"` → one item); sources merged and de-duplicated
  - `alwaysHave: ['salt']` → salt item present with `alwaysHave: true, haveIt: true`
  - `listTotals` excludes `haveIt` and `outsideBudget` items, counts `null` estimates in `missingEstimates`, sums `byStore`
- [ ] **Step 3: Failing tests** (`budget.test.ts`): `budgetState(18412,20000,2500)==='green'`, `(20000,…)==='green'`, `(20001,…)==='amber'`, `(22500,…)==='amber'`, `(22501,…)==='red'`.
- [ ] **Step 4: Failing tests** (`weeks.test.ts`): `weekStartFor(new Date('2026-11-29T07:59:00Z'),'sun','America/Los_Angeles') === '2026-11-22'` (still Saturday night in Tacoma); `weekStartFor(new Date('2026-11-29T08:00:00Z'),'sun','America/Los_Angeles') === '2026-11-29'`; `daysOfWeek('mon')[6] === 'sun'`.
- [ ] **Step 5:** Run `npx vitest run tests/unit` → FAIL. Implement the four modules (use `Intl.DateTimeFormat` with `timeZone` for weeks; no date library). Run → PASS.
- [ ] **Step 6:** Commit `feat(domain): scaling, swaps, list, budget, weeks`.

### Task 4: Supabase project, schema, row-level security

**Files:**
- Create: `supabase/config.toml` (`supabase init`), `supabase/migrations/0001_init.sql`, `supabase/tests/rls_test.sql`, `lib/db/types.ts` (generated), `lib/db/client.ts`, `lib/db/server.ts`, `middleware.ts`, `.env.example` (variable names only, no values)
- Modify: `.github/workflows/ci.yml` (enable the commented Supabase block: `supabase/setup-cli`, `supabase start`, `supabase test db`, export the local URL and publishable key to the e2e env), `playwright.config.ts` (in CI the webServer runs `npm run start` only, since CI already built), `.gitignore` (add `!.env.example`)
- Test: `supabase/tests/rls_test.sql` (pgTAP, runs in CI via `supabase test db`)

**Interfaces:**
- Produces tables (all with `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, and `household_id uuid not null references households on delete cascade` unless noted):
  - `households(name text, time_zone text default 'America/Los_Angeles', week_start text default 'sun', budget_cents int default 20000, cushion_cents int default 2500, slots text[] default '{dinner}', ai_cap_cents int default 300, recipe_source text default 'sites', category_store jsonb default '{}')` (no household_id)
  - `members(user_id uuid references auth.users, role text check in ('owner','member'))`, unique `(household_id, user_id)`; unique `(user_id)` (one household per user in v1)
  - `invites(token text unique, created_by uuid, expires_at timestamptz, used_by uuid null)`
  - `people(name, age int, diet text, appetite numeric default 1, dislikes text[] default '{}', sort int)`
  - `meals(name, base_servings numeric, ingredients jsonb, veg_swap jsonb null, everyone_vegetarian bool default false, is_favorite bool default false, source_url text null, photo_url text null, photo_credit text null, photo_credit_url text null, photo_path text null, times_planned int default 0)` (no stored cooking steps: the recipe's own page keeps them)
  - `weeks(week_start date)`, unique `(household_id, week_start)`
  - `week_meals(week_id uuid references weeks on delete cascade, day text, slot text, meal_id uuid references meals, servings_override numeric null, updated_by uuid)`, unique `(week_id, day, slot)`
  - `staples(canonical, amount numeric, unit, role, active bool default true)`
  - `always_have(canonical)`, unique `(household_id, canonical)`
  - `week_item_state(week_id, item_key text, have_it bool default false, checked bool default false, outside_budget bool default false, updated_by uuid)`, unique `(week_id, item_key)`
  - `item_store(canonical, store text)`, unique `(household_id, canonical)`
  - `price_estimates(canonical, store, kind text, cents_per_base numeric, source text default 'ai')`, unique `(household_id, canonical, store, kind)`
  - `ai_usage(kind text, model text, input_tokens int, output_tokens int, cost_cents numeric)`
- Produces a private Storage bucket `meal-photos`; objects live under `<household_id>/…`; members of that household may read, upload and delete; nobody else.
- Produces SQL functions: `is_member(h uuid) returns bool` (security definer, `auth.uid()`); `create_household(p_name text) returns uuid` (inserts household and owner member); `create_invite() returns text` (owner only, 32-byte random hex, expires in 7 days); `accept_invite(p_token text) returns uuid` (valid, unused, unexpired; caller has no household; marks used).
- Produces: `createBrowserClient()` in `lib/db/client.ts`, `createServerClient()` in `lib/db/server.ts`, generated `Database` type, and row aliases in `lib/db/rows.ts`: `Household`, `Week`, `WeekMeal`, `MealRow`, `PersonRow` (= `Database['public']['Tables'][…]['Row']`).
- RLS: enabled on every table. Members get select/insert/update/delete on household tables; `ai_usage` select/insert only (no update/delete); `households` select/update for members, insert only via `create_household`; `invites` select/insert for owners only.

- [ ] **Step 1: Failing pgTAP tests** (`rls_test.sql`): create users A and B, household HA (A owner) and HB (B owner) via the functions; as A (`set local role authenticated; set local request.jwt.claims ...`):
  - `select count(*) from people where household_id = HB` = 0, likewise for `meals`, `weeks`, `week_meals`, `week_item_state`, `price_estimates`, `ai_usage`
  - inserting a `people` row with `household_id = HB` throws
  - deleting from `ai_usage` affects 0 rows
  - `accept_invite` with an expired token raises; with a used token raises; a valid token makes user C a member of HA, and C then sees HA's people
  - inserting two `week_meals` rows for the same `(week_id, day, slot)` raises a unique violation
  - A cannot select or insert `storage.objects` in bucket `meal-photos` under HB's folder
- [ ] **Step 2:** Create the Supabase project with the Supabase MCP `create_project` (name `basket`, org `iuxcwqwfswxbpxerfebn`, region `us-west-1`). If it reports any cost, stop and ask the user.
- [ ] **Step 3:** Write `0001_init.sql`; apply with MCP `apply_migration`; run MCP `get_advisors` (security) → no RLS warnings.
- [ ] **Step 4:** Generate types with MCP `generate_typescript_types` into `lib/db/types.ts`. Add `@supabase/ssr` clients and `middleware.ts` session refresh.
- [ ] **Step 5:** Push; CI runs `supabase start && supabase test db` → PASS.
- [ ] **Step 6:** Commit `feat(db): schema, RLS, household functions`.

### Task 5: Sign-in, onboarding, household screen, invites

**Files:**
- Create: `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/onboarding/page.tsx`, `app/invite/[token]/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/household/page.tsx`, `components/BottomNav.tsx`, `components/PersonRow.tsx`, `lib/db/queries/household.ts`, `app/api/test/login/route.ts`, `e2e/helpers/auth.ts`
- Test: `e2e/onboarding.spec.ts`, `tests/unit/household-queries.test.ts`

**Interfaces:**
- Consumes: Task 4 clients and functions; Task 2 `householdServings`, `portionFactor`.
- Produces (`lib/db/queries/household.ts`): `getMyHousehold(sb): Promise<Household | null>`; `listPeople(sb, householdId): Promise<Person[]>`; `upsertPerson(sb, householdId, p: Omit<Person,'id'> & { id?: string }): Promise<Person>`; `deletePerson(sb, id)`; `updateHousehold(sb, id, patch: Partial<Pick<Household,'name'|'budget_cents'|'cushion_cents'|'week_start'|'slots'|'time_zone'>>)`; `createInviteLink(sb): Promise<string>` (absolute URL `/invite/<token>`).
- Produces: `e2e/helpers/auth.ts` `signInAs(page, email: string)` using `POST /api/test/login`, which exists only when `process.env.E2E === '1'` and `process.env.VERCEL !== '1'` (returns 404 otherwise).
- `(app)/layout.tsx` redirects: no session → `/login`; session but no household → `/onboarding`.

- [ ] **Step 1: Failing e2e** (`onboarding.spec.ts`, both projects): new user signs in → lands on `/onboarding` → enters household name, adds people (Dad 38 none, Mom 39 vegetarian, Son 8, Daughter 6, Daughter 4) → budget prefilled `$200` and wiggle room `+$25` → Save → `/week`; `/household` shows "Who's eating · 3.8 servings", five rows, "Mom" row shows "Vegetarian"; a screenshot saved to `e2e/screenshots/<project>/household.png`.
- [ ] **Step 2: Failing e2e**: owner taps Invite → copies link; second user opens it → lands on `/week` of the same household; a third user opening the same link sees "This invite was already used".
- [ ] **Step 3: Failing e2e**: `GET /api/test/login` with `E2E` unset → 404 (run in a separate config with the env unset).
- [ ] **Step 4:** Implement. Login page: email magic link (Supabase `signInWithOtp`) and a "Continue with Google" button shown only when `NEXT_PUBLIC_GOOGLE_AUTH === '1'`. Household screen matches the mockup (people list, budget target and wiggle room, stores and sharing rows; store rows read "Coming soon" in phase 1).
- [ ] **Step 5:** Run e2e in CI → PASS. Commit `feat: sign-in, onboarding, household, invites`.
- [ ] **Step 6 (user):** Walk the user through Supabase Auth URL settings (Site URL = production domain, redirect URL `/auth/callback` for production and previews). Google sign-in is deferred by the user's choice (2026-11-26) until the app is shared with friends; build the flag-gated button but leave `NEXT_PUBLIC_GOOGLE_AUTH` unset.

### Task 6: Recipe search (big sites and Spoonacular), photos, import, spending cap

*Amended 2026-11-26 at the user's request: typing a dish searches recipe sources and shows top options with photos (replaces AI-drafting a recipe from a name); every recipe carries a photo; two sources with a toggle next to the search box: "Big sites" (Brave Search API limited to `RECIPE_SITES`, then each page's recipe data) and "Spoonacular" (Spoonacular API).*

**Files:**
- Create: `lib/ai/provider.ts`, `lib/ai/fake.ts`, `lib/ai/schemas.ts`, `lib/ai/recipes.ts`, `lib/ai/estimate.ts`, `lib/ai/usage.ts`, `lib/recipes/jsonld.ts`, `lib/recipes/import-url.ts`, `lib/recipes/sites.ts`, `lib/recipes/search/provider.ts`, `lib/recipes/search/brave.ts`, `lib/recipes/search/spoonacular.ts`, `lib/recipes/search/fake.ts`, `tests/fixtures/spoonacular/*.json`, `lib/recipes/search/index.ts`, `lib/photos/upload.ts`, `app/api/recipes/search/route.ts`, `app/api/meals/draft/route.ts`, `app/api/estimates/route.ts`, `tests/fixtures/recipes/*.html`
- Test: `tests/unit/jsonld.test.ts`, `tests/unit/import-url.test.ts`, `tests/unit/search.test.ts`, `tests/unit/spoonacular.test.ts`, `tests/unit/usage.test.ts`, `tests/unit/draft-route.test.ts`, `tests/unit/photo-resize.test.ts`

**Interfaces:**
- Produces:
  - `RECIPE_SITES: { domain: string; name: string }[]` in `lib/recipes/sites.ts`, exactly: allrecipes.com "Allrecipes", foodnetwork.com "Food Network", seriouseats.com "Serious Eats", simplyrecipes.com "Simply Recipes", budgetbytes.com "Budget Bytes", halfbakedharvest.com "Half Baked Harvest", delish.com "Delish", tasteofhome.com "Taste of Home", eatingwell.com "EatingWell", bonappetit.com "Bon Appétit", epicurious.com "Epicurious", thekitchn.com "The Kitchn", food.com "Food.com", loveandlemons.com "Love and Lemons", cookieandkate.com "Cookie and Kate", pinchofyum.com "Pinch of Yum". A host matches if it equals the domain or ends with `.` + domain.
  - `type RecipeSource = 'sites' | 'spoonacular'`
  - `interface SearchHit { url: string; title: string }`; `interface WebSearchProvider { search(query: string, count: number): Promise<SearchHit[]> }`; `getWebSearch(): WebSearchProvider` (Brave via env `BRAVE_SEARCH_API_KEY`, server only; the fake when `RECIPE_SEARCH_FAKE === '1'`)
  - `interface RecipeOption { source: RecipeSource; url: string; site: string; title: string; image: string; rating: number | null; ratingCount: number | null; totalMinutes: number | null; servings: number | null; ingredients: string[]; structured: IngredientLine[] | null }`
  - `searchSpoonacular(query: string): Promise<RecipeOption[]>`: `GET https://api.spoonacular.com/recipes/complexSearch` with `query`, `number=8`, `addRecipeInformation=true`, `fillIngredients=true`, key from env `SPOONACULAR_API_KEY` (server only); maps `title`, `image`, `sourceUrl` (else `spoonacularSourceUrl`), `sourceName` (else "Spoonacular") → `site`, `readyInMinutes` → `totalMinutes`, `servings`, `extendedIngredients[].original` → `ingredients`, and `extendedIngredients[]` `{ name, amount, unit, aisle }` → `structured` (role from aisle: Meat → meat, Seafood → fish, Produce → produce, Milk/Eggs/Other Dairy and Cheese → dairy, Bakery/Bread → bakery, Frozen → frozen, else pantry); drops results without an image; HTTP 402 → throws `SourceLimitError`; the fake when `RECIPE_SEARCH_FAKE === '1'`
  - `searchSites(query: string): Promise<RecipeOption[]>`: web search for `"<query> recipe"` with count 20 → keep hits on `RECIPE_SITES` → fetch up to 8 pages in parallel with `fetchRecipePage` (5000 ms each) → `extractRecipeJsonLd` → drop pages without a Recipe or without an image → order by provider rank → at most 8 options, `source: 'sites'`, `structured: null`. Pages that fail are skipped silently.
  - `searchRecipes(query: string, source: RecipeSource): Promise<{ options: RecipeOption[]; source: RecipeSource; fellBack: boolean }>`: runs the chosen source; when `'sites'` returns no options and `SPOONACULAR_API_KEY` is set, returns Spoonacular's options with `source: 'spoonacular', fellBack: true`
  - `extractRecipeJsonLd(html: string): { name: string; servings: number | null; ingredients: string[]; steps: string[]; image: string | null; rating: number | null; ratingCount: number | null; totalMinutes: number | null } | null` (`image` may be a string, an array, or an `ImageObject`; take the first URL; `totalTime` ISO 8601 duration → minutes)
  - `fetchRecipePage(url: string, opts?: { timeoutMs?: number; maxBytes?: number }): Promise<string>` → throws `ImportError` with `code: 'bad_url' | 'blocked_host' | 'too_large' | 'timeout' | 'not_html' | 'fetch_failed'`. Defaults 8000 ms, 2 MB; http/https only; the resolved address must not be private, loopback, link-local or 169.254.169.254; at most 3 redirects, each re-checked.
  - `RecipeDraftSchema` (zod): `{ name: string; baseServings: number (1–24); ingredients: IngredientLine[] (1–60); vegSwap: VegSwap | null; sourceUrl: string | null; photo: { url: string; credit: string; creditUrl: string } | null }`; `type RecipeDraft`
  - `getModel(kind: 'parse')`: gateway model id from env `AI_MODEL_PARSE` (verify the current id with the Vercel MCP `list_ai_gateway_models`; cheapest Claude that passes the fixtures); the fake when `AI_FAKE === '1'`
  - `draftFromOption(option: RecipeOption, people: Person[]): Promise<RecipeDraft>`: uses `option.structured` when present (no AI call for lines), otherwise AI turns `option.ingredients` strings into `IngredientLine[]`; AI and adds `vegSwap` only when the household has someone who doesn't eat meat or fish and the meal has meat/fish; `photo = { url: option.image, credit: option.site, creditUrl: option.url }`; `sourceUrl = option.url`
  - `draftFromText(text: string, people: Person[]): Promise<RecipeDraft>` (pasted recipe, or a recipe URL: a value starting with `http` goes through `fetchRecipePage` + `extractRecipeJsonLd` first). When the result has no photo, call `searchRecipes(draft.name)` and use the first option's image, credited the same way; if none, `photo: null`
  - `resizeForUpload(file: Blob, maxEdge = 1600): Promise<Blob>` (browser canvas, JPEG quality 0.8) and `uploadMealPhoto(sb, householdId: string, mealId: string, file: Blob): Promise<string>` (path `<householdId>/<mealId>-<timestamp>.jpg` in bucket `meal-photos`; returns the storage path)
  - `checkCap(sb, householdId): Promise<{ ok: boolean; spentCents: number; capCents: number }>`; `recordUsage(sb, householdId, kind: 'parse' | 'estimate' | 'search', model: string, usage: { inputTokens: number; outputTokens: number }): Promise<void>` (AI cost from env `AI_PRICES_JSON`: `{ "<model>": { "in": centsPerMTok, "out": centsPerMTok } }`; a search costs env `SEARCH_COST_CENTS`, default `0.5`)
  - `estimateCents(items: { canonical: string; qty: Quantity }[], store: Store): Promise<Record<string, number>>` (cents per base unit, cached in `price_estimates`; prompt anchors to Tacoma, WA grocery prices)
  - `POST /api/recipes/search` `{ query: string; source: RecipeSource }` → `200 { options, source, fellBack }` | `402 { error: 'cap_reached' }` | `429 { error: 'source_limit' }` (Spoonacular's daily limit); saves `source` as the household's `recipe_source`
  - `POST /api/meals/draft` `{ mode: 'option'; option: RecipeOption } | { mode: 'text'; value: string }` → `200 RecipeDraft` | `402` | `422 { error: ImportError['code'] | 'unreadable' }`
  - `POST /api/estimates` `{ items, store }` → `200 Record<string, number>` | `402`

- [ ] **Step 1: Failing tests** (`jsonld.test.ts`) against saved fixtures: a `Recipe` inside an `@graph` array; two JSON-LD blocks where the second is the Recipe; `recipeYield: "4 servings"` → 4 and `["6","6 servings"]` → 6; `image` as a string, as an array, and as `{ "@type": "ImageObject", "url": … }` → first URL; `aggregateRating` `{ ratingValue: "4.7", ratingCount: "1,203" }` → 4.7 and 1203; `totalTime: "PT1H15M"` → 75; a page with no Recipe → `null`; malformed JSON in one block doesn't stop the next being read.
- [ ] **Step 2: Failing tests** (`import-url.test.ts`, with `fetch` and DNS mocked): `ftp://x` → `bad_url`; `http://127.0.0.1`, `http://10.0.0.5`, `http://[::1]`, `http://169.254.169.254` → `blocked_host`; a public host redirecting to `127.0.0.1` → `blocked_host`; a 3 MB body → `too_large` (stops reading at 2 MB); a response that never ends → `timeout` within 8.5 s; `content-type: application/pdf` → `not_html`.
- [ ] **Step 3: Failing tests** (`search.test.ts`, provider and page fetches faked): 20 hits with 10 on allowed sites (including `www.allrecipes.com` and `m.foodnetwork.com`) and one on `notallrecipes.com` → only allowed hosts are fetched; a page without a Recipe and a page without an image are dropped; a page that times out is skipped and the rest still return; at most 8 options, in provider order; `site` is the display name from `RECIPE_SITES`.
- [ ] **Step 3b: Failing tests** (`spoonacular.test.ts`, `fetch` mocked with fixture JSON): a result maps to a `RecipeOption` with `source: 'spoonacular'`, the source site's name and URL, minutes, servings, original ingredient strings and `structured` lines with roles from aisles ("Meat" → meat, "Produce" → produce, "Spices and Seasonings" → pantry); a result without `image` is dropped; HTTP 402 → `SourceLimitError`; `searchRecipes('x','sites')` with zero site options and the key set → Spoonacular options with `fellBack: true`; with the key unset → `{ options: [], fellBack: false }`; `draftFromOption` on a Spoonacular option makes no AI call for lines when the household has no vegetarian.
- [ ] **Step 4: Failing tests** (`usage.test.ts`, `draft-route.test.ts`, Supabase client mocked): spend 299 of 300 → `ok: true`; 300 → `ok: false`; both routes return 402 at the cap without calling the model or the provider; fake model returning schema-invalid JSON → 422 `unreadable` and nothing saved; an import error maps to 422 with its code; `draftFromOption` copies the option's image, site and URL into `photo` and `sourceUrl`; `draftFromText` with no image fills `photo` from the first search option.
- [ ] **Step 5: Failing test** (`photo-resize.test.ts`, jsdom with a canvas mock): a 4000×3000 image resizes to 1600×1200 JPEG; a 800×600 image is not enlarged.
- [ ] **Step 6:** Run `npx vitest run tests/unit` → FAIL. Implement (AI SDK `generateObject` with the schema; the AI fake returns `lib/fixtures/tacos.ts` for the tacos option and a schema-invalid object for input containing `"broken"`; the search fake returns fixture options for "tacos" and "pot pie" whose images are `https://images.example.test/<name>.jpg`, which e2e tests fulfil with `page.route`). Run → PASS.
- [ ] **Step 7:** Controller: set Vercel env vars with the Vercel MCP `create_project_env`: `AI_MODEL_PARSE`, `AI_PRICES_JSON`, `BRAVE_SEARCH_API_KEY` and `SPOONACULAR_API_KEY` (from the user), `SEARCH_COST_CENTS`. Commit `feat: recipe search with photos, import, price estimates, cap`.

### Task 7: This week, Add a meal, Favorites, repeat week

**Files:**
- Create: `app/(app)/week/page.tsx`, `app/(app)/week/add/page.tsx`, `app/(app)/favorites/page.tsx`, `components/DayRow.tsx`, `components/MealSheet.tsx`, `components/BudgetMeter.tsx`, `lib/db/queries/weeks.ts`, `lib/db/queries/meals.ts`, `lib/realtime.ts`, `lib/drafts.ts`
- Test: `e2e/week.spec.ts`, `tests/unit/drafts.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6.
- Produces:
  - `getOrCreateWeek(sb, householdId, weekStart: string): Promise<Week>`; `listWeekMeals(sb, weekId): Promise<WeekMeal[]>`; `setWeekMeal(sb, weekId, day: Day, slot: string, mealId: string | null, servingsOverride?: number | null)` (upsert on `(week_id, day, slot)`; `null` mealId deletes); `copyWeek(sb, fromWeekId, toWeekId)` (replaces target's meals)
  - `saveMeal(sb, householdId, draft: RecipeDraft & { isFavorite: boolean; everyoneVegetarian?: boolean }): Promise<Meal>` (copies `photo` into `photo_url/photo_credit/photo_credit_url`); `setMealPhoto(sb, mealId, photo: { path: string } | { url: string; credit: string; creditUrl: string })`; `mealPhotoSrc(sb, meal): string | null` (signed URL for an uploaded `photo_path`, else `photo_url`); `listFavorites(sb, householdId, opts?: { q?: string; filter?: 'vegetarian' | 'under15' | 'most' }): Promise<Meal[]>`; `updateMeal(sb, id, patch)`
  - `subscribeHousehold(householdId, tables: string[], onChange: () => void): () => void`
  - `saveDraft(key: string, value: unknown)`, `loadDraft<T>(key: string): T | null`, `clearDraft(key)` (localStorage, try/catch, 7-day expiry)

- [ ] **Step 1: Failing e2e** (`week.spec.ts`, both projects, `AI_FAKE=1`, `RECIPE_SEARCH_FAKE=1`, fixture images fulfilled with `page.route`): `/week` shows "This week", the date range for the current week, seven day rows with "+ Add dinner", budget meter at `$0 of $200`, and the "Build shopping list" button within the bottom 120 px of the viewport. Tap Thursday → Add meal opens on the Search tab → the toggle reads "Big sites" → type "tacos" → result cards each show a photo, title, site name, and rating or time when present → tap "Chicken tacos · Allrecipes" → preview shows the photo with "Photo: Allrecipes", an "Open the full recipe" link to the source URL, ingredients "Scaled to 3.8 servings" and the swap "Mom's portion: black beans" → "Save as a favorite" checked → "Add to Thursday" → Thursday row shows the tacos photo thumbnail, "Chicken tacos" and "Mom: black beans instead"; screenshots `week.png`, `search.png` and `add-meal.png`.
- [ ] **Step 1a: Failing e2e** (sources): switch the toggle to "Spoonacular" → results show the "Recipes from Spoonacular" footer; reload Add meal → the toggle is still on "Spoonacular"; a fake query that returns no site options shows the fallback note with Spoonacular results.
- [ ] **Step 1b: Failing e2e** (photos): a meal whose image fails to load shows an "Add a photo" tile instead of a broken image; "Change photo" → choose a file → the uploaded photo shows on the day row and in favorites, and the other phone sees it after reload; the Paste tab with plain recipe text saves a meal whose photo comes from the first search option.
- [ ] **Step 2: Failing e2e** (interruption): type "Chicken pot pie", wait for the draft, reload the page → the input and draft are restored; after "Add to Thursday" the draft is cleared.
- [ ] **Step 3: Failing e2e** (two phones): two browser contexts signed in as two members of one household both open `/week`; A sets Monday to a favorite → B sees it within 5 s without reload; A and B set Friday at the same moment → both end showing the same single meal after 5 s.
- [ ] **Step 4: Failing e2e**: `/favorites` lists the saved tacos with its photo thumbnail and tag "Veg swap"; search "taco" finds it; "+" adds it to the first empty day; "Repeat" on `/week` copies last week's meals into this week after a confirm.
- [ ] **Step 5: Failing unit test** (`drafts.test.ts`): `loadDraft` returns `null` after 7 days; `saveDraft` survives `localStorage.setItem` throwing (no crash).
- [ ] **Step 6:** Implement to the mockups. The meter on `/week` uses `listTotals` + `budgetState` over the current list (Task 8 supplies `useWeekList`; until then the meter reads `$0`). Tabs on Add meal are "Search", "Paste" and "Favorites" (the mockup's "Type it" becomes "Search"). Next to the search box, a two-option toggle "Big sites | Spoonacular" (44 px tall, remembered per household via `recipe_source`); a fallback note "Nothing on the big sites, so here's Spoonacular." when `fellBack`; when showing Spoonacular results, a footer link "Recipes from Spoonacular" to spoonacular.com (their free plan requires it); on `source_limit`, "Spoonacular's daily limit is used up. Big sites still works." Search shows skeleton cards while loading and "No recipes found on our sites. Try other words, or paste a recipe." when empty. Paste takes recipe text or a recipe link. Photos: `<img loading="lazy" referrerpolicy="no-referrer">` with the credit line under the preview photo; thumbnails 48 px on day rows and 56 px on favorites, `object-fit: cover`, rounded 10 px. Cooking steps are never copied: the preview links to the source page. Import and cap errors show plain messages: "We couldn't read that page. Try pasting the recipe text instead." and "This month's recipe help is used up. You can still type the ingredients in."
- [ ] **Step 7:** CI → PASS. Commit `feat: week, add meal, favorites, repeat week`.

### Task 8: Shopping list, staples, have-it, stores, estimates

**Files:**
- Create: `app/(app)/list/page.tsx`, `components/ListRow.tsx`, `components/StoreTabs.tsx`, `lib/db/queries/list.ts`, `lib/useWeekList.ts`
- Modify: `app/(app)/week/page.tsx` (meter wired to `useWeekList`), `app/(app)/household/page.tsx` (staples, always-have, category→store defaults)
- Test: `e2e/list.spec.ts`

**Interfaces:**
- Consumes: Tasks 3, 6, 7.
- Produces:
  - `useWeekList(weekId: string): { items: ListItem[]; totals: ReturnType<typeof listTotals>; state: BudgetState; loading: boolean; offline: boolean }`: loads week meals, people, staples, always-have, item state, store choices and estimates; calls `scaleMeal` + `buildShoppingList`; requests missing estimates from `/api/estimates` in one batch per store; subscribes via `subscribeHousehold`; caches the last list in localStorage per week and serves it when offline
  - `setItemState(sb, weekId, itemKey: string, patch: Partial<{ have_it: boolean; checked: boolean; outside_budget: boolean }>)`; `setItemStore(sb, householdId, canonical: string, store: Store)`; `setEstimate(sb, householdId, canonical, store, kind, centsPerBase, 'user')`
  - Default store by role when no category or item choice exists: everything → `fred_meyer`.

- [ ] **Step 1: Failing e2e** (`list.spec.ts`, both projects): with the tacos week from Task 7, `/list` shows store tabs with counts and estimated totals, a "Meat and seafood" heading with "Boneless chicken thighs" `11.2 oz`, "Black beans" `1 can`, "Corn tortillas" `12`, "Yellow onion" `1`; every price shows "estimate"; screenshot `list.png`.
- [ ] **Step 2: Failing e2e**: mark "Yellow onion" have-it → it moves to "Skipped, you have them" and the total drops by its estimate; after setting user prices so the week totals $201, the `/week` meter shows amber; at $226 it shows red.
- [ ] **Step 3: Failing e2e**: move "Corn tortillas" to Amazon → it appears under the Amazon tab and stays there next week; edit an estimate to $3.00 → label changes to "your price".
- [ ] **Step 4: Failing e2e**: with a staple "Milk, 1 gallon" added on `/household`, phone A checks off "Milk" → phone B sees it crossed off within 5 s; with the network offline (`context.setOffline(true)`) and a reload, the list still renders from cache with a quiet "Offline, showing your last list" line.
- [ ] **Step 5:** Implement to the mockup (sale banner and coupon lines hidden in phase 1; the bottom bar shows the week's estimated total and budget colour, with no button; "Review and fill carts" arrives in phase 2). Staples and always-have lists edited on `/household`.
- [ ] **Step 6:** CI → PASS. Commit `feat: shopping list, staples, stores, estimates`.

### Task 9: Install as an app, layout pass, launch

**Files:**
- Create: `app/manifest.ts`, `app/sw.ts`, `public/icons/*` (192, 512, maskable), `e2e/layout.spec.ts`
- Modify: `next.config.ts` (Serwist)
- Test: `e2e/layout.spec.ts`, `e2e/pwa.spec.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: installable app named "Basket", `display: standalone`, theme `#F7F8F5`, start URL `/week`; service worker precaches the app shell and caches `/list` for offline use; nothing else cached (no API responses besides what `useWeekList` stores).

- [ ] **Step 1: Failing e2e** (`layout.spec.ts`, all three projects incl. `android-small`): on `/week`, `/week/add`, `/favorites`, `/list`, `/household`, no horizontal scroll, every `button, a, input` is at least 44×44 px, and nothing is hidden under the bottom nav or the safe area; screenshots for every screen in every project.
- [ ] **Step 2: Failing e2e** (`pwa.spec.ts`, Chromium): `/manifest.webmanifest` has the fields above; a service worker registers on `/week`.
- [ ] **Step 3:** Implement; run all e2e in CI → PASS. Download the screenshot artifact with `gh run download` and send the iPhone 17 and Pixel screenshots to the user.
- [ ] **Step 4:** Connect the GitHub repo to a new Vercel project `basket` in team `waypoint` (Vercel MCP), set production env (Supabase URL and publishable key from the Supabase MCP, AI vars), deploy `main`; confirm the production URL loads `/login` and that `/api/test/login` returns 404 there.
- [ ] **Step 5:** Tag `v0.1.0` with release notes (`gh release create v0.1.0 --generate-notes`). Give the user the URL and the "Add to Home screen" steps for Android and iPhone.
- [ ] **Step 6:** Commit `feat: installable app, launch v0.1.0`.

---

## Self-review notes

- Spec coverage: households and invites (T4–5), people and portions (T2, T5), vegetarian swaps (T3, T6–7), three ways to add a meal (T6–7), favorites (T7), staples and pantry (T8), merged list (T3, T8), budget meter with cushion and confirm state (T3, T7–8), store split (T8), repeat week (T7), live sync (T7–8), install and offline (T8–9), AI cap (T6), device targets (T1, T9). Package math, live prices, sales, carts, coupons, Costco spreading and saved-this-week are phases 2–4 by design.
- The cart-confirm rule for red budgets lands with carts in phase 2; `budgetState` already returns `red`.
