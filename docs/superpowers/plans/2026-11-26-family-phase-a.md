# Family Features Phase (a) Implementation Plan — verdicts, won't eat and allergies, meal facts

## Changelog (revised 2026-11-26, after the pre-flight)

Resolves pre-flight B1–B5, I1–I14 and 16 of the 18 minors (M11 and M13 are under "Deferred minors" at the end), and folds in the audit triage, section 4 (S1) and section 5.

- **Header and Global Constraints:** ruling B1: build now on `family-a` (cut from `fm-cart`), release only after the cart has shipped; merge cadence, env, base and migrations restated against `fm-cart`; the cart's new spend guard (S1) takes 0008, so phase (a) is **0009** and Task 1 waits until the folder ends at 0008. The spec binds ("this plan wins" struck). Steps may travel in search and draft bodies (I1). e2e only through `scripts/e2e-local.sh`. One extra AI call is allowed, the paste retry without steps, and it takes its own hold from S1's spend guard.
- **Task 1:** migration is 0009; start-of-task guard (folder ends at `0008_spend_guard.sql`, else wait for S1; read `plan(N)` from the file); steps size check raised to 128 KB; the controller applies 0009 on its own after checking the migration history, records what is still pending, and regenerates types from the local stack.
- **Task 2:** matching algorithm rewritten (raw and singular tokens side by side; `not`, then `often`, then members, so the "oyster sauce" row can pass); `not` phrases listed; `SwapIdea = VegSwap`; first swap idea pinned per family and `[]` asserted for every allergen. Added by this revision: one member on its own ("cheddar") matches as typed on a won't-eat list and as its whole family on an allergy list.
- **Task 3:** `Person.allergies` is optional and read with `?? []`; the household and onboarding payload tests move here with exact `toEqual`; "often has" wording in the red box pinned; the forbidden-word test runs over every common allergen; pronoun uses `singular()`; `flagAmount` added.
- **Task 4:** `Meal.personChanges` is optional; one `eatersOf`; zod `PersonChangeSchema` reusing `VegSwapSchema`; `toMeal` drops bad entries; a person's swap line goes before the vegetarian swap line; changes also reach the vegetarian-swap food; `build-list` cases including a meal cached before this release; soup fixture.
- **Task 5:** household query work removed (done in Task 3); `addFood` tells empty from too long; the helper line sits inside the people section; no empty detail line for an allergy-only person. Audit: two-step Delete on a person (C1), busy flag on "Save staple" and its error cleared on a good load (B11, B19).
- **Task 6:** the "soup" fixtures are Spoonacular options with structured lines (B4); `people` is `null` until loaded and "Add to {Day}" is disabled until then, with a retry; Favorites rows carry the flag lines (owner confirmed 18:30); cards show at most three extra lines. Audit: search results survive a tab switch (P10).
- **Task 7:** `IngredientSwapSheet` (was `SwapSheet`, which the cart also uses); `draftAsMeal` carries `personChanges`; MealSheet block order fixed; `ideaNote` copy made computable; scoped allergy-wording test; release step gated on the cart.
- **Task 8:** `cleanRating`, `cleanCount`, `cleanFacts`, a 30,000-character total for steps; the option schema is capped at the clamp limits (above them: 400); the paste call gets its own schema, asks for at most 30 steps and retries once without steps; `SYSTEM` split; hyphens match as spaces; test cases written with status and body. Audit: ratings scaled by `bestRating` (B15), signed photo links reused for 50 minutes (P7), the retry goes through `ai_gate`.
- **Task 9:** a saved blank draft parses after a reload; `DraftPreview` can open in the editor; likes-only "Also saved" wording; "1 rating".
- **Task 10:** `isFetching` / `useFactsFetching`; each column written with `.is(column, null)`; exact route cases; Spoonacular-terms check before a2; release step gated. Audit: the backfill call keeps W1's single-flight.
- **Task 11:** "Everyone liked it · 1 didn’t try" (spec binds); `latestAnswer` ignores skipped and nobody-tried rows; `savedLine`.
- **Task 12:** `useDinnerToAsk` loads verdicts apart from the week (last 14 days, fails quietly) and loads the asked dinner's meal and photo by id (B5); `lib/realtime.ts` dropped from Files; queries ordered and deduped. Audit: no second realtime subscription, the week's one subscription gains `meal_verdicts`.
- **Task 13:** `seedPastDinner` uses the week row that contains the date; the edit to a non-existent "Made 1 time" assertion removed; test ids instead of position; release-ready step added.
- **Task 14:** version 0.3.0; the grep gate replaced by the scoped test; release gated on the cart. Audit: the "as built" list (C14).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each person gets a "won't eat" and an "allergy" list that flags recipes and dinners; every saved meal keeps its steps, time, method and rating; and the family can say how a dinner went in one tap, shown in words on Favorites and search.

**Architecture:** All judgment lives in pure functions under `lib/domain` (food families, flags, per-person changes in scaling, cooking method, verdict summaries), with table-driven unit tests; React components only render what those return. One additive migration (0009) adds a column to `people`, columns to `meals` and one household table, `meal_verdicts`, read and written with the signed-in user's session under row-level security. No new AI feature: the one existing paste-parse call also returns steps and minutes, and is tried once more without steps if that fails; both attempts pass the cart's spend guard.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Supabase Postgres/RLS/Realtime (user session only), `zod`, Vitest, Playwright, pgTAP. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-26-family-phase-a-design.md`, the mockups `/home/claude/basket-redesign/family/phase-a-mockups.png` and artboards `/home/claude/basket-redesign/family/canvas/project/01…13-*.dc.html` (not in the repo) (the artboards are the layout and copy reference: sizes, colours and strings are literal in them, amounts in them are samples), and `docs/superpowers/specs/2026-11-26-family-decisions.md` (owner's choices, including "Favorites rows carry allergy and won't-eat flag lines: YES"). Executors read all of them. **The spec binds.** This plan decides only what the spec leaves open; if an executor finds the two disagree, stop and tell the controller.

**Branch, base and release (ruling B1: build now, release later):**
- **Base.** Work is on branch `family-a` in `/home/claude/basket-family`. It was cut from `fm-cart` at `fade19e`, which has cart Tasks 1–5, `main`, and the live "Fits this week" code. Cart Tasks 6–10 are still to land on `fm-cart`.
- **Merge cadence.** After each cart task lands on `fm-cart`, the controller merges `fm-cart` into `family-a` (a merge, never a rebase) between two phase (a) tasks and re-runs the four checks. Implementers never merge. Expect hand-merges in `app/(app)/household/HouseholdScreen.tsx`, `lib/db/queries/household.ts`, `lib/ai/schemas.ts`, `lib/db/types.ts` and the `plan(N)` line of `supabase/tests/rls_test.sql` (cart Tasks 7–9 edit them too).
- **Release gate.** Nothing from `family-a` reaches `main` before the cart's own release (cart Task 10). Then a1, a2 and a3 ship in that order, one at a time. The controller tags `a1-ready` after Task 7, `a2-ready` after Task 10 and `a3-ready` after Task 14. **To release aN: only after fm-cart has shipped to main; merge main first** (`git checkout -b release/aN aN-ready && git merge main`), run the four checks and `scripts/e2e-local.sh`, merge `release/aN` into `main`, deploy, check production, then the next one. If the build finishes before the cart ships, the three releases wait and still go out in order.
- **Env.** Phase (a) adds no environment variables and no secrets. `family-a` carries the cart's code; its production variables (`KROGER_TOKEN_KEY`, `KROGER_REDIRECT_URI`) are set in cart Task 10, not here. Local and CI runs use the fakes that `scripts/e2e-local.sh` exports (`AI_FAKE`, `RECIPE_SEARCH_FAKE`, `KROGER_FAKE`, `SPOONACULAR_API_KEY`).
- **Migrations.** `fm-cart`'s migrations end at `0007_item_keys_by_food.sql` today. The audit added cart task **S1 (spend guard), which takes `0008_spend_guard.sql`**, so phase (a) is **`0009_family_phase_a.sql`**. (The spec still says "migration 0008"; read it as 0009.) Production has 0006; 0007 is written but not applied (cart Task 10 applies it after the cart deploy; it creates no tables); S1's controller step applies 0008. 0009 depends on neither and is applied to production on its own in Task 1. **Stop condition: the migrations folder must end at 0008 (S1's spend guard) before 0009 is added.** If `ls supabase/migrations | tail -1` is not `0008_spend_guard.sql`, S1 has not been merged into `family-a` yet: Task 1 waits for it (do Tasks 2 and 11 meanwhile, they need neither), and if the folder ends at anything else, stop and tell the controller.
- **Spend guard (S1).** S1 replaces the cap check with `ai_gate` (`trusted` households, a shared daily pool for the rest, atomic holds): `requireHouseholdWithinCap` answers 402 for `cap` and 429 for `slow` or `busy`. Every paid call this plan touches goes through it. Phase (a) adds one: the paste retry in Task 8, which takes its own hold. Task 8 therefore also waits for S1. `POST /api/meals/facts` (Task 10) makes no paid call (no AI, no Brave) and uses plain `requireHousehold`.
- **Weak-signal work (W1).** Cart task W1 makes `useWeekData` and `useWeekList` single-flight. Tasks 10 and 12 come after it, keep it, and add no second realtime subscription.
- **Version.** The branch says 0.1.0; the cart release sets 0.2.0; Task 14 sets 0.3.0.
- **Faster without loss.** Tasks 2 and 11 are pure `lib/domain`, touch no file the cart touches and need neither the migration nor a merge from `fm-cart`; both can be done while Task 1 waits for S1. One helper at a time still holds.

## Global Constraints

- Read `AGENTS.md` first: this Next.js differs from older versions. Check `node_modules/next/dist/docs/` before using route handlers, `cookies()` or `searchParams`.
- No Supabase service-role key. Every database call uses the signed-in user's session and row-level security. No secrets in client code. Never open `.env*` files.
- Migrations only add. Nothing existing is dropped, renamed or tightened.
- `lib/domain/*` is pure: no imports from `lib/db`, `lib/kroger`, `lib/recipes`, `lib/ai`, React or Next. (`lib/week/format.ts` imports only domain types, so `lib/domain/method.ts` may import `formatMinutes` from it.) Server-only modules start with `import 'server-only'`.
- No new AI feature. AI stays behind `lib/ai/provider.ts` and the household cap. The only added model call is the paste retry without steps (Task 8), and like every paid call it goes through S1's `ai_gate` before it runs. Every flow in this plan works with the cap reached, and for a household the gate answers `slow` or `busy`.
- **Allergy wording:** the strings "safe", "nut-free", "allergen-free", "no allergens" and "free of" never appear in allergy copy. A recipe with no match shows nothing. Every allergy flag includes the words "check labels" or "check every label". Leave-out and swap are never offered for an allergy. An allergy warning never depends on a request that can fail quietly: where people have not loaded, adding is disabled.
- Kids' data: only `name`, `age`, `dislikes`, `allergies` on `people`. Nothing about people is sent to any outside service (AI, Brave, Spoonacular, Kroger, logs).
- **Recipe steps** are stored only on the household's own `meals` row. They may pass between the server and the signed-in browser inside the search response and the draft request and response; they are never logged, never cached in a shared table and never put in an AI prompt. The source name and link are shown wherever steps are mentioned.
- **Old shapes keep working.** `Person.allergies` and `Meal.personChanges` are optional in the types and always read with `?? []`: a shopping list cached on a phone before this release (and every existing test literal) has neither.
- Current look only: existing colour tokens, `lib/ui.ts` strings (`pillButton`, `primaryButton`, `textInput`, `focusRing`), `Sheet`, `MealThumb`. Inline hex values already in the artboards are allowed (`#A6261B`, `#FDE8E6`, `#EEF0ED`, `#4A544F`, `#134D31`, `#2C5A42`, `#EAEEE9`, `#D5DBD5`, `#F0F2EF`). No dark styles. Do not restyle existing screens beyond what a task names.
- Touch targets ≥ 44 px both ways, inputs 16 px text, contrast ≥ 4.5:1, real `button`/`a`/`label` elements, no sideways scroll at 360 px. Colour never carries meaning alone: an allergy always has the warning icon and the word "allergy".
- Copy is fixed where quoted (curly apostrophes as written). A person whose name is shared by someone else in the household is written with their age: "Daughter (4)".
- Lists: at most 30 foods per person per list, each 1–40 characters after trimming, stored lower case, no duplicates (case-insensitive).
- Existing tests keep passing. An existing assertion may change only where a task says so; list each changed assertion in the commit body.
- Every task ends with `npm run lint && npm run typecheck && npm test && npm run build` green ("the four checks") and one commit, with the two trailer lines shown in each commit step. pgTAP runs with `npx supabase test db` if the local stack is up, otherwise in CI.
- **e2e runs only through `scripts/e2e-local.sh <spec>`**, for implementers and the controller alike. It builds against the local Supabase and refuses anything else; an earlier run hit production by mistake. Never run `npx playwright test` or `npm run test:e2e` by hand. The script needs the local stack (`npx supabase start`); if it cannot run, leave the run to CI (which starts its own local stack) and say so in the commit body. New specs create their own household, never pick a Fred Meyer store and never send a cart.
- Steps marked **controller** (production Supabase, Vercel, merges from `fm-cart`, releases) are not the implementer's.

## Review Focus

1. **A food word hiding inside another food** ("butternut squash", "nutmeg", "coconut milk", "eggplant", "oyster mushrooms", "peanut butter" for a milk allergy, "black pepper" for peppers): no flag; and the reverse ("almond flour", "pine nuts", "ghee", "tahini", "pesto"): flagged. A person expects neither false alarms on every squash recipe nor a miss on almond flour. → table tests in Task 2.
2. **A person removed or renamed after choices were saved, and a phone that has not caught up** (a `person_changes` entry or a vote for an id that no longer exists; a guest added later; a list cached before this release, whose meals have no `personChanges` and whose people have no `allergies`): scaling ignores the unknown id, the note doesn't print "undefined", "4 of 5" still reads from the stored votes, the new person simply has no vote, and the cached list opens. → tests in Tasks 3, 4 and 11.
3. **Both phones answer the same dinner, or one answers while the other skips**: one row per dinner; the last write wins without an error on either phone; the card disappears on both; an answered verdict is never downgraded to skipped. → pgTAP in Task 1, query test in Task 12, e2e in Task 13.
4. **A recipe page with odd or huge instructions or numbers** (300 steps, a 20,000-character step, HTML in a step, `HowToSection` nesting, no instructions, time of 0 or 3 days, a rating of 92 or 8.5, a count of 812.5): at most 60 steps of at most 1,000 characters and 30,000 in total, tags stripped, minutes kept only within 1–2,880, rating only within 0–5, and the meal still saves. → tests in Task 8.
5. **A dinner moved, removed or repeated after it was asked about**, and the week boundary: a verdict belongs to (meal, date), so taking Wednesday's meal off the week doesn't lose it and doesn't re-ask; the same meal on two nights has two answers; a dinner on the last day of last week is still asked about, with its name and photo, on the first day of this week. → tests in Tasks 11 and 12.

---

## File Structure

```
supabase/migrations/0009_family_phase_a.sql   people.allergies, meals facts + person_changes, meal_verdicts, default privileges
supabase/tests/rls_test.sql                   (modified) cross-household tests for the above
lib/domain/words.ts          singular(), rawWords(), words() — moved out of lib/recipes/search/overlap.ts
lib/domain/families.ts       FAMILIES, COMMON_ALLERGENS, familyFor, coversLine, matchFood, swapIdeas, cleanFood
lib/domain/flags.ts          findFlags, ingredientNames, flagAmount, personLabel, namesLabel, flagCopy, allergyCopy
lib/domain/types.ts          (modified) Person.allergies?, SwapIdea, PersonChange, Meal.personChanges?, CookMethod, MealFacts
lib/domain/scaling.ts        (modified) eatersOf(); scaleMeal honours personChanges
lib/domain/method.ts         cookMethod, cleanSteps, cleanMinutes, cleanRating, cleanCount, cleanFacts, factsLine
lib/domain/verdicts.ts       Vote, Verdict, summarize, verdictWords, savedLine, mealLine, isRetired, dinnerToAsk, orderFavorites, madeLines
lib/domain/weeks.ts          (modified) dinnerDate(), todayIn()
lib/fixtures/soup.ts         the mushroom soup used by unit tests and the fake search
lib/week/note.ts             (modified) changeNotes; dayNote appends per-person changes
lib/db/queries/household.ts  (modified) allergies in toPerson
lib/db/queries/meals.ts      (modified) toMeal, saveMeal, setPersonChanges, toFacts, setMealFacts, listMealsBySource
lib/db/queries/verdicts.ts   listVerdicts, saveVerdict, skipVerdict, listDinnerDates
lib/ai/schemas.ts, lib/ai/recipes.ts, lib/ai/fake.ts          (modified) PersonChangeSchema, TextRecipeSchema, facts through the draft
lib/recipes/jsonld.ts, lib/recipes/search/spoonacular.ts, index.ts, provider.ts, clamp.ts, fake.ts   (modified) steps on options, fixtures
lib/add-meal-saved.ts          (modified) a saved blank draft parses
app/api/meals/facts/route.ts   backfill one meal's facts from its source page
lib/list/facts-client.ts       which meals to backfill, three at a time, and which are in flight
components/household/FoodChips.tsx     chips + add box for one list
app/(app)/household/PersonEditor.tsx, HouseholdScreen.tsx, components/PersonRow.tsx, components/household/StaplesSection.tsx   (modified)
components/flags/FlagLines.tsx         the lines on a search card and a Favorites row
components/flags/AllergyBox.tsx        the red box
components/flags/DislikeBox.tsx        the grey box, and its green "done" state
components/flags/IngredientSwapSheet.tsx   "Instead of mushrooms" (not the cart's components/SwapSheet.tsx)
components/MealFacts.tsx, components/MealFactsSheet.tsx
components/verdicts/VerdictCard.tsx, VerdictSheet.tsx, useDinnerToAsk.ts
components/add-meal/SearchTab.tsx, DraftPreview.tsx, AddMealScreen.tsx, PasteTab.tsx   (modified)
components/MealSheet.tsx, DayRow.tsx, WeekScreen.tsx, useWeekData.ts, FavoritesBrowser.tsx   (modified)
e2e/family-flags.spec.ts, e2e/meal-facts.spec.ts, e2e/verdicts.spec.ts, e2e/helpers/household.ts, e2e/helpers/db.ts
```

**One order for the meal sheet** (Tasks 7, 9 and 12 each add a block): photo row, the note, allergy box, dislike boxes, facts line, "Last time" line, "Open the full recipe", then the existing controls.

**Commit trailers.** Every commit in this plan ends with these two lines, as its own last paragraph (each commit step shows them):

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ
```

---

### Task 1: Migration 0009, row-level security tests, types

**Files:**
- Create: `supabase/migrations/0009_family_phase_a.sql`
- Modify: `supabase/tests/rls_test.sql` (raise `plan(N)` by the number of tests added; read N from the file, it was 149 when the branch was cut and cart tasks may raise it), `lib/db/types.ts`, `lib/db/rows.ts`
- Test: `supabase/tests/rls_test.sql`

**Interfaces:**
- Produces (SQL):
  - `people.allergies text[] not null default '{}'` with `check (cardinality(allergies) <= 30)`.
  - `meals`: `steps jsonb` (null = not known) `check (steps is null or (jsonb_typeof(steps) = 'array' and pg_column_size(steps) < 131072))` (room for the 30,000 characters Task 8 allows, at four bytes each); `total_minutes int check (total_minutes between 1 and 2880)`; `method text check (method in ('stovetop','oven','slow_cooker','pressure_cooker','grill','no_cook'))`; `make_ahead boolean not null default false`; `rating numeric check (rating >= 0 and rating <= 5)`; `rating_count int check (rating_count >= 0)`; `likes int check (likes >= 0)`; `person_changes jsonb not null default '[]' check (jsonb_typeof(person_changes) = 'array' and pg_column_size(person_changes) < 8192)`; `facts_checked_at timestamptz`.
  - `meal_verdicts`: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `household_id uuid not null references households on delete cascade`, `meal_id uuid not null`, `eaten_on date not null`, `status text not null check (status in ('answered','skipped'))`, `votes jsonb not null default '{}' check (jsonb_typeof(votes) = 'object' and pg_column_size(votes) < 4096)`, `updated_at timestamptz not null default now()`, `updated_by uuid references auth.users on delete set null default auth.uid()`, `unique (meal_id, eaten_on)`, `foreign key (meal_id, household_id) references meals (id, household_id) on delete cascade`, index on `(household_id)`. RLS on; `revoke all … from anon, authenticated`; grant `select, insert, update, delete` to `authenticated`; four policies, each `public.is_member(household_id)` (update has both `using` and `with check`).
  - Trigger `meal_verdicts_keep_answer` (before update): if `old.status = 'answered' and new.status = 'skipped'` then `new := old` (an answer is never downgraded); always sets `new.updated_at = now()`.
  - `alter publication supabase_realtime add table public.meal_verdicts;`
  - Backlog T4: `alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;` (0006's and 0008's tables grant by name or not at all and 0007 creates none, so nothing existing or pending relies on the default. This is the second half of audit SEC-9. S1 adds the "every table in `public` has row-level security" test; do not write it again.)
- Produces (TypeScript): `Database` types with the above; in `lib/db/rows.ts` add `export type VerdictRow = Row<"meal_verdicts">;`

- [ ] **Step 0: Check the base.** `ls supabase/migrations | tail -1` must print `0008_spend_guard.sql`. If it prints `0007_item_keys_by_food.sql`, S1 has not landed: this task waits (Tasks 2 and 11 can go first). Anything else: stop and tell the controller. Note the current `plan(N)` in `rls_test.sql` (S1 raises it).
- [ ] **Step 1: Write the failing pgTAP tests** in `rls_test.sql`, after the block where C joins HA. In `pg_temp.seed`, add `insert into public.meal_verdicts (household_id, meal_id, eaten_on, status) values (h, m, '2026-11-25', 'skipped');`. Tests:
  - A selects 1 `meal_verdicts` row; `select count(*) … where household_id = HB` as A = 0.
  - A `insert into public.meal_verdicts` for HB (HB's meal) → `42501`. A insert for HA with HB's `meal_id` → `23503`.
  - A `update public.meal_verdicts set status = 'answered', votes = '{"x":"up"}' where household_id = HB` changes 0 rows; verified as B (still `skipped`).
  - A updates HA's row to `answered` with votes; C (same household) reads `answered`; C then `update … set status = 'skipped'` and the row still reads `answered` with the same votes.
  - A second insert for the same `(meal_id, eaten_on)` → `23505`.
  - `status = 'maybe'` → `23514`; `votes = '[]'` → `23514`.
  - `update public.people set allergies = array['tree nuts']` on HA's person as A works; on HB's person changes 0 rows; 31 allergies → `23514`.
  - `update public.meals set method = 'microwave'` → `23514`; `total_minutes = 0` → `23514`; `rating = 9.2` → `23514`; `steps = '{}'` → `23514`; `person_changes = '{}'` → `23514`; valid values on HA's meal succeed and read back.
  - As anon: `select count(*) from public.meal_verdicts` → `42501`.
  - Default privileges: as the superuser `create table public.t_probe (id int)`; `select ok(not has_table_privilege('authenticated', 'public.t_probe', 'select'))` and the same for `anon`.
- [ ] **Step 2: Write `0009_family_phase_a.sql`** as in Interfaces, with a header comment saying it only adds and depends on neither 0007 nor 0008. Run `npx supabase test db` if the local stack starts. Expected: all tests pass.
- [ ] **Step 3: Update `lib/db/types.ts` by hand** to match (new columns in `people` and `meals` Row/Insert/Update; the `meal_verdicts` table) and add `VerdictRow`. Run the four checks. Expected: green.
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_family_phase_a.sql supabase/tests/rls_test.sql lib/db/types.ts lib/db/rows.ts
git commit -m "feat(db): allergies, meal facts and family verdicts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

- [ ] **Step 5 (controller): apply 0009 to production on its own.** First list the production migration history through the Supabase MCP and write down which of 0007 and 0008 are there (0007 waits for cart Task 10; 0008 is applied by S1's own controller step and may or may not have run). Note how versions are named so 0009 is recorded the same way and the pending ones can still be applied later under their own names. Apply 0009 (it only adds and needs neither; the live version keeps working). Record in the ledger what is still pending and whose step applies it. Run the security advisors. Regenerate `lib/db/types.ts` from the local stack (which has 0007, 0008 and 0009) and replace the hand-edited file if it differs. This step ships no code: nothing from `family-a` reaches `main` here.

---

### Task 2: Food families (pure)

**Files:**
- Create: `lib/domain/words.ts`, `lib/domain/families.ts`
- Modify: `lib/recipes/search/overlap.ts` (import `singular` and `words` from `@/lib/domain/words`; delete its private copies; no behaviour change), `lib/domain/types.ts` (one line: `export type SwapIdea = VegSwap;`)
- Test: `tests/unit/families.test.ts` (existing `tests/unit/overlap.test.ts` must pass untouched)

**Interfaces:**
- Produces:
  - `words.ts`: `export function singular(w: string): string` (moved verbatim); `export function rawWords(s: string): string[]` (lower case, split on non-letters, nothing else); `export function words(s: string): string[]` (`rawWords(s).map(singular)`, same result as today).
  - `families.ts`:
    ```ts
    export interface Family {
      id: string;            // 'tree_nut'
      label: string;         // 'tree nut'   (used in "Tree nut allergy", "tree nut" beside an ingredient)
      plural: string;        // 'tree nuts'  (chip text, "Tree nuts covers …", "in them")
      members: string[];     // foods that are it: 'almond', 'pine nut'
      often: string[];       // prepared foods that usually contain it: 'pesto'
      not: string[];         // phrases that look like it but are not: 'water chestnut', 'coconut milk'
      examples: string[];    // three or four members for the "covers" line, in order
    }
    export const FAMILIES: readonly Family[];
    export const COMMON_ALLERGENS: readonly string[]; // ['peanuts','tree nuts','milk','eggs','wheat','soy','fish','shellfish','sesame']
    export function cleanFood(typed: string): string | null;        // trim, collapse spaces, lower case; null if empty or over 40 chars
    export function familyFor(food: string): Family | null;         // by plural, label or any member, singular or plural
    export function coversLine(food: string, opts?: { wide?: boolean }): string | null; // "Mushrooms covers cremini, portobello, shiitake and the rest."
    export interface FoodHit { found: string; often: boolean }      // found = the ingredient's own words that matched, as written, lower case
    export function matchFood(food: string, ingredient: string, opts?: { wide?: boolean }): FoodHit | null;
    export function swapIdeas(food: string): SwapIdea[];             // at most 3; SwapIdea is VegSwap (lib/domain/types.ts)
    ```
- **Which family a food stands for.** A food *names* a family when it equals the family's `plural` or `label` (singular or plural, any case): "mushrooms", "tree nut", "milk". A single member ("cremini", "almonds", "cheddar") names its family only with `wide: true`. Allergy lists are read wide (an almond allergy is flagged on walnuts, on the cautious side); won't-eat lists are not (a child who won't eat cheddar is not flagged on every recipe with milk). `familyFor` itself always answers from any name; it is used for labels.
- **Matching algorithm** (the tests do not fully determine it). Tokenise the ingredient twice, same positions: `rawWords(ingredient)` (as written) and `words(ingredient)` (singular). Match on the singular tokens; build `found` from the raw tokens at the matched positions. If the food stands for a family: (1) blank every occurrence of each `not` phrase; (2) find each `often` phrase as consecutive whole words, remember it and blank it; (3) find each `members` phrase as consecutive whole words (longest first): if any, return `{ found, often: false }`; (4) otherwise, if step 2 found one, return `{ found, often: true }`. If the food stands for no family: match `words(food)` as consecutive whole words. `found` is the longest run of adjacent matched words ("cremini mushrooms" is two member words side by side; "sliced almonds" gives "almonds"; "almond flour" gives "almond").
- Families required (ids): `mushroom`, `tree_nut`, `peanut`, `milk`, `egg`, `wheat`, `soy`, `fish`, `shellfish`, `sesame`, `olive`, `onion`, `pepper` (bell and chili; the bare word "pepper" is not a member), `tomato`, `cilantro`, `bean`. Others may be added.
- `not` phrases, at least these (whole words keep "butternut", "nutmeg", "coconut", "doughnut", "eggplant", "buckwheat" and "goldfish" out already):

  | Family | `not` |
  |---|---|
  | `tree_nut` | water chestnut |
  | `milk` | coconut milk, almond milk, oat milk, soy milk, rice milk, cashew milk, coconut cream, peanut butter, almond butter, cashew butter, sunflower butter, nut butter, apple butter, cocoa butter, butter lettuce, butter bean, cream of tartar |
  | `wheat` | almond flour, coconut flour, rice flour, corn flour, oat flour, chickpea flour, tapioca flour, corn tortilla, rice noodle, rice paper |
  | `shellfish` | oyster mushroom |
  | `pepper` | black pepper, white pepper, ground pepper, salt and pepper, pepper jack |
  | `bean` | green bean, vanilla bean, coffee bean, bean sprout |

- Swap ideas exist only for the seven non-allergen families; every allergen family returns `[]`. First idea of each, pinned (the controller may change a food here before this task starts; the test pins whatever this table says):

  | Family | First idea (`canonical`, `amountPerServing`, `unit`, `role`) |
  |---|---|
  | `mushroom` | zucchini, 0.25, each, produce (then white beans, 0.25, cup, veg_protein; carrots, 0.5, each, produce) |
  | `olive` | capers, 0.5, tbsp, pantry |
  | `onion` | celery, 0.5, each, produce |
  | `pepper` | zucchini, 0.25, each, produce |
  | `tomato` | carrots, 0.5, each, produce |
  | `cilantro` | parsley, 0.1, bunch, produce |
  | `bean` | lentils, 0.25, cup, veg_protein |

- [ ] **Step 1: Write the failing tests** (`tests/unit/families.test.ts`), table-driven with `it.each`:

```ts
// flagged, not "often"
it.each([
  ['mushrooms', '8 oz cremini mushrooms', 'cremini mushrooms'],
  ['mushrooms', '2 portobello caps', 'portobello'],
  ['mushrooms', 'shiitake', 'shiitake'],
  ['tree nuts', '1/4 cup sliced almonds', 'almonds'],
  ['tree nuts', '2 cups almond flour', 'almond'],
  ['tree nuts', '3 tbsp pine nuts', 'pine nuts'],
  ['tree nuts', 'chopped walnuts', 'walnuts'],
  ['tree nuts', '1 cup cashews', 'cashews'],
  ['peanuts', '2 tbsp peanut butter', 'peanut'],
  ['milk', '1 cup whole milk', 'milk'],
  ['milk', '2 tbsp ghee', 'ghee'],
  ['milk', '4 oz brie', 'brie'],
  ['milk', 'grated parmesan', 'parmesan'],
  ['eggs', '2 large eggs', 'eggs'],
  ['wheat', '1 lb spaghetti', 'spaghetti'],
  ['wheat', '2 cups all-purpose flour', 'flour'],
  ['soy', '14 oz firm tofu', 'tofu'],
  ['fish', '2 anchovy fillets', 'anchovy'],
  ['shellfish', '1 lb shrimp', 'shrimp'],
  ['sesame', '2 tbsp tahini', 'tahini'],
])('%s is found in "%s"', (food, line, found) => {
  expect(matchFood(food, line)).toEqual({ found, often: false });
});
// flagged as "often has"
it.each([
  ['tree nuts', '1/2 cup pesto'], ['tree nuts', 'marzipan'], ['fish', '1 tbsp worcestershire sauce'],
  ['wheat', '2 tbsp soy sauce'], ['eggs', '1/4 cup mayonnaise'], ['sesame', '1 cup hummus'], ['shellfish', 'oyster sauce'],
])('%s is often in "%s"', (food, line) => expect(matchFood(food, line)?.often).toBe(true));
// never flagged
it.each([
  ['tree nuts', '1 butternut squash'], ['tree nuts', '1/4 tsp nutmeg'], ['tree nuts', '1 can coconut milk'],
  ['tree nuts', 'water chestnuts'], ['tree nuts', '2 tbsp peanut butter'], ['tree nuts', '1 doughnut'],
  ['peanuts', 'sliced almonds'], ['milk', '1 can coconut milk'], ['milk', 'almond milk'], ['milk', 'oat milk'],
  ['milk', 'peanut butter'], ['milk', 'cream of tartar'], ['milk', 'butternut squash'], ['milk', 'butter lettuce'],
  ['eggs', '1 eggplant'], ['wheat', 'buckwheat groats'], ['wheat', 'almond flour'], ['wheat', 'corn tortillas'],
  ['wheat', 'rice noodles'], ['shellfish', 'oyster mushrooms'], ['fish', 'goldfish crackers'], ['mushrooms', 'cream of chicken soup'],
])('%s is not found in "%s"', (food, line) => expect(matchFood(food, line)).toBeNull());

it('matches a typed food outside the table as whole words, singular or plural', () => {
  expect(matchFood('beets', '3 medium beets')).toEqual({ found: 'beets', often: false });
  expect(matchFood('beet', '3 medium beets')?.found).toBe('beets');
  expect(matchFood('beets', 'beetroot powder')).toBeNull();
});
it('finds a family from any of its names', () => {
  for (const f of ['mushroom', 'Mushrooms', 'cremini']) expect(familyFor(f)?.id).toBe('mushroom');
  for (const f of ['tree nuts', 'tree nut', 'almonds', 'pecan']) expect(familyFor(f)?.id).toBe('tree_nut');
  expect(familyFor('beets')).toBeNull();
});
it('spells out what a family covers', () => {
  expect(coversLine('Mushroom')).toBe('Mushrooms covers cremini, portobello, shiitake and the rest.');
  expect(coversLine('tree nuts')).toBe('Tree nuts covers almonds, walnuts, pecans, cashews and the rest.');
  expect(coversLine('beets')).toBeNull();
});
it('offers up to three swap ideas, none in the same family, and none at all for an allergen', () => {
  expect(swapIdeas('mushrooms')).toEqual([
    { canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' },
    { canonical: 'white beans', amountPerServing: 0.25, unit: 'cup', role: 'veg_protein' },
    { canonical: 'carrots', amountPerServing: 0.5, unit: 'each', role: 'produce' },
  ]);
  expect(swapIdeas('beets')).toEqual([]);
  for (const a of COMMON_ALLERGENS) expect(swapIdeas(a)).toEqual([]);
  const first = (plural: string) => swapIdeas(plural)[0];
  expect(first('olives')).toEqual({ canonical: 'capers', amountPerServing: 0.5, unit: 'tbsp', role: 'pantry' });
  expect(first('onions')).toEqual({ canonical: 'celery', amountPerServing: 0.5, unit: 'each', role: 'produce' });
  expect(first('peppers')).toEqual({ canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' });
  expect(first('tomatoes')).toEqual({ canonical: 'carrots', amountPerServing: 0.5, unit: 'each', role: 'produce' });
  expect(first('cilantro')).toEqual({ canonical: 'parsley', amountPerServing: 0.1, unit: 'bunch', role: 'produce' });
  expect(first('beans')).toEqual({ canonical: 'lentils', amountPerServing: 0.25, unit: 'cup', role: 'veg_protein' });
  for (const f of FAMILIES) {
    expect(swapIdeas(f.plural).length).toBeLessThanOrEqual(3);
    for (const i of swapIdeas(f.plural)) expect(matchFood(f.plural, i.canonical)).toBeNull();
  }
});
it('cleans what is typed', () => {
  expect(cleanFood('  Tree   Nuts ')).toBe('tree nuts');
  expect(cleanFood('   ')).toBeNull();
  expect(cleanFood('x'.repeat(41))).toBeNull();
});
it('lists the nine common allergens, each with a family', () => {
  expect(COMMON_ALLERGENS).toEqual(['peanuts', 'tree nuts', 'milk', 'eggs', 'wheat', 'soy', 'fish', 'shellfish', 'sesame']);
  for (const a of COMMON_ALLERGENS) expect(familyFor(a)).not.toBeNull();
});
// added by the revision
it.each([
  ['peppers', '1/2 tsp black pepper'], ['peppers', 'salt and pepper'], ['beans', '1 vanilla bean'],
  ['milk', '1 cup soy milk'], ['milk', '2 tbsp almond butter'], ['wheat', '1 cup rice flour'],
])('%s is not found in "%s" either', (food, line) => expect(matchFood(food, line)).toBeNull());
it('a real member beside a prepared food wins over "often"', () => {
  expect(matchFood('tree nuts', '1/2 cup pesto with pine nuts')).toEqual({ found: 'pine nuts', often: false });
  expect(matchFood('peppers', '1 red bell pepper')?.often).toBe(false);
});
it('one member on its own is matched as typed, and as its family only when asked wide', () => {
  expect(matchFood('cheddar', '4 oz sharp cheddar')).toEqual({ found: 'cheddar', often: false });
  expect(matchFood('cheddar', '1 cup whole milk')).toBeNull();
  expect(matchFood('cheddar', '1 cup whole milk', { wide: true })).toEqual({ found: 'milk', often: false });
  expect(matchFood('almonds', '1/2 cup pesto', { wide: true })?.often).toBe(true);
  expect(coversLine('cheddar')).toBeNull();
  expect(coversLine('almonds', { wide: true })).toBe('Tree nuts covers almonds, walnuts, pecans, cashews and the rest.');
});
it('keeps the words as written', () => {
  expect(rawWords('8 oz Cremini Mushrooms')).toEqual(['oz', 'cremini', 'mushrooms']);
  expect(words('8 oz Cremini Mushrooms')).toEqual(['oz', 'cremini', 'mushroom']);
});
```

- [ ] **Step 2: Run to see them fail.** Run: `npx vitest run tests/unit/families.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Move `singular`/`words` to `lib/domain/words.ts`, add `rawWords`, then write `families.ts`** with the algorithm and the two tables above.
- [ ] **Step 4: Run.** `npx vitest run tests/unit/families.test.ts tests/unit/overlap.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/domain/words.ts lib/domain/families.ts lib/domain/types.ts lib/recipes/search/overlap.ts tests/unit/families.test.ts
git commit -m "feat: food families for won't-eat and allergy matching" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 3: Flags and their words (pure)

**Files:**
- Create: `lib/domain/flags.ts`, `lib/fixtures/soup.ts` (`soup: Meal`, "White bean and mushroom soup", `baseServings: 4`, ingredients: cremini mushrooms 8 oz produce; white beans 2 can veg_protein; yellow onion 1 each produce; `vegSwap: null`; used by Tasks 3, 4, 6 and 7)
- Modify: `lib/domain/types.ts` (add `allergies?: string[]` to `Person`; optional on purpose, see Global Constraints), `lib/db/queries/household.ts` (`toPerson` returns `allergies: row.allergies ?? []`; `PersonInput` and `upsertPerson` need no change, the spread already carries the field), `lib/onboarding/save.ts` (the insert sends `allergies: p.allergies ?? []`)
- Not touched: `lib/fixtures/household.ts`, `OnboardingForm.tsx`, `HouseholdScreen.tsx` and the `Person` literals in `portions`, `scaling`, `overlap` tests. They compile as they are because the field is optional.
- Test: `tests/unit/flags.test.ts`, `tests/unit/household-queries.test.ts`, `tests/unit/onboarding-save.test.ts`

**Interfaces:**
- Consumes: `matchFood`, `familyFor`, `COMMON_ALLERGENS` (Task 2); `singular` (`lib/domain/words.ts`).
- Produces:
  ```ts
  export interface Flag {
    kind: 'allergy' | 'dislike';
    food: string;        // as the person listed it: 'tree nuts', 'mushrooms'
    found: string[];     // distinct matched ingredient words, in recipe order: ['almonds']
    often: boolean;      // true only when every hit was an "often has"
    people: Person[];    // everyone who listed this food, in household order
  }
  /** Allergies first, then dislikes; within each, recipe order of the first hit. One flag per (kind, food). Allergies call matchFood with wide: true, dislikes without. */
  export function findFlags(ingredients: string[], people: Person[]): Flag[];
  export function ingredientNames(src: { ingredients: string[]; structured?: { canonical: string }[] | null } | Meal): string[];
  export function flagAmount(meal: Meal, f: Flag): string;                // "8 oz": the recipe's own amount of the first matching ingredient ("2" for unit 'each'); '' when none
  export function personLabel(p: Person, people: Person[]): string;      // "Daughter (4)" when another person shares the name (case-insensitive), else "Son"
  export function namesLabel(who: Person[], people: Person[]): string;   // "Dad and Son"; "A, B and C"
  export interface FlagCopy { cardHead: string | null; cardBody: string; head: string; body: string; pronoun: 'it' | 'them' }
  export function flagCopy(f: Flag, people: Person[], amount?: string): FlagCopy;
  export function allergyCopy(flags: Flag[], people: Person[]): { head: string; body: string } | null; // all allergy flags merged into one box
  ```
- Copy rules (pinned by the tests): `pronoun` is `'them'` when the last word of `found[0]` changes under `singular()` ("mushrooms" yes, "hummus" no), else `'it'`. When a person's allergy and their dislike hit the same ingredient, they get only the allergy flag. `ingredientNames(meal)` returns each ingredient's `canonical` plus the vegetarian swap's food (a soy allergy must see a tofu swap); for a recipe option it returns `structured` names when present, else the ingredient strings. An allergy head uses the family's label when the listed food has a family ("almonds" → "Tree nut allergy"), else the typed word ("Kiwi allergy"). `flagCopy` with no `amount` (or `''`) writes "This has cremini mushrooms."
- Red box body, one allergy: "This recipe lists {found}. Other ingredients can have {X} in them too, so check every label." where {X} is "nuts" for `tree_nut` and `peanut`, otherwise the family label ("milk", "sesame"), or the typed word when there is no family. When the flag is `often`: "This recipe lists {found}, which often has {X}. Other ingredients can have {X} in them too, so check every label." Two or more allergies: "This recipe lists {all found, joined}. Other ingredients can have them too, so check every label.", with each `often` flag's food written "{found} (often has {X})". The merged head is as drawn on artboard 12: "Tree nut and sesame allergies: {everyone, joined with commas}".

- [ ] **Step 1: Write the failing tests** using `familyOfFive` with `daughter-4` given `dislikes: ['mushrooms']`, `allergies: ['tree nuts']` and `son` given `dislikes: ['cilantro']`:

```ts
it('labels people who share a name with their age', () => {
  expect(personLabel(d4, people)).toBe('Daughter (4)');
  expect(personLabel(son, people)).toBe('Son');
});
it('a dislike reads as an offer', () => {
  const [f] = findFlags(['8 oz cremini mushrooms', '1 can white beans'], people);
  expect(f).toMatchObject({ kind: 'dislike', food: 'mushrooms', found: ['cremini mushrooms'], often: false });
  const c = flagCopy(f, people, '8 oz');
  expect(c.cardHead).toBeNull();
  expect(c.cardBody).toBe('Has cremini mushrooms. Daughter (4) won’t eat them.');
  expect(c.head).toBe('Daughter (4) won’t eat mushrooms');
  expect(c.body).toBe('This has 8 oz cremini mushrooms. Change it just for Daughter (4)?');
  expect(c.pronoun).toBe('them');
});
it('two people and a singular food', () => {
  const two = people.map((p) => (p.id === 'dad' ? { ...p, dislikes: ['cilantro'] } : p));
  const c = flagCopy(findFlags(['1 bunch cilantro'], two)[0], two, '1 bunch');
  expect(c.head).toBe('Dad and Son won’t eat cilantro');
  expect(c.body).toBe('This has 1 bunch cilantro. Change it just for them?');
  expect(c.pronoun).toBe('it');
});
it('an allergy reads as a warning and comes first', () => {
  const flags = findFlags(['8 oz cremini mushrooms', '1/4 cup sliced almonds'], people);
  expect(flags.map((f) => f.kind)).toEqual(['allergy', 'dislike']);
  const c = flagCopy(flags[0], people);
  expect(c.cardHead).toBe('Tree nut allergy: Daughter (4)');
  expect(c.cardBody).toBe('Lists almonds. Check labels.');
  expect(allergyCopy(flags, people)).toEqual({
    head: 'Tree nut allergy: Daughter (4)',
    body: 'This recipe lists almonds. Other ingredients can have nuts in them too, so check every label.',
  });
});
it('an "often has" food says so', () => {
  const c = flagCopy(findFlags(['1/2 cup pesto'], people)[0], people);
  expect(c.cardBody).toBe('Pesto often has tree nuts. Check labels.');
});
it('merges several allergies into one box', () => {
  const more = [...people, { ...people[0], id: 'g', name: 'Grandma', allergies: ['sesame'] }];
  expect(allergyCopy(findFlags(['sliced almonds', '2 tbsp tahini'], more), more)).toEqual({
    head: 'Tree nut and sesame allergies: Daughter (4), Grandma',
    body: 'This recipe lists almonds and tahini. Other ingredients can have them too, so check every label.',
  });
});
it('says "often has" in the box too, alone and merged', () => {
  expect(allergyCopy(findFlags(['1/2 cup pesto'], people), people)?.body)
    .toBe('This recipe lists pesto, which often has nuts. Other ingredients can have nuts in them too, so check every label.');
  const more = [...people, { ...people[0], id: 'g', name: 'Grandma', allergies: ['sesame'] }];
  expect(allergyCopy(findFlags(['sliced almonds', '1 cup hummus'], more), more)?.body)
    .toBe('This recipe lists almonds and hummus (often has sesame). Other ingredients can have them too, so check every label.');
});
it('never says safe, always says to check labels, and says nothing when nothing matches', () => {
  expect(findFlags(['1 butternut squash', 'salt'], people)).toEqual([]);
  expect(allergyCopy([], people)).toBeNull();
  for (const a of COMMON_ALLERGENS) {
    const fam = familyFor(a)!;
    const who = people.map((p) => ({ ...p, allergies: p.id === 'son' ? [a] : [] }));
    for (const line of [fam.members[0], ...fam.often.slice(0, 1)]) {
      const flags = findFlags([line], who);
      const text = JSON.stringify([flags.map((f) => flagCopy(f, who)), allergyCopy(flags, who)]);
      expect(text).not.toMatch(/\bsafe\b|nut-free|allergen-free|free of|no allergens/i);
      expect(flagCopy(flags[0], who).cardBody).toMatch(/Check labels\.$/);
      expect(allergyCopy(flags, who)!.body).toMatch(/check every label\.$/);
    }
  }
});
it('a food on both lists is only an allergy', () => {
  const both = people.map((p) => (p.id === 'daughter-4' ? { ...p, dislikes: ['almonds'], allergies: ['tree nuts'] } : p));
  expect(findFlags(['sliced almonds'], both).map((f) => f.kind)).toEqual(['allergy']);
});
it('an allergy to one member covers the family; a dislike of one member does not', () => {
  const p2 = people.map((p) => (p.id === 'daughter-4' ? { ...p, dislikes: ['cremini'], allergies: ['almonds'] } : p));
  const flags = findFlags(['chopped walnuts', 'shiitake'], p2);
  expect(flags.map((f) => [f.kind, f.food])).toEqual([['allergy', 'almonds']]);
  expect(flagCopy(flags[0], p2).cardHead).toBe('Tree nut allergy: Daughter (4)');
});
it('reads people saved before allergies existed', () => {
  const old = people.map((p) => ({ id: p.id, name: p.name, age: p.age, diet: p.diet, appetite: p.appetite, dislikes: [] }));
  expect(findFlags(['sliced almonds'], old)).toEqual([]);
});
it('finds the recipe’s own amount', () => {
  expect(flagAmount(soup, findFlags(ingredientNames(soup), people)[0])).toBe('8 oz');
});
// household-queries.test.ts
//  - AUTHORISED CHANGE: the mock `row` gains `allergies: ["tree nuts"]`, and the "maps rows to Person" expectation gains
//    `allergies: ["tree nuts"]` on both people.
//  - new: a row with no `allergies` key maps to `allergies: []`.
//  - new: upsertPerson(sb, "h1", { ...person, dislikes: ["olives"], allergies: ["tree nuts"] }, 3) → find(calls, "insert") toEqual
//    [{ household_id: "h1", name: "Mom", age: 39, diet: "vegetarian", appetite: 1, dislikes: ["olives"], allergies: ["tree nuts"], sort: 3 }];
//    with id "p1" → find(calls, "update") toEqual [the same object without household_id and sort].
// onboarding-save.test.ts
//  - new: the inserted rows' `allergies` are [[], [], [], [], []]; a person given allergies: ["sesame"] is inserted with ["sesame"].
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/flags.test.ts tests/unit/household-queries.test.ts tests/unit/onboarding-save.test.ts`. Expected: FAIL (module not found; the changed `toEqual`; the `upsertPerson` cases fail at typecheck until `Person.allergies` exists).
- [ ] **Step 3: Add `allergies?` to `Person`, read it in `toPerson` and `saveOnboarding`; write `flags.ts`.** Every read of `allergies` in this plan is `p.allergies ?? []`.
- [ ] **Step 4: Run** the three files and `npm run typecheck`. Expected: PASS, and no other test file changed.
- [ ] **Step 5: Commit** (name the changed `listPeople` assertion in the body)

```bash
git add lib/domain/flags.ts lib/fixtures/soup.ts lib/domain/types.ts lib/db/queries/household.ts lib/onboarding/save.ts tests/unit/flags.test.ts tests/unit/household-queries.test.ts tests/unit/onboarding-save.test.ts
git commit -m "feat: find and word won't-eat and allergy flags" -m "Changed assertion: household-queries 'maps rows to Person' now expects allergies." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 4: Leave out or swap for one person, in the list math (pure)

**Files:**
- Modify: `lib/domain/types.ts`, `lib/domain/scaling.ts`, `lib/week/note.ts`, `lib/ai/schemas.ts` (`PersonChangeSchema`), `lib/db/queries/meals.ts` (`toMeal` reads `person_changes`; `setPersonChanges`, `withChange`, `withoutChange`)
- Not touched: `lib/fixtures/tacos.ts` and existing `Meal` literals (the field is optional).
- Test: `tests/unit/scaling.test.ts`, `tests/unit/week-note.test.ts`, `tests/unit/build-list.test.ts`

**Interfaces:**
- Consumes: `matchFood`, `SwapIdea` (Task 2); `personLabel`, the `soup` fixture (Task 3).
- Produces:
  ```ts
  // types.ts
  export interface PersonChange { personId: string; food: string; action: 'leave_out' | 'swap'; swap?: SwapIdea }
  export interface Meal { /* existing */ personChanges?: PersonChange[] }   // optional: always read as `meal.personChanges ?? []`
  // schemas.ts — the one runtime shape; `swap` reuses VegSwapSchema and is required when action is 'swap'
  export const PersonChangeSchema: z.ZodType<PersonChange>;
  // scaling.ts — the one place that decides who eats a line
  export function eatersOf(meal: Meal, line: { canonical: string; role: Role }, people: Person[]): Person[];
  // meals.ts
  export async function setPersonChanges(sb: Sb, mealId: string, changes: PersonChange[]): Promise<MealRow>;
  export function withChange(changes: PersonChange[], next: PersonChange): PersonChange[];   // replaces the entry for (personId, food)
  export function withoutChange(changes: PersonChange[], personId: string, food: string): PersonChange[];
  // note.ts
  export function changeNotes(meal: Meal, people: Person[]): string[];  // ["Daughter (4): no mushrooms", "Daughter (4): zucchini instead of mushrooms"]
  ```
- `eatersOf`: the people who eat the line's role (existing diet rule) **and** have no change whose `food` matches it (`matchFood(change.food, line.canonical)`). `scaleMeal`, `changeNotes` and the "cut to {n} people" count in Task 7 all call it; no second copy of the rule.
- Rule for `scaleMeal`: each ingredient's servings are `target × (its eaters' portion factors ÷ everyone's)`; with every person eating it the arithmetic is today's, unchanged; with nobody left the line is dropped. Then, in `personChanges` order, each change with `action: 'swap'` whose food matches something in the meal adds one line `swap.amountPerServing × target × (that person's factor ÷ everyone's)`. **The vegetarian swap line stays last** (`DraftPreview` finds it by position). The vegetarian swap goes to the same people as today, minus anyone with a change that matches the swap's food; with nobody left it is dropped. A person who leaves out the meat does not get the vegetarian swap (they can pick a swap of their own). Changes naming an unknown person, or a food that matches nothing in the meal, are ignored everywhere.
- `toMeal` parses `person_changes` entry by entry with `PersonChangeSchema` and drops any that fail (one bad entry must not break the list).
- `dayNote` appends `changeNotes` joined with " · " after the existing text. The existing part names only swap people who have no change on the swap's food; if that leaves nobody, the existing part is omitted and the note is the change notes alone.

- [ ] **Step 1: Write the failing tests** (`share(meal, canonical)` is a small helper in the test file: the line's amount ÷ its amount with nothing left out)

```ts
// scaling.test.ts — soup: 8 oz cremini mushrooms (produce), 2 cans white beans; baseServings 4; familyOfFive (3.8 servings)
it('buys less of a food one person has left out', () => {
  const m = { ...soup, personChanges: [{ personId: 'daughter-4', food: 'mushrooms', action: 'leave_out' as const }] };
  // 8 oz × (3.8 ÷ 4) × (3.3 ÷ 3.8) = 6.6 oz
  expect(grams(line(scaleMeal(m, familyOfFive), 'cremini mushrooms')!)).toBeCloseTo(6.6 * 28.3495, 1);
  expect(grams(line(scaleMeal(m, familyOfFive), 'white beans')!)).toBe(grams(line(scaleMeal(soup, familyOfFive), 'white beans')!));
});
it('adds the swap for that person only', () => {
  const m = { ...soup, personChanges: [{ personId: 'daughter-4', food: 'mushrooms', action: 'swap' as const, swap: { canonical: 'zucchini', amountPerServing: 0.25, unit: 'each', role: 'produce' as const } }] };
  expect(line(scaleMeal(m, familyOfFive), 'zucchini')!.qty.amount).toBeCloseTo(0.25 * 3.8 * (0.5 / 3.8), 5);
});
it('drops the line when everyone has left it out', () => {
  const m = { ...soup, personChanges: familyOfFive.map((p) => ({ personId: p.id, food: 'mushrooms', action: 'leave_out' as const })) };
  expect(line(scaleMeal(m, familyOfFive), 'cremini mushrooms')).toBeUndefined();
});
it('ignores a change for someone no longer in the household, or a food not in the meal', () => {
  const m = { ...soup, personChanges: [{ personId: 'gone', food: 'mushrooms', action: 'leave_out' as const }, { personId: 'son', food: 'olives', action: 'leave_out' as const }] };
  expect(scaleMeal(m, familyOfFive)).toEqual(scaleMeal(soup, familyOfFive));
});
it('combines with the vegetarian rule on meat', () => {
  const m = { ...tacos, personChanges: [{ personId: 'son', food: 'chicken', action: 'leave_out' as const }] };
  // chicken eaters: Dad 1 + Daughter 0.6 + Daughter 0.5 = 2.1 of 3.8
  expect(share(m, 'boneless chicken thighs')).toBeCloseTo(2.1 / 3.8, 5);
});
// week-note.test.ts
it('says who gets what', () => {
  expect(dayNote(leaveOut, familyOfFive, null)).toBe('Everyone vegetarian · Daughter (4): no mushrooms');
  expect(dayNote(swapped, familyOfFive, null)).toBe('Everyone vegetarian · Daughter (4): zucchini instead of mushrooms');
  expect(dayNote(goneDad, familyOfFive, null)).toBe('Everyone vegetarian');
});
it('replaces and removes a change', () => {
  const a = withChange([], { personId: 'x', food: 'mushrooms', action: 'leave_out' });
  expect(withChange(a, { personId: 'x', food: 'mushrooms', action: 'swap', swap: zucchini })).toHaveLength(1);
  expect(withoutChange(a, 'x', 'mushrooms')).toEqual([]);
});
// scaling.test.ts, added by the revision
it('has one rule for who eats a line', () => {
  const m = { ...soup, personChanges: [{ personId: 'daughter-4', food: 'mushrooms', action: 'leave_out' as const }] };
  expect(eatersOf(m, soup.ingredients[0], familyOfFive).map((p) => p.id)).toEqual(['dad', 'mom', 'son', 'daughter-6']);
  expect(eatersOf(m, soup.ingredients[1], familyOfFive)).toHaveLength(5);
});
it('puts a person’s swap before the vegetarian swap line', () => {
  const m = { ...tacos, personChanges: [{ personId: 'son', food: 'onion', action: 'swap' as const, swap: zucchini }] };
  expect(scaleMeal(m, familyOfFive).map((l) => l.canonical).slice(-2)).toEqual(['zucchini', 'black beans']);
});
it('applies a change to the vegetarian swap food too', () => {
  const m = { ...tacos, personChanges: [{ personId: 'mom', food: 'black beans', action: 'leave_out' as const }] };
  expect(line(scaleMeal(m, familyOfFive), 'black beans')).toBeUndefined();
  expect(dayNote(m, familyOfFive, null)).toBe('Mom: no black beans');
});
it('scales a meal cached before this release, and people cached before allergies', () => {
  const old: Meal = { id: soup.id, name: soup.name, baseServings: 4, ingredients: soup.ingredients, vegSwap: null, everyoneVegetarian: false, isFavorite: false };
  expect(scaleMeal(old, familyOfFive)).toEqual(scaleMeal({ ...soup, personChanges: [] }, familyOfFive));
  expect(changeNotes(old, familyOfFive)).toEqual([]);
});
// meals: toMeal({ ...row, person_changes: [good, { personId: 5 }, 'junk', { personId: 'x', food: 'y', action: 'swap' }] }).personChanges toEqual [good]
// build-list.test.ts (entries: [{ meal, servings: null }], people: familyOfFive)
//  - soup with daughter-4 leaving out mushrooms: the 'cremini mushrooms' row needs 6.6 oz (same number as above), the 'white beans' row is unchanged
//  - soup with the zucchini swap: a 'zucchini' row exists
//  - soup with all five leaving mushrooms out: no 'cremini mushrooms' row
//  - a cached-shape input (meal without personChanges, people without allergies): buildList does not throw and equals the build with personChanges: []
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/scaling.test.ts tests/unit/week-note.test.ts tests/unit/build-list.test.ts`. Expected: FAIL on the new cases only.
- [ ] **Step 3: Implement.** Existing scaling, note and build-list tests must pass unchanged.
- [ ] **Step 4: Run** the three files plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/domain/types.ts lib/domain/scaling.ts lib/week/note.ts lib/ai/schemas.ts lib/db/queries/meals.ts tests/unit/scaling.test.ts tests/unit/week-note.test.ts tests/unit/build-list.test.ts
git commit -m "feat: leave out or swap a food for one person in the list math" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 5: Household — the won't-eat and allergy editor

**Files:**
- Create: `components/household/FoodChips.tsx`
- Modify: `app/(app)/household/PersonEditor.tsx` (the two lists; two-step Delete), `components/household/StaplesSection.tsx` (audit B11, B19), `components/PersonRow.tsx`, `app/(app)/household/HouseholdScreen.tsx` (one helper line, placed inside the "Who’s eating" section under the list, so it stays clear of the Fred Meyer row cart Task 7 adds to this file)
- Not touched: `lib/db/queries/household.ts` (it already carries `allergies` after Task 3).
- Test: `tests/unit/person-row.test.ts`

**Interfaces:**
- Consumes: `cleanFood`, `coversLine`, `COMMON_ALLERGENS` (Task 2); `Person.allergies` (Task 3).
- Produces:
  ```ts
  // FoodChips.tsx
  export function addFood(list: string[], typed: string): { list: string[]; error: string | null };  // pure; exported for the test
  export function FoodChips(props: { label: string; help: string; value: string[]; onChange: (v: string[]) => void;
    placeholder: string; addLabel: string; suggestions?: readonly string[]; allergy?: boolean }): JSX.Element;
  // PersonEditor.tsx — audit C1: a slip must not delete a person and their allergy list
  export function deleteStep(armedAt: number | null, now: number): 'arm' | 'delete';   // 'delete' only within 4,000 ms of arming
  // PersonRow.tsx
  export function detailText(person: Person): string;          // changed ("Dislikes …" becomes "Won’t eat …"; no existing test asserts the old word)
  export function allergyText(person: Person): string | null;  // new
  ```
- Layout and strings: artboards 05, 06, 07. Fixed copy: group label "Won’t eat" with help "We’ll point these out and offer to swap or leave them out." (empty: "Nothing yet. Add foods to steer around."); "Allergies" with help = `coversLine(last allergy added, { wide: true })`, or "None. Tap one, or type your own." when empty; placeholders "Add a food" / "Add an allergy"; button "Add"; chip `aria-label` "Remove {food}"; while typing, `coversLine(typed, { wide: allergy })` shows under the box with `role="status"`; standing line under Allergies: "Basket only reads ingredient names, so it can miss things. Always check labels."; under the people list: "Tap a person to change what they won’t eat or are allergic to."
- `addFood`, in this order (`cleanFood` returns null for both empty and too long, so check before calling it): trimmed input empty → no error, no change; longer than 40 → "Keep it under 40 letters."; already on the list (case-insensitive) → "That’s already on the list."; list already has 30 → "That’s 30 already. Remove one first."

- **Two-step Delete (audit C1).** The first tap on a person's "Delete" only arms it: the button reads "Tap again to delete" for 4 seconds, then goes back to "Delete". Only a second tap inside those 4 seconds deletes. No existing e2e taps this button.
- **Staples (audit B11, B19), beside the editor in `StaplesSection.tsx`:** "Save staple" is disabled while its save is in flight (a double tap must not save twice), and a load that succeeds clears a "We couldn’t load your staples." error left by an earlier failure.

- [ ] **Step 1: Write the failing tests**

```ts
// person-row.test.ts
it('says what a person will not eat, and drops "No restrictions" when there is something to say', () => {
  expect(detailText({ ...p, diet: 'none', dislikes: [], allergies: [] })).toBe('No restrictions');
  expect(detailText({ ...p, diet: 'none', dislikes: ['olives', 'cilantro'], allergies: [] })).toBe('Won’t eat olives, cilantro');
  expect(detailText({ ...p, diet: 'vegetarian', dislikes: ['beets'], allergies: [] })).toBe('Vegetarian · Won’t eat beets');
  expect(detailText({ ...p, diet: 'none', dislikes: [], allergies: ['tree nuts'] })).toBe('');
});
it('gives allergies their own line', () => {
  expect(allergyText({ ...p, allergies: [] })).toBeNull();
  expect(allergyText({ ...p, allergies: ['tree nuts'] })).toBe('Allergy: tree nuts');
  expect(allergyText({ ...p, allergies: ['shellfish', 'sesame'] })).toBe('Allergies: shellfish, sesame');
});
it('adds a cleaned food once', () => {
  expect(addFood([], '  Mushrooms ')).toEqual({ list: ['mushrooms'], error: null });
  expect(addFood(['mushrooms'], 'MUSHROOMS')).toEqual({ list: ['mushrooms'], error: 'That’s already on the list.' });
  expect(addFood([], '   ')).toEqual({ list: [], error: null });
  expect(addFood(Array.from({ length: 30 }, (_, i) => `f${i}`), 'x').error).toBe('That’s 30 already. Remove one first.');
});
it('tells nothing typed from too much typed', () => {
  expect(addFood(['olives'], 'x'.repeat(41))).toEqual({ list: ['olives'], error: 'Keep it under 40 letters.' });
});
it('deletes a person only on a second tap within four seconds', () => {
  expect(deleteStep(null, 1000)).toBe('arm');
  expect(deleteStep(1000, 4999)).toBe('delete');
  expect(deleteStep(1000, 5001)).toBe('arm');
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/person-row.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `PersonEditor` holds `dislikes` and `allergies` (`initial.allergies ?? []`) in state and includes them in `onSave` (today it passes `initial.dislikes` through untouched). Wire `deleteStep` into the Delete button and make the two staples fixes. `PersonRow` renders the detail line only when `detailText` is not empty, and `allergyText` as its own line with the warning icon, `text-[#A6261B] font-semibold text-xs`. The allergy chip has a `#A6261B` border. Suggestions show only while the allergy list is empty.
- [ ] **Step 4: Run** the four checks. Expected: green.
- [ ] **Step 5: Commit**

```bash
git add components/household/FoodChips.tsx components/household/StaplesSection.tsx "app/(app)/household/PersonEditor.tsx" components/PersonRow.tsx "app/(app)/household/HouseholdScreen.tsx" tests/unit/person-row.test.ts
git commit -m "feat: won't-eat and allergy lists for each person" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 6: Flags on search cards and Favorites rows, and the allergy warning when adding

**Files:**
- Create: `components/flags/FlagLines.tsx`, `components/flags/AllergyBox.tsx`
- Modify: `components/add-meal/SearchTab.tsx` (new prop `people: Person[] | null`; render `FlagLines` last inside each card; extend the card's `aria-label`), `components/add-meal/DraftPreview.tsx` (mark matching ingredient rows; render `AllergyBox` after the vegetarian box), `components/add-meal/AddMealScreen.tsx` (`people` is `null` until loaded; pass it on; gate and swap the bottom bar; keep `SearchTab` mounted when another tab is shown), `components/FavoritesBrowser.tsx` (flag lines on every row, on the Favorites screen and in the Add-a-meal tab), `lib/recipes/search/fake.ts` (add fixtures)
- Test: `tests/unit/flag-lines.test.ts`

**Interfaces:**
- Consumes: `findFlags`, `ingredientNames`, `flagCopy`, `allergyCopy`, the `soup` fixture (Task 3).
- Produces:
  ```ts
  export function cardFlagText(src: RecipeOption | Meal, people: Person[]): string;  // for aria-label: ", Tree nut allergy: Daughter (4). Lists almonds. Check labels." or ""
  export type CardLine = 'shares' | 'made' | 'allergy' | 'dislike';
  export function cardLines(have: Record<CardLine, boolean>): CardLine[];            // which extra lines a card shows, in order
  export function FlagLines(props: { flags: Flag[]; people: Person[] }): JSX.Element | null;   // data-testid="result-flag" per line, data-kind="allergy|dislike"
  export function AllergyBox(props: { flags: Flag[]; people: Person[] }): JSX.Element | null;  // role="alert", data-testid="allergy-box"
  ```
- Layout: artboards 08 and 11. `FlagLines` shows at most two lines: every allergy flag merged into one (head + body), then the first dislike. Under its rating-and-time line a search card shows at most three more lines, in the order shares, made (arrives in Task 13), allergy, dislike; when there are four, the shares line goes first, then the made line; the allergy line is never dropped (`cardLines`).
- **People must be loaded before anything can be added (I6).** In `AddMealScreen`, `people` starts as `null`. Until it is an array, "Add to {Day}" (and "Add to {Day} anyway") is disabled and cards show no flag lines. If `listPeople` fails, the existing message "We couldn’t load your household. Try again." gets a `pillButton` "Try again" that calls it again. `DraftPreview` still receives `people ?? []`.
- **Favorites rows (owner confirmed).** Each row shows `FlagLines` for `ingredientNames(toMeal(row))` under its existing lines, exactly like a search card, and the "+" button's `aria-label` gains `cardFlagText`. `FavoritesBrowser` loads people in the same `Promise.all` as the favorites, in both modes, so a row is never drawn without its flags; a failed people load shows the existing "We couldn’t load your favorites" message. "+" still adds in one tap; the warning then stays on the day row and in the meal sheet (Task 7).
- **Search results survive a tab switch (audit P10).** `AddMealScreen` renders `SearchTab` always and hides it with the `hidden` attribute when Paste or Favorites is shown, instead of unmounting it, so going to Favorites and back shows the same cards with no new request. Each lost result set costs a paid search to get back. No cache layer. Checked in the Task 7 e2e.
- In the draft, an ingredient row matched by an allergy flag reads "{Name} · {family label}" in `#A6261B` semibold. With an allergy flag the bottom bar becomes: a `pillButton`-styled full-width 52 px button "Pick a different dinner" (calls the existing `startOver`) and under it a 44 px text button "Add to {Day} anyway" (calls the existing `addDraft`). Without one, the bar is unchanged.
- Fixtures (fake search, query "soup"), **both under `SPOON` with `structured` lines** so the draft's ingredients come from the fixture and not from the AI fake (which answers every site option with the tacos lines); with no `SITES` entry a Big sites search falls back to them, as "lasagna" does today:
  - "White bean and mushroom soup", site "Budget Bytes", `likes: 512`, `totalMinutes: 40`, ingredients `['8 oz cremini mushrooms', '2 cans white beans', '1 yellow onion']`, `structured: soup.ingredients`.
  - "Broccolini quinoa pilaf with toasted almonds", site "Example Kitchen", `likes: 208`, ingredients `['1 cup quinoa', '2 bunches broccolini', '1/4 cup sliced almonds', '1 lemon']`, `structured`: quinoa 1 cup pantry; broccolini 2 each produce; sliced almonds 0.25 cup pantry; lemon 1 each produce.
  - Keep every existing fixture and its order for existing queries.

- [ ] **Step 1: Write the failing tests**

```ts
it('speaks the flag in the card name', () => {
  expect(cardFlagText(pilaf, people)).toBe(', Tree nut allergy: Daughter (4). Lists almonds. Check labels.');
  expect(cardFlagText(soupOption, people)).toBe(', Has cremini mushrooms. Daughter (4) won’t eat them.');
  expect(cardFlagText(tacosOption, people)).toBe('');
});
it('speaks it for a saved meal too, and never says safe', () => {
  expect(cardFlagText(soup, people)).toBe(', Has cremini mushrooms. Daughter (4) won’t eat them.');
  expect(cardFlagText(pilaf, people) + cardFlagText(soup, people)).not.toMatch(/\bsafe\b|nut-free|allergen-free|free of|no allergens/i);
});
it('keeps at most three extra lines on a card and never drops the allergy', () => {
  expect(cardLines({ shares: true, made: true, allergy: true, dislike: true })).toEqual(['made', 'allergy', 'dislike']);
  expect(cardLines({ shares: true, made: false, allergy: true, dislike: true })).toEqual(['shares', 'allergy', 'dislike']);
  expect(cardLines({ shares: true, made: false, allergy: false, dislike: false })).toEqual(['shares']);
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/flag-lines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the two components and wire them in.
- [ ] **Step 4: Run** the four checks. Expected: green; `tests/unit/search.test.ts` and `overlap.test.ts` unchanged.
- [ ] **Step 5: Commit**

```bash
git add components/flags/FlagLines.tsx components/flags/AllergyBox.tsx components/add-meal/SearchTab.tsx components/add-meal/DraftPreview.tsx components/add-meal/AddMealScreen.tsx components/FavoritesBrowser.tsx lib/recipes/search/fake.ts tests/unit/flag-lines.test.ts
git commit -m "feat: allergy and won't-eat flags on recipe cards, favorites and drafts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 7: Dislike box, swap sheet, flags on planned dinners, and the a1 end-to-end

**Files:**
- Create: `components/flags/DislikeBox.tsx`, `components/flags/IngredientSwapSheet.tsx` (not `SwapSheet`: cart Task 6 adds `components/SwapSheet.tsx` for products), `e2e/family-flags.spec.ts`, `tests/unit/allergy-wording.test.ts`, `tests/unit/meals-save.test.ts`
- Modify: `components/add-meal/DraftPreview.tsx` (`draftAsMeal` copies `personChanges`; dislike box on the draft) and `AddMealScreen.tsx` (choices kept in the draft and saved with the meal), `lib/ai/schemas.ts` (`RecipeDraftSchema.personChanges: z.array(PersonChangeSchema).default([])`), `lib/ai/recipes.ts` (one line: the pasted-text branch sets `personChanges: []` in code, so the model can never supply it), `lib/db/queries/meals.ts` (`saveMeal` writes `person_changes`), `components/MealSheet.tsx` (boxes after the note; see "One order for the meal sheet"), `components/DayRow.tsx` (`FilledDay.allergy: string | null` replaces the note line when set), `components/WeekScreen.tsx`, `e2e/helpers/household.ts` (optional `wontEat`/`allergies` on `PersonInput`, set through the Household screen after onboarding)
- Test: `tests/unit/dislike-box.test.ts`, `tests/unit/meals-save.test.ts`, `tests/unit/allergy-wording.test.ts`, `e2e/family-flags.spec.ts`

**Interfaces:**
- Consumes: `findFlags`, `flagCopy`, `flagAmount`, `allergyCopy`, `personLabel`, `ingredientNames` (Task 3); `eatersOf`, `withChange`, `withoutChange`, `setPersonChanges`, `changeNotes` (Task 4); `swapIdeas`, `cleanFood`, `matchFood` (Task 2); `AllergyBox` (Task 6).
- Produces:
  ```ts
  export function boxState(flag: Flag, changes: PersonChange[]): 'ask' | 'done' | 'kept';  // done when every flagged person has a change for flag.food
  export function doneCopy(flag: Flag, changes: PersonChange[], people: Person[], eaters: number): { head: string; sub: string };
  export function ideaNote(idea: SwapIdea, meal: Meal): string;   // "Already on the list" | "Adds zucchini to the list"
  export function DislikeBox(props: { flag: Flag; people: Person[]; amount: string; changes: PersonChange[];
    onChange: (next: PersonChange[]) => void | Promise<void>; mealName: string; meal: Meal }): JSX.Element | null;   // data-testid="dislike-box"
  export function IngredientSwapSheet(props: { flag: Flag; people: Person[]; mealName: string; meal: Meal;
    onPick: (swap: SwapIdea) => void; onClose: () => void }): JSX.Element;
  ```
- Layout: artboards 09, 10, 12. Fixed copy: buttons "Leave {it|them} out", "Swap {it|them}", "Keep it as is"; done state head "{Names}: no {food}" or "{Names}: {swap} instead of {food}", sub "{Food} cut to {n} people" (n = `eatersOf(...).length`, passed in as `eaters`), button "Change" (returns to the ask state, clearing those people's changes for that food). Swap sheet: title "Instead of {food}", sub "For {Names}, in {Meal name}.", radio rows from `swapIdeas` each with `ideaNote`, field "Or something else" (placeholder "Type a food"; a typed food becomes `{ canonical, amountPerServing: 1, unit: 'each', role: 'other' }` after `cleanFood`), note "{Food} drop{s} to {n} people’s worth. We’ll remember this for next time you make it." (number in words up to twelve), primary "Swap for {Names}", then "Back". A food with no ideas shows only the typed field. "Keep it as is" hides the box for this visit only (not stored).
- `ideaNote`: "Already on the list" when a name in `ingredientNames(meal)` matches the idea's food, otherwise "Adds {canonical} to the list". (The artboard's "1 small zucchini" and "2 carrots" are sample amounts; the real amount for one child rounds to one, so the line names the food and no number.)
- On `MealSheet`, changes save at once through `setPersonChanges` then `onChanged()`; a failure shows the sheet's existing "We couldn’t change that. Try again." `AllergyBox` shows whenever the meal matches an allergy and has no dismiss. `DayRow` with `allergy` set shows the warning icon and the `allergyCopy` head in `#A6261B` instead of the note.

- [ ] **Step 1: Write the failing unit tests**

```ts
// dislike-box.test.ts
it('knows when a flag has been dealt with', () => {
  expect(boxState(flag, [])).toBe('ask');
  expect(boxState(flag, [{ personId: 'daughter-4', food: 'mushrooms', action: 'leave_out' }])).toBe('done');
});
it('words the done state', () => {
  expect(doneCopy(flag, [leaveOut], people, 4)).toEqual({ head: 'Daughter (4): no mushrooms', sub: 'Mushrooms cut to 4 people' });
  expect(doneCopy(flag, [swapZucchini], people, 4).head).toBe('Daughter (4): zucchini instead of mushrooms');
});
it('says what a swap does to the list', () => {
  expect(ideaNote(whiteBeans, soup)).toBe('Already on the list');
  expect(ideaNote(zucchini, soup)).toBe('Adds zucchini to the list');
});
it('a draft carries the choices into the list math', () => {
  expect(draftAsMeal({ ...draft, personChanges: [leaveOut] }).personChanges).toEqual([leaveOut]);
});
// meals-save.test.ts (client stubbed as in household-queries.test.ts)
//  - saveMeal(sb, 'h', { ...draft, personChanges: [leaveOut], isFavorite: true }) → the insert payload toEqual today's payload plus
//    person_changes: [leaveOut]; a draft with no personChanges inserts person_changes: [].
// allergy-wording.test.ts (reads source files with node:fs; this is the gate Task 14 re-runs)
//  - no .ts/.tsx file under app, components or lib matches /nut-free|allergen-free|no allergens/i
//  - lib/domain/flags.ts, lib/domain/families.ts, every file in components/flags, components/household/FoodChips.tsx,
//    components/PersonRow.tsx and app/(app)/household/PersonEditor.tsx also match neither /\bsafe\b/i nor /free of/i (code or comment)
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/dislike-box.test.ts tests/unit/meals-save.test.ts tests/unit/allergy-wording.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the components and wiring.**
- [ ] **Step 4: Write `e2e/family-flags.spec.ts`** (same header as `e2e/fits-this-week.spec.ts`: `serviceWorkers: "block"`, `routeFoodImages`). Buttons named "Swap it" / "Swap them" are looked up inside `dislike-box`. One test per bullet:
  - Household: add a sixth person, open them, tap "Delete" once: the button reads "Tap again to delete" and the person is still listed; tap again: gone. Then open the second "Daughter" (age 4); type "Mushrooms" into Won’t eat → status text "Mushrooms covers cremini, portobello, shiitake and the rest." → Add; tap "+ tree nuts"; Save. The row shows "Won’t eat mushrooms" and "Allergy: tree nuts". Reload: still there. Every chip, Add button and suggestion is ≥ 44 px in both directions; no sideways scroll at 360 px wide.
  - Search "soup": the card "White bean and mushroom soup · Budget Bytes" has a `result-flag` with "Has cremini mushrooms. Daughter (4) won’t eat them."; the pilaf card has "Tree nut allergy: Daughter (4)" and "Lists almonds. Check labels."; the page text never matches `/\bsafe\b|nut-free/i`. Then tap the Favorites tab and the Search tab again: the same cards are there and exactly one request to `/api/recipes/search` was made in this test (`page.on('request')`).
  - Pick the pilaf: `allergy-box` is visible with "check every label"; "Pick a different dinner" returns to results with nothing on the week; pick it again → "Add to Thursday anyway" → on `/week` the Thursday row shows "Tree nut allergy: Daughter (4)"; opening it shows the box and no "Leave" or "Swap" button. `/favorites`: the pilaf row has a `result-flag` with "Tree nut allergy: Daughter (4)".
  - Pick the mushroom soup for Friday → "Leave them out" on the draft → Add → the Friday row note ends "Daughter (4): no mushrooms"; on `/list` the cremini mushrooms row's amount (the number parsed from the row text) is lower than after "Change" → "Keep it as is". Open the meal → "Change" → "Swap them" → "Zucchini" → "Swap for Daughter (4)" → the box reads "Daughter (4): zucchini instead of mushrooms" and `/list` has a zucchini row.
- [ ] **Step 5: Run** the four checks, then `scripts/e2e-local.sh e2e/family-flags.spec.ts`. Expected: green. (No other way of running e2e; see Global Constraints.)
- [ ] **Step 6: Commit**

```bash
git add components/flags/DislikeBox.tsx components/flags/IngredientSwapSheet.tsx components/add-meal/DraftPreview.tsx components/add-meal/AddMealScreen.tsx lib/ai/schemas.ts lib/ai/recipes.ts lib/db/queries/meals.ts components/MealSheet.tsx components/DayRow.tsx components/WeekScreen.tsx e2e/helpers/household.ts e2e/family-flags.spec.ts tests/unit/dislike-box.test.ts tests/unit/meals-save.test.ts tests/unit/allergy-wording.test.ts
git commit -m "feat: leave out or swap a disliked food, and keep allergy warnings on planned dinners" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

- [ ] **Step 7 (controller): a1.** Tag `a1-ready`. Release a1 **only after fm-cart has shipped to main; merge main first** (the procedure under "Branch, base and release"). Until then a1 waits here and work goes on to Task 8. After the release, tell the owner what to tap.

---

### Task 8: Meal facts travel from the recipe to the saved meal

**Files:**
- Create: `lib/domain/method.ts`
- Wait for: S1 merged into `family-a` (`grep -n ai_gate lib/api/household-context.ts` finds it). If not, this task waits.
- Modify: `lib/domain/types.ts` (`CookMethod`, `MealFacts`), `lib/ai/schemas.ts`, `lib/ai/recipes.ts`, `app/api/meals/draft/route.ts` (hands the retry its gate), `lib/ai/fake.ts`, `lib/recipes/search/provider.ts` (`RecipeOption.steps: string[]`), `lib/recipes/search/index.ts`, `spoonacular.ts`, `clamp.ts`, `fake.ts`, `lib/recipes/jsonld.ts` (ratings scaled by `bestRating`, audit B15; and its comment: steps are now kept by callers), `lib/db/queries/meals.ts` (`saveMeal`; signed photo links reused, audit P7), `lib/add-meal-saved.ts` (no change expected; its test must still pass with the new optional fields)
- Test: `tests/unit/method.test.ts`, `tests/unit/draft-route.test.ts`, `tests/unit/spoonacular.test.ts`, `tests/unit/search.test.ts`, `tests/unit/jsonld.test.ts`, `tests/unit/meals-save.test.ts`, `tests/unit/meal-photos.test.ts`, `tests/unit/add-meal-saved.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type CookMethod = 'stovetop' | 'oven' | 'slow_cooker' | 'pressure_cooker' | 'grill' | 'no_cook';
  export interface MealFacts { steps: string[] | null; totalMinutes: number | null; method: CookMethod | null; makeAhead: boolean;
    rating: number | null; ratingCount: number | null; likes: number | null }
  // method.ts
  export const METHOD_LABEL: Record<CookMethod, string>; // Stovetop, Oven, Slow cooker, Pressure cooker, Grill, No cooking
  export function cleanSteps(raw: unknown): string[] | null;      // strings only; tags stripped; whitespace collapsed; ≤ 1000 chars each; ≤ 60; ≤ 30,000 chars in all (stop before the step that would pass it); null when none
  export function cleanMinutes(n: unknown): number | null;        // whole number 1–2880, else null
  export function cleanRating(n: unknown): number | null;         // a finite number 0–5, to one decimal; anything else (92, a string) is null. It does not guess a scale; jsonld.ts scales first when the page says
  export function cleanCount(n: unknown): number | null;          // a finite number 0–2,147,483,647, rounded down; else null
  export function cleanFacts(raw: { [K in keyof MealFacts]?: unknown }): MealFacts;   // every writer goes through this
  export function cookMethod(title: string, steps: string[] | null): CookMethod | null;
  export function factsLine(f: MealFacts, source: string | null): string | null;
  ```
  - `RecipeDraftSchema` gains `steps` (array of ≤ 60 strings ≤ 1000, nullable, default null), `totalMinutes`, `method`, `makeAhead` (default false), `rating`, `ratingCount`, `likes`, all optional with defaults so drafts saved in localStorage before this change still parse.
  - `RecipeOptionSchema` gains `steps: z.array(z.string().max(1000)).max(60).default([])`. `clampOption` runs `cleanSteps`, `cleanMinutes`, `cleanRating` and `cleanCount` on every option the server builds, so the browser never holds more than that; a draft request whose option is over those limits did not come from our server and gets the route's existing `400 { error: 'bad_request' }`.
  - `TextRecipeSchema` (new, the pasted-text call's own output): `name`, `baseServings`, `ingredients`, `vegSwap`, `steps` (≤ 30 strings ≤ 1000, nullable), `totalMinutes` (nullable). `TextRecipeNoStepsSchema`: the first four. The model is never asked for a rating, a count, likes, a method or `personChanges`; code sets `rating`, `ratingCount` and `likes` to null, `method = cookMethod(name, steps)`, `makeAhead: false`, `personChanges: []`.
  - `saveMeal` passes the draft's facts through `cleanFacts` and writes `steps`, `total_minutes`, `method`, `make_ahead`, `rating`, `rating_count`, `likes`, and sets `facts_checked_at = now` when it has steps or minutes. With the cleaners in front, no recipe can trip a table check.
- Rules: `cookMethod` lower-cases, turns hyphens into spaces, then checks in this order, title then steps: slow cooker / crock pot / crockpot → `slow_cooker`; instant pot / pressure cook → `pressure_cooker`; grill (not "grilled cheese") → `grill`; preheat / bake / roast / broil / "°F" / "degrees" → `oven`; simmer / sauté / saute / boil / skillet / saucepan / stir fry / "medium heat" → `stovetop`; "no cook" in the title → `no_cook`; otherwise null. `factsLine`: parts joined with " · ": minutes via `formatMinutes`, `METHOD_LABEL`, then "★ 4.7 from 812 ratings" ("from 1 rating" for one; "★ 4.7" with no count; or "♥ 2,340 likes"); null when there are none.
- Sources: big-sites options take `recipe.steps` from JSON-LD (already parsed); Spoonacular options take `analyzedInstructions[].steps[].step` from the same search response (no extra call). `draftFromOption` copies steps, minutes, rating, count and likes from the option through `cleanFacts` and sets `method = cookMethod(title, steps)`. URL paste: from JSON-LD the same way.
- Text paste (I7, I8): split today's `SYSTEM` into `LINES_RULES` (all but its last sentence) and `NO_STEPS = 'Never include cooking steps.'`. The ingredient-lines call and the swap call keep `${LINES_RULES} ${NO_STEPS}`. The text call uses `TextRecipeSchema` and `${LINES_RULES} The user pastes a whole recipe. Return name, baseServings (how many it serves, 4 if unstated), ingredients, the cooking steps as steps (at most 30, one string each, shortened if long) and totalMinutes if the recipe says, else null. …swap rule`. If that call throws `UnreadableError` (a long recipe can run past the 4,000-token limit), call once more as task `'text_nosteps'` with `TextRecipeNoStepsSchema` and today's prompt, and keep `steps: null`. Both attempts report usage. Steps are never logged.
- **Spend guard.** The first attempt is covered by the hold the draft route already takes through `requireHouseholdWithinCap` (S1). The retry is a second paid call, so it takes its own hold first: `DraftOptions` gains `gate?: () => Promise<'ok' | 'cap' | 'slow' | 'busy'>`, the route passes one that calls S1's `ai_gate` with the same hold as the first, and `draftFromText` calls it before retrying. Anything but `'ok'` means no retry, and the route answers as S1 maps that word (402 for `cap`, 429 for `slow` and `busy`). Use S1's helper for the call, whatever it is named when it lands; do not write a second gate.
- **Ratings on another scale (audit B15).** `extractRecipeJsonLd` reads `aggregateRating.bestRating`; when it is a number above 5, the rating becomes `ratingValue × 5 ÷ bestRating`. With no `bestRating`, a value above 5 is dropped by `cleanRating`, as before.
- **Signed photo links (audit P7).** `mealPhotoSrc` and `mealPhotoSrcs` keep a module-level map of storage path → signed link and reuse a link for 50 minutes (links last 60), signing only paths that are missing or older. No thumbnails.
- Fixtures: in the fake search, `base` gains `steps: []`; the site option "Chicken tacos" gets `steps: ['Cook the chicken in a skillet over medium heat.', 'Warm the tortillas and fill them.']` (so its method is Stovetop). `lib/ai/fake.ts`: `AiTask` gains `'text_nosteps'`; `'text'` returns the `TextRecipeSchema` shape with `steps: ['Warm the tortillas.', 'Cook the filling 10 minutes.']` and `totalMinutes: 30`, or `{ nonsense: true }` when the prompt contains "toolong"; `'text_nosteps'` returns the same without steps and minutes.

- [ ] **Step 1: Write the failing tests**

```ts
// method.test.ts
it.each([
  ['Slow-cooker three-bean chili', null, 'slow_cooker'],
  ['White bean soup', ['Simmer 20 minutes over medium heat.'], 'stovetop'],
  ['Ratatouille with brie', ['Preheat the oven to 375°F.', 'Simmer the sauce.'], 'oven'],
  ['Instant Pot dal', null, 'pressure_cooker'],
  ['Grilled cheese', ['Cook in a skillet until golden.'], 'stovetop'],
  ['Grilled vegetable skewers', ['Grill 10 minutes.'], 'grill'],
  ['No-cook summer rolls', null, 'no_cook'],
  ['Mystery', null, null],
])('%s → %s', (title, steps, want) => expect(cookMethod(title, steps)).toBe(want));
it('cleans steps', () => {
  expect(cleanSteps(['<b>Chop</b>  the onion.', '', 5, 'x'.repeat(5000)])).toEqual(['Chop the onion.', 'x'.repeat(1000)]);
  expect(cleanSteps(Array.from({ length: 300 }, (_, i) => `Step ${i}`))).toHaveLength(60);
  expect(cleanSteps([])).toBeNull();
  expect(cleanSteps('nope')).toBeNull();
});
it('keeps only believable times', () => {
  expect([0, -5, 40.4, 2880, 4320, NaN, '40'].map(cleanMinutes)).toEqual([null, null, 40, 2880, null, null, null]);
});
it('writes the facts line', () => {
  expect(factsLine({ ...none, totalMinutes: 40, method: 'stovetop', rating: 4.7, ratingCount: 812 }, 'Budget Bytes')).toBe('40 min · Stovetop · ★ 4.7 from 812 ratings');
  expect(factsLine({ ...none, likes: 2340 }, null)).toBe('♥ 2,340 likes');
  expect(factsLine(none, null)).toBeNull();
});
it('cleans ratings and counts', () => {
  expect([4.66, 5, 0, 8.5, 92, -1, NaN, '4.5'].map(cleanRating)).toEqual([4.7, 5, 0, null, null, null, null, null]);
  expect([812, 812.5, 0, -3, 3e9, NaN, '12'].map(cleanCount)).toEqual([812, 812, 0, null, null, null, null]);
  expect(factsLine({ ...none, rating: 5, ratingCount: 1 }, null)).toBe('★ 5 from 1 rating');
});
it('caps all the steps together, in any alphabet', () => {
  expect(cleanSteps(Array.from({ length: 60 }, () => 'é'.repeat(1000)))).toHaveLength(30);
});
it('cleans every fact in one place', () => {
  expect(cleanFacts({ steps: ['<i>Stir.</i>'], totalMinutes: 4320, method: 'microwave', rating: 9.2, ratingCount: 812.5, likes: -1 }))
    .toEqual({ steps: ['Stir.'], totalMinutes: null, method: null, makeAhead: false, rating: null, ratingCount: 812, likes: null });
});
// draft-route.test.ts — each case asserts the status and the body
//  - option mode, the "Chicken tacos" fixture → 200; body.steps toEqual the fixture's two steps; totalMinutes 30; rating 4.7;
//    ratingCount 1203; likes null; method 'stovetop'.
//  - an option with 61 steps → 400 { error: 'bad_request' }; with one 1,001-character step → 400.
//  - text mode with AI_FAKE → 200; steps toEqual the fake's two; totalMinutes 30; rating, ratingCount, likes null; personChanges [];
//    console.error and console.log (spied) are never called with text containing a step.
//  - text containing "toolong" → 200; steps null; totalMinutes null; the ingredients are there; the gate was asked once more
//    before the second model call; recordUsage called twice with 'parse'.
// search.test.ts
//  - clampOption on an option with 300 steps of 20,000 characters, rating 9.2, ratingCount 812.5 → steps has 30 entries of 1,000
//    characters, rating null, ratingCount 812.
//  - a JSON-LD page with HowToSection nesting → option.steps flattened, in order.
//  - text containing "toolong" with the gate answering 'busy' → 429; the model was called once; with 'cap' → 402.
// jsonld.test.ts: ratingValue 9 with bestRating 10 → rating 4.5; 92 with bestRating 100 → 4.6; 4.6 with bestRating 5 or none → 4.6;
//    9.2 with no bestRating → the option's rating is null after clampOption.
// meal-photos.test.ts: mealPhotoSrcs called twice for the same two uploaded meals → createSignedUrls called once; a third meal
//    added → only its path is signed; after 51 minutes (fake timers) → signed again.
// spoonacular.test.ts: analyzedInstructions → option.steps in order; missing → [].
// meals-save.test.ts: saveMeal with steps, totalMinutes 40, rating 9.2 → the insert payload has the steps, total_minutes 40,
//    rating null and a facts_checked_at; with neither steps nor minutes → facts_checked_at is absent or null.
// add-meal-saved.test.ts (existing): a stored draft without the new fields still parses.
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/method.test.ts tests/unit/draft-route.test.ts tests/unit/spoonacular.test.ts tests/unit/search.test.ts tests/unit/jsonld.test.ts tests/unit/meals-save.test.ts tests/unit/meal-photos.test.ts`. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the four checks. Expected: green.
- [ ] **Step 5: Commit**

```bash
git add lib/domain/method.ts lib/domain/types.ts lib/ai/schemas.ts lib/ai/recipes.ts lib/ai/fake.ts app/api/meals/draft/route.ts lib/recipes/jsonld.ts lib/recipes/search lib/db/queries/meals.ts tests/unit/method.test.ts tests/unit/draft-route.test.ts tests/unit/spoonacular.test.ts tests/unit/search.test.ts tests/unit/jsonld.test.ts tests/unit/meals-save.test.ts tests/unit/meal-photos.test.ts
git commit -m "feat: keep a recipe's steps, time, method and rating with the saved meal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 9: The facts line, its editor, and "Type it myself"

**Files:**
- Create: `components/MealFacts.tsx`, `components/MealFactsSheet.tsx`, `e2e/meal-facts.spec.ts`
- Modify: `components/MealSheet.tsx` (facts line after the flag boxes; see "One order for the meal sheet"), `components/add-meal/DraftPreview.tsx` (facts line under the photo, no Edit; new prop `startEditing?: boolean` that opens the ingredient editor at once), `lib/db/queries/meals.ts` (`toFacts`, `setMealFacts`), `components/add-meal/PasteTab.tsx` and `AddMealScreen.tsx` ("Type it myself"), `lib/add-meal-saved.ts` (a saved draft may have no ingredients yet), `components/add-meal/api.ts` (cap message unchanged; it is now true)
- Test: `tests/unit/meal-facts.test.ts`, `tests/unit/add-meal-saved.test.ts`, `e2e/meal-facts.spec.ts`

**Interfaces:**
- Consumes: `factsLine`, `METHOD_LABEL`, `cleanMinutes` (Task 8).
- Produces:
  ```ts
  export function toFacts(row: MealRow): MealFacts;
  export async function setMealFacts(sb: Sb, mealId: string, patch: { totalMinutes: number | null; method: CookMethod | null; makeAhead: boolean }): Promise<MealRow>;  // minutes through cleanMinutes
  export function alsoSaved(f: MealFacts, source: string | null): string | null; // "7 steps and ★ 4.7 from 812 ratings, from Budget Bytes. Only your household sees the steps."
  export function blankDraft(name: string): RecipeDraft;   // one empty-name guard: name trimmed, baseServings 4, ingredients [], everything else null/[]/false
  ```
- Layout: artboards 09 (line) and 13 (sheet). Fixed copy: line = `factsLine` or "No time saved yet" with a 44 px "Edit" (or "Add" when empty); sheet title "Time and how it’s cooked", sub = meal name, field "Start to table" + "minutes", radio chips from `METHOD_LABEL` (tapping the chosen one clears it), checkbox "Can be made ahead", heading "Also saved with this meal" + `alsoSaved` (hidden when null), primary "Save"; failure "That didn’t save. Try again."
- `alsoSaved` variants ("the popularity part" is "★ 4.7 from 812 ratings", or "♥ 2,340 likes" when there is no rating): steps and popularity → "7 steps and ★ 4.7 from 812 ratings, from Budget Bytes. Only your household sees the steps."; steps only → "7 steps, from Budget Bytes. Only your household sees the steps."; popularity only → "★ 4.7 from 812 ratings, from Budget Bytes."; likes only → "♥ 2,340 likes, from Spoonacular."; no source → without ", from …"; neither → null. "1 step" singular.
- "Type it myself" (backlog I6): on the Paste tab, under the box, a 44 px text button "Type it myself". It asks for the dinner's name in the existing paste box's place (label "What’s it called?", button "Start") and shows `DraftPreview` with `startEditing` on `blankDraft(name)`; "Add to {Day}" stays disabled until there is at least one ingredient. It makes no network call, so it works at the AI cap, when the spend guard says `slow` or `busy`, and offline-until-save. This is also what makes the cap message's "You can still type the ingredients in." true (audit C2); the message itself does not change.
- A blank draft must survive a reload: `parseSavedAddMeal` checks the stored draft with `RecipeDraftSchema` relaxed to allow an empty `ingredients` array (the API and `saveMeal` still need at least one).

- [ ] **Step 1: Write the failing unit tests**: `alsoSaved` (the six variants above, exact strings, plus "1 step"); `toFacts` (null columns → nulls and `makeAhead: false`); `blankDraft('  Tacos ')` → name "Tacos", `ingredients: []`, `steps: null`; `parseSavedAddMeal({ tab: 'paste', query: '', paste: '', saveFavorite: true, draft: blankDraft('Tacos') })?.draft?.name` is "Tacos".
- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/meal-facts.test.ts tests/unit/add-meal-saved.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Write `e2e/meal-facts.spec.ts`:**
  - Add a fixture recipe with a time and rating (search "tacos", "Chicken tacos"): the draft shows "30 min" and "★ 4.7"; after adding, the meal sheet shows "30 min · Stovetop · ★ 4.7 from 1,203 ratings"; Edit → set 45, choose "Slow cooker", tick "Can be made ahead", Save → line reads "45 min · Slow cooker · ★ 4.7 from 1,203 ratings"; reload → unchanged.
  - Paste tab → "Type it myself" → "Grilled cheese" → the ingredient editor is open; reload → the name is still there; add "bread, 8, each" → "Add to Monday" → on the week; its sheet shows "No time saved yet" and "Add". Assert no request to `/api/meals/draft` was made (`page.on('request')`).
  - Every new control ≥ 44 px; no sideways scroll at 360 px.
- [ ] **Step 5: Run** the four checks, then `scripts/e2e-local.sh e2e/meal-facts.spec.ts`.
- [ ] **Step 6: Commit**

```bash
git add components/MealFacts.tsx components/MealFactsSheet.tsx components/MealSheet.tsx components/add-meal/DraftPreview.tsx components/add-meal/PasteTab.tsx components/add-meal/AddMealScreen.tsx components/add-meal/api.ts lib/add-meal-saved.ts lib/db/queries/meals.ts tests/unit/meal-facts.test.ts tests/unit/add-meal-saved.test.ts e2e/meal-facts.spec.ts
git commit -m "feat: show and edit a meal's time and method; start a meal by hand" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 10: Fill in facts for meals saved earlier

**Files:**
- Create: `app/api/meals/facts/route.ts`, `lib/list/facts-client.ts`
- Modify: `components/FavoritesBrowser.tsx`, `components/useWeekData.ts` (call the client after `setData`, not awaited and outside the load's `try`, so a failed backfill can never blank the week; W1's single-flight `load` stays as it is, and no subscription is added), `components/MealFacts.tsx` (the "getting" state)
- Test: `tests/unit/facts-route.test.ts`, `tests/unit/facts-client.test.ts`

**Interfaces:**
- Consumes: `fetchRecipePage` (`lib/recipes/import-url.ts`, with its existing safety checks), `extractRecipeJsonLd`, `cleanFacts`, `cookMethod` (Task 8), `requireHousehold` from `lib/api/household-context.ts` (not the capped one: this route makes no paid call, so it takes no hold from the spend guard).
- Produces:
  - `POST /api/meals/facts` body `{ mealId: string (uuid) }` → `200 { found: boolean }`. It reads the meal with the user's session (RLS decides access; no row → `404 { error: 'not_found' }`), returns `{ found: false }` without fetching when `facts_checked_at` is set or `source_url` is null, otherwise fetches the page once and passes what it reads through `cleanFacts`. It never overwrites a value, even one saved while the page was being fetched: each of `steps`, `total_minutes`, `method`, `rating`, `rating_count` that came back non-null is written by its own update filtered `.eq('id', id).is(<that column>, null)`. It always sets `facts_checked_at`. A fetch or parse failure still sets `facts_checked_at` and returns `{ found: false }`. No AI. Log lines are `meal facts <status>` only.
  - `facts-client.ts`:
    ```ts
    export function mealsNeedingFacts(rows: MealRow[]): string[];                              // rows with source_url, null facts_checked_at, and null steps
    export async function fillFacts(ids: string[], post = postFacts): Promise<number>;         // how many were found
    export function isFetching(id: string): boolean;                                           // true while that meal's request is in flight
    export function useFactsFetching(id: string): boolean;                                     // the same, as a hook (useSyncExternalStore)
    ```
    `fillFacts`: at most 3 meals per call, one at a time, stops at the first network error, remembers attempted ids in a module-level `Set` so a screen never asks twice in one visit.
- Copy: while `useFactsFetching(meal.id)` is true the facts line reads "Getting this recipe’s time and steps…" (`role="status"`); afterwards the realtime `meals` update re-renders the line.

- [ ] **Step 1: Write the failing tests**

```ts
// facts-route.test.ts (same stubbing style as draft-route.test.ts) — each case asserts the status and the body
//  - a JSON-LD fixture with steps, 45 minutes, rating 4.6 of 212 → 200 { found: true }; one update per column, each with
//    .is(<the same column>, null); a last update sets facts_checked_at.
//  - a page whose rating is 9.2 with no bestRating → no update names `rating`; the others are written; 200 { found: true }.
//  - a meal that already has total_minutes 20 → its update still carries .is('total_minutes', null) (the database keeps 20).
//  - facts_checked_at already set → fetchRecipePage not called; 200 { found: false }.
//  - source_url null → fetchRecipePage not called; 200 { found: false }.
//  - fetchRecipePage throws ImportError → facts_checked_at set; 200 { found: false }.
//  - unknown meal id (RLS returns no row) → 404 { error: 'not_found' }; a body that is not { mealId: uuid } → 400 { error: 'bad_request' };
//    signed out → 401.
//  - console.error and console.log (spied) are never called with text from a step.
// facts-client.test.ts
it('picks only meals with a link and no facts yet', () => {
  expect(mealsNeedingFacts([linked, checked, noLink, hasSteps])).toEqual([linked.id]);
});
it('asks for three at most, once each', async () => {
  const post = vi.fn().mockResolvedValue({ found: true });
  expect(await fillFacts(['a', 'b', 'c', 'd'], post)).toBe(3);
  await fillFacts(['a', 'b', 'c', 'd'], post);
  expect(post.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c', 'd']);
});
it('stops at the first network error', async () => {
  const post = vi.fn().mockRejectedValueOnce(new TypeError('offline'));
  expect(await fillFacts(['x', 'y'], post)).toBe(0);
  expect(post).toHaveBeenCalledTimes(1);
});
it('says which meals are in flight', async () => {
  let release!: (v: { found: boolean }) => void;
  const post = vi.fn(() => new Promise<{ found: boolean }>((r) => (release = r)));
  const done = fillFacts(['q'], post);
  expect(isFetching('q')).toBe(true);
  release({ found: false });
  await done;
  expect(isFetching('q')).toBe(false);
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/facts-route.test.ts tests/unit/facts-client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `export const maxDuration = 20` to the route.
- [ ] **Step 4: Run** the four checks. Expected: green.
- [ ] **Step 5: Commit**

```bash
git add app/api/meals/facts/route.ts lib/list/facts-client.ts components/FavoritesBrowser.tsx components/useWeekData.ts components/MealFacts.tsx tests/unit/facts-route.test.ts tests/unit/facts-client.test.ts
git commit -m "feat: fill in time and steps for meals saved earlier" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

- [ ] **Step 6 (controller): a2.** Before tagging, read Spoonacular's current API terms on storing what a search returns (M15). If keeping their steps on a household's meal is not allowed, set `steps: []` for Spoonacular options in `searchSpoonacular` (one line, with its `spoonacular.test.ts` case changed and named in the commit body) so only steps read from a recipe's own page are kept; tell the owner which it was. Then tag `a2-ready`. Release a2 **only after fm-cart has shipped to main; merge main first**, and only after a1 is live.

---

### Task 11: Verdict logic (pure)

**Files:**
- Create: `lib/domain/verdicts.ts`
- Modify: `lib/domain/weeks.ts` (`dinnerDate`, `todayIn`)
- Test: `tests/unit/verdicts.test.ts`, `tests/unit/weeks.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // weeks.ts
  export function dinnerDate(weekStart: string, day: Day): string;            // the YYYY-MM-DD of `day` in the week that starts on weekStart
  export function todayIn(timeZone: string, now?: Date): string;              // YYYY-MM-DD in that zone
  // verdicts.ts
  export type Vote = 'up' | 'down' | 'skip';
  export interface Verdict { mealId: string; eatenOn: string; status: 'answered' | 'skipped'; votes: Record<string, Vote> }
  export interface Dinner { mealId: string; date: string }
  export const ASK_DAYS = 3;
  export function everyoneLiked(people: { id: string }[]): Record<string, Vote>;
  export function summarize(v: Verdict): { liked: number; tried: number; didntTry: number };
  export function verdictWords(v: Verdict): string | null;
  export function savedLine(v: Verdict, mealName: string): string;            // the line after answering
  export function latestAnswer(verdicts: Verdict[], mealId: string): Verdict | null;
  export function lastHad(dinners: Dinner[], mealId: string, today: string): string | null;   // latest date strictly before today
  export function mealLine(a: { verdict: Verdict | null; lastHad: string | null; timesPlanned: number }): { strong: string; rest: string | null };
  export function searchLine(a: { verdict: Verdict | null; lastHad: string | null }): string;  // "You’ve made this. Everyone liked it · last had Nov 22"
  export function isRetired(verdicts: Verdict[], mealId: string): boolean;
  export function dinnerToAsk(dinners: Dinner[], verdicts: Verdict[], today: string): Dinner | null;
  export function orderFavorites<T extends { id: string }>(rows: T[], verdicts: Verdict[]): T[];
  ```
- Rules: `tried = up + down`. `verdictWords` (the spec's table binds): skipped or `tried === 0` → null; `liked === tried` → "Everyone liked it", otherwise "{liked} of {tried} liked it"; either is followed by " · {n} didn’t try" when `didntTry > 0`. `savedLine`: "Everyone liked {meal}." when the words are exactly "Everyone liked it", otherwise "{meal}: {words}." `latestAnswer`: the newest answered verdict with `tried > 0`; skipped rows and answers where nobody tried it do not count. `mealLine`: with words → `{ strong: words, rest: 'last had Nov 22' }` (rest null without a date); without words → `strong` is "Not made yet" when `timesPlanned === 0` and there is no date, else "Made 1 time" / "Made N times" (N is at least 1 when there is a date), `rest` "last had …" when known. Dates print as "Nov 22" (UTC month and day, like `lib/week/format.ts`). `isRetired`: take the meal's answered verdicts with `tried > 0`, newest first; true when there are at least two and in each of the newest two `liked * 2 < tried`. `dinnerToAsk`: among dinners with `today - ASK_DAYS <= date < today` and no verdict row of either status for `(mealId, date)`, the latest date (ties: first given). `orderFavorites`: stable; meals whose `latestAnswer` has `liked * 2 >= tried` first, then meals with no `latestAnswer`, then the rest, retired last.

- [ ] **Step 1: Write the failing tests**

```ts
it('finds the date of a day in a week, across a month end and any start day', () => {
  expect(dinnerDate('2026-11-22', 'wed')).toBe('2026-11-25');
  expect(dinnerDate('2026-11-29', 'sat')).toBe('2026-12-05');
  expect(dinnerDate('2026-11-23', 'sun')).toBe('2026-11-29'); // a Monday-start week
});
it('knows today in the household zone', () => {
  expect(todayIn('America/Los_Angeles', new Date('2026-11-27T05:30:00Z'))).toBe('2026-11-26');
});
it.each([
  [{ a: 'up', b: 'up' }, 'Everyone liked it'],
  [{ a: 'up', b: 'up', c: 'up', d: 'up', e: 'down' }, '4 of 5 liked it'],
  [{ a: 'up', b: 'up', c: 'up', d: 'down', e: 'skip' }, '3 of 4 liked it · 1 didn’t try'],
  [{ a: 'up', b: 'skip' }, 'Everyone liked it · 1 didn’t try'],
  [{ a: 'skip' }, null],
  [{}, null],
])('%j → %s', (votes, words) => expect(verdictWords(v(votes as Record<string, Vote>))).toBe(words));
it('a skipped dinner has no words', () => expect(verdictWords({ ...v({ a: 'up' }), status: 'skipped' })).toBeNull());
it('counts stored votes even for people who have since left', () => {
  expect(summarize(v({ gone: 'up', a: 'down' }))).toEqual({ liked: 1, tried: 2, didntTry: 0 });
});
it('writes the favorites line', () => {
  expect(mealLine({ verdict: v({ a: 'up' }), lastHad: '2026-11-22', timesPlanned: 3 })).toEqual({ strong: 'Everyone liked it', rest: 'last had Nov 22' });
  expect(mealLine({ verdict: null, lastHad: '2026-11-03', timesPlanned: 2 })).toEqual({ strong: 'Made 2 times', rest: 'last had Nov 3' });
  expect(mealLine({ verdict: null, lastHad: null, timesPlanned: 0 })).toEqual({ strong: 'Not made yet', rest: null });
  expect(searchLine({ verdict: v({ a: 'up' }), lastHad: '2026-11-22' })).toBe('You’ve made this. Everyone liked it · last had Nov 22');
  expect(searchLine({ verdict: null, lastHad: null })).toBe('You’ve made this.');
});
it('asks about the most recent unanswered dinner of the last three days, never today or later', () => {
  const dinners = [d('m1', '2026-11-22'), d('m2', '2026-11-23'), d('m3', '2026-11-25'), d('m4', '2026-11-26'), d('m5', '2026-11-27')];
  expect(dinnerToAsk(dinners, [], '2026-11-26')).toEqual(d('m3', '2026-11-25'));
  expect(dinnerToAsk(dinners, [answered('m3', '2026-11-25')], '2026-11-26')).toEqual(d('m2', '2026-11-23'));
  expect(dinnerToAsk(dinners, [skipped('m3', '2026-11-25'), skipped('m2', '2026-11-23')], '2026-11-26')).toBeNull();
  expect(dinnerToAsk([d('m1', '2026-11-22')], [], '2026-11-26')).toBeNull(); // four days ago
});
it('asks across the week boundary', () => {
  expect(dinnerToAsk([d('m1', dinnerDate('2026-11-22', 'sat'))], [], '2026-11-29')).toEqual(d('m1', '2026-11-28'));
});
it('treats the same meal on two nights as two dinners', () => {
  expect(dinnerToAsk([d('m1', '2026-11-24'), d('m1', '2026-11-25')], [answered('m1', '2026-11-25')], '2026-11-26')).toEqual(d('m1', '2026-11-24'));
});
it('retires a meal most people disliked on its two latest dinners, and brings it back after a good one', () => {
  const bad1 = answered('m', '2026-11-10', { a: 'down', b: 'down', c: 'up' });
  const bad2 = answered('m', '2026-11-24', { a: 'down', b: 'down', c: 'up', d: 'skip' });
  expect(isRetired([bad1], 'm')).toBe(false);
  expect(isRetired([bad1, bad2], 'm')).toBe(true);
  expect(isRetired([bad1, bad2, answered('m', '2026-11-25', { a: 'up', b: 'up' })], 'm')).toBe(false);
  expect(isRetired([bad1, bad2, skipped('m', '2026-11-25')], 'm')).toBe(true);
  expect(isRetired([answered('m', '2026-11-10', { a: 'up', b: 'down' }), bad2], 'm')).toBe(false); // half is not "most"
});
it('orders favorites: liked, unanswered, the rest, retired last, otherwise as given', () => {
  expect(orderFavorites(rows('retired', 'none', 'liked', 'mixed', 'liked2'), verdicts).map((r) => r.id)).toEqual(['liked', 'liked2', 'none', 'mixed', 'retired']);
});
it('starts everyone on liked', () => expect(everyoneLiked([{ id: 'a' }, { id: 'b' }])).toEqual({ a: 'up', b: 'up' }));
it('an answer where nobody tried it is no answer', () => {
  const nobody = answered('m', '2026-11-25', { a: 'skip' });
  const good = answered('m', '2026-11-20', { a: 'up' });
  expect(latestAnswer([nobody, good], 'm')).toEqual(good);
  expect(latestAnswer([skipped('m', '2026-11-25')], 'm')).toBeNull();
  expect(orderFavorites(rows('x', 'liked'), [answered('x', '2026-11-25', { a: 'skip' }), ...verdicts]).map((r) => r.id)).toEqual(['liked', 'x']);
});
it('words the line shown after answering', () => {
  expect(savedLine(v({ a: 'up', b: 'up' }), 'Tuscan white bean soup')).toBe('Everyone liked Tuscan white bean soup.');
  expect(savedLine(v({ a: 'up', b: 'down' }), 'Tacos')).toBe('Tacos: 1 of 2 liked it.');
  expect(savedLine(v({ a: 'up', b: 'skip' }), 'Tacos')).toBe('Tacos: Everyone liked it · 1 didn’t try.');
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/verdicts.test.ts tests/unit/weeks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two files. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/domain/verdicts.ts lib/domain/weeks.ts tests/unit/verdicts.test.ts tests/unit/weeks.test.ts
git commit -m "feat: verdict summaries, the retire rule and which dinner to ask about" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 12: The after-dinner card and the per-person sheet

**Files:**
- Create: `lib/db/queries/verdicts.ts`, `components/verdicts/VerdictCard.tsx`, `components/verdicts/VerdictSheet.tsx`, `components/verdicts/useDinnerToAsk.ts`
- Modify: `components/useWeekData.ts` (two small things only: add `"meal_verdicts"` to its one `subscribeHousehold` table list, and return a `changes` counter that goes up each time that subscription fires), `components/WeekScreen.tsx` (card between the budget meter and Dinners), `components/MealSheet.tsx` (line "Last time: {words}" with "Change", after the facts line, shown when the meal has a `latestAnswer`)
- Not touched: `useWeekData`'s `load` (the card must never be part of the week's own load, and W1's single-flight stays as it is) and `lib/realtime.ts` (it takes its table names from the caller). No second realtime subscription: the week already has one.
- Test: `tests/unit/verdict-queries.test.ts`

**Interfaces:**
- Consumes: Task 11; `VerdictRow` (Task 1); `personLabel` (Task 3); `getMeals`, `mealPhotoSrcs`, `subscribeHousehold` (existing).
- Produces:
  ```ts
  // lib/db/queries/verdicts.ts
  export function toVerdict(row: VerdictRow): Verdict;   // drops vote values other than up/down/skip
  export async function listVerdicts(sb: Sb, householdId: string, opts?: { since?: string; mealId?: string }): Promise<Verdict[]>;
    // .order('eaten_on', { ascending: false }).limit(1000); since → .gte('eaten_on', since); mealId → .eq('meal_id', mealId)
  export async function listDinnerDates(sb: Sb, householdId: string, opts?: { since?: string; slot?: string }): Promise<Dinner[]>;
    // the household's weeks (newest week_start first, limit 1000) and their week_meals (slot default 'dinner'), as dates, newest first;
    // one entry per (mealId, date) even when two week rows cover the same date; since → only dates on or after it
  export async function saveVerdict(sb: Sb, householdId: string, d: Dinner, votes: Record<string, Vote>): Promise<void>; // upsert on (meal_id, eaten_on), status 'answered'
  export async function skipVerdict(sb: Sb, householdId: string, d: Dinner): Promise<void>;   // insert status 'skipped'; a unique-violation (23505) is success
  // components/verdicts/useDinnerToAsk.ts
  export interface Ask { dinner: Dinner; meal: MealRow; photo: string | null }
  export async function loadAsk(sb: Sb, household: Household, today: string): Promise<Ask | null>;   // never throws
  export function useDinnerToAsk(household: Household, sb: Sb, changes: number): { ask: Ask | null; reload: () => void };   // reloads when `changes` moves
  // components/verdicts
  export function VerdictCard(props: { ask: Ask; dayName: string; people: Person[]; offline: boolean; onDone: () => void;
    sb: Sb; householdId: string }): JSX.Element;       // data-testid="verdict-card"
  export function VerdictSheet(props: { mealName: string; people: Person[]; initial: Record<string, Vote>;
    onSave: (votes: Record<string, Vote>) => Promise<void>; onClose: () => void }): JSX.Element;
  ```
- **`loadAsk` (B5, I11).** It reads verdicts and dinner dates for the last 14 days only (`since` = today − 14), picks `dinnerToAsk`, then loads that dinner's meal by id (`getMeals(sb, [mealId])`) and its photo (`mealPhotoSrcs`), because the asked dinner is often last week's and `useWeekData` holds only this week's meals. Any failure, or a meal that no longer exists, gives `null`: no card, no error, and the week itself is untouched. `useDinnerToAsk` calls it on mount and whenever `changes` from `useWeekData` moves (that one subscription now also covers `meal_verdicts`; `week_meals` was already in it). It opens no subscription of its own, and a newer call replaces an older one still in flight.
- Layout: artboards 01, 02, 04. Fixed copy: "How was {Wednesday}’s dinner?", buttons "Everyone liked it", "Not everyone", "Skip"; sheet sub "Who liked it? Answer for the kids too."; radios "Liked it", "Didn’t like", "Didn’t try" in a `radiogroup` labelled with the person (`personLabel`); live line = `verdictWords` of the current choices (`aria-live="polite"`); primary "Save". After an answer the card becomes, for 6 seconds or until tapped away: "**Saved.** " + `savedLine(verdict, meal name)` with "Change" reopening the sheet. Failure: "That didn’t save. Try again." Offline (`navigator.onLine === false` via the existing `useOfflineShell`): both buttons disabled and "You’re offline. This will keep until you’re back."
- Behaviour: the card renders only when `ask` is not null; the sheet opens with `everyoneLiked(people)`; "Everyone liked it" saves that directly. Skip calls `skipVerdict`. Any save or skip removes the card optimistically and restores it on failure. A realtime change to `meal_verdicts` reloads, so the other phone's card disappears. With no dinner to ask about, nothing renders and the week's layout is unchanged.
- `MealSheet` reads `listVerdicts(sb, householdId, { mealId: meal.id })` when it opens (all dates, not 14 days; a failure just hides the line) and shows `latestAnswer`. "Change" opens `VerdictSheet` with that verdict's votes and saves with `saveVerdict` for the same `(mealId, eatenOn)`.

- [ ] **Step 1: Write the failing tests** (Supabase client stubbed as in `household-queries.test.ts`):

```ts
it('saves an answer as one row per dinner', async () => {
  await saveVerdict(sb, 'h', { mealId: 'm', date: '2026-11-25' }, { a: 'up' });
  expect(upsert).toHaveBeenCalledWith(
    { household_id: 'h', meal_id: 'm', eaten_on: '2026-11-25', status: 'answered', votes: { a: 'up' } },
    { onConflict: 'meal_id,eaten_on' },
  );
});
it('treats "someone already answered" as a successful skip', async () => {
  insert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate' } });
  await expect(skipVerdict(sb, 'h', { mealId: 'm', date: '2026-11-25' })).resolves.toBeUndefined();
});
it('throws on any other failure', async () => {
  insert.mockResolvedValueOnce({ error: { code: '42501', message: 'denied' } });
  await expect(skipVerdict(sb, 'h', { mealId: 'm', date: '2026-11-25' })).rejects.toThrow();
});
it('reads rows into verdicts and ignores junk votes', () => {
  expect(toVerdict({ ...row, votes: { a: 'up', b: 'maybe', c: 5 } }).votes).toEqual({ a: 'up' });
});
it('turns week rows into dated dinners', async () => {
  // weeks [{id:'w', week_start:'2026-11-22'}], week_meals [{week_id:'w', day:'wed', meal_id:'m', slot:'dinner'}]
  expect(await listDinnerDates(sb, 'h')).toEqual([{ mealId: 'm', date: '2026-11-25' }]);
});
it('asks for the newest first, and only since a date when told', async () => {
  await listVerdicts(sb, 'h', { since: '2026-11-12' });
  expect(order).toHaveBeenCalledWith('eaten_on', { ascending: false });
  expect(gte).toHaveBeenCalledWith('eaten_on', '2026-11-12');
});
it('lists a dinner once when two week rows cover the same date', async () => {
  // weeks [{id:'w1', week_start:'2026-11-22'}, {id:'w2', week_start:'2026-11-23'}], each with {day:'wed', meal_id:'m', slot:'dinner'}
  expect(await listDinnerDates(sb, 'h')).toEqual([{ mealId: 'm', date: '2026-11-25' }]);
});
// loadAsk
//  - the verdict query rejects → resolves null (does not throw)
//  - today 2026-11-29 (a Sunday-start week's first day), one dinner 'm' on 2026-11-28 in last week's row, no verdicts →
//    getMeals called with [ 'm' ]; resolves { dinner: { mealId: 'm', date: '2026-11-28' }, meal: <that row>, photo: <its src> }
//  - the same, but getMeals returns [] → resolves null
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/verdict-queries.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the queries, the hook, the two components and the wiring.
- [ ] **Step 4: Run** the four checks. Expected: green.
- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/verdicts.ts components/verdicts components/useWeekData.ts components/WeekScreen.tsx components/MealSheet.tsx tests/unit/verdict-queries.test.ts
git commit -m "feat: ask how dinner went, once, on the week" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 13: Verdicts in words on Favorites and search, and the a3 end-to-end

**Files:**
- Create: `e2e/verdicts.spec.ts`
- Modify: `components/FavoritesBrowser.tsx` (line from `mealLine`; order from `orderFavorites` when the chip is "All" and the search box is empty; the Vegetarian / Veg swap tag moves under the line, above the flag lines from Task 6), `components/add-meal/SearchTab.tsx` and `AddMealScreen.tsx` (prop `made: Map<string, string>` of source URL → `searchLine`; rendered as a `FlagLines`-style line above the flags, `data-testid="result-made"`, counted by `cardLines`), `lib/db/queries/meals.ts` (`listMealsBySource(sb, householdId)` → `{ id, source_url, times_planned }[]` for all meals with a link), `lib/domain/verdicts.ts` (`madeLines`), `e2e/helpers/db.ts` (`seedPastDinner`)
- Test: `tests/unit/favorites-line.test.ts`, `e2e/verdicts.spec.ts`

**Interfaces:**
- Consumes: Tasks 11 and 12; `cardLines` (Task 6).
- Produces:
  - `export function madeLines(meals: { id: string; source_url: string | null }[], verdicts: Verdict[], dinners: Dinner[], today: string): Map<string, string>` in `lib/domain/verdicts.ts` (keyed by exact `source_url`; only meals that have a past dinner).
  - `export async function seedPastDinner(email: string, o: { mealName: string; daysAgo: number; sourceUrl?: string }): Promise<{ mealId: string; date: string }>` in `e2e/helpers/db.ts`. With the test user's own session (`clientFor`): read the household's `week_start` and `time_zone`; the date is today in that zone minus `daysAgo`; **find or insert the `weeks` row whose week contains that date** (`weekStartFor(date, week_start, time_zone)`, which is this week's row for some days and last week's for others); find or insert a favorite `meals` row with that name (the tacos fixture's ingredients, `times_planned: 1`, `source_url` when given); upsert `week_meals` on `(week_id, day, slot)` for that date's day.
- `FavoritesBrowser` and `AddMealScreen` each read `listVerdicts` and `listDinnerDates` (all dates) in their own request, apart from their main load. If it fails, rows keep "Made N times" / "Not made yet" in the given order and cards show no made line; nothing else on the screen changes.
- Layout: artboards 03 and 08. The Favorites row's second line is `<strong>{strong}</strong>` + " · " + `rest` (the `rest` span does not break); the tag pill sits on its own line under it. This is the one layout change to an existing row. No existing test asserts the row's "Made …" text, so no existing assertion changes.

- [ ] **Step 1: Write the failing unit test** for `madeLines` (a meal with a link, a past dinner and an answer → "You’ve made this. Everyone liked it · last had Nov 22"; a linked meal only planned for tomorrow → absent; a meal with no link → absent).
- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/unit/favorites-line.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Write `e2e/verdicts.spec.ts`:**
  - With a favorite "Chicken tacos" eaten yesterday (`seedPastDinner`, which must work whether yesterday is in this week's row or last week's): `/week` shows a `verdict-card` with the meal's name and "How was {yesterday’s day name}’s dinner?" → "Everyone liked it" → "Saved." appears, then the card is gone; reload → no card. `/favorites` row reads "Everyone liked it · last had {Mon D}".
  - Eaten yesterday → "Not everyone" → all five radiogroups start on "Liked it" → set the second "Daughter (4)" to "Didn’t like" → live line "4 of 5 liked it" → Save → Favorites shows "4 of 5 liked it". Open the meal from a planned night → "Last time: 4 of 5 liked it" → Change → set back → "Everyone liked it".
  - Skip: the card goes and does not return after reload; Favorites shows "Made 1 time · last had …".
  - Eaten four days ago: no `verdict-card`. Nothing eaten: no `verdict-card`, and `/week` has the same sections as before this task.
  - Two phones (`joinAsPartner`): the card shows on both; one taps "Everyone liked it"; the other's card disappears without a reload (within 5 s).
  - Two answered dinners of one meal (seeded one and two days ago with `sourceUrl` set to the "Chicken tacos" fixture's link; answer both through the UI with three of five on "Didn’t like"): on `/favorites` that meal is the last row; a search for "tacos" still lists it, with a `result-made` line "You’ve made this. 2 of 5 liked it".
  - Card buttons, Skip and every radio are ≥ 44 px both ways; no sideways scroll at 360 px.
- [ ] **Step 5: Run** the four checks, then `scripts/e2e-local.sh e2e/verdicts.spec.ts`.
- [ ] **Step 6: Commit**

```bash
git add components/FavoritesBrowser.tsx components/add-meal/SearchTab.tsx components/add-meal/AddMealScreen.tsx lib/db/queries/meals.ts lib/domain/verdicts.ts e2e/helpers/db.ts e2e/verdicts.spec.ts tests/unit/favorites-line.test.ts
git commit -m "feat: show how dinners went on Favorites and search" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

- [ ] **Step 7 (controller): a3 is built, not released.** Run the whole e2e suite once with `scripts/e2e-local.sh` (no arguments). a3 ships from Task 14 Step 3, **only after fm-cart has shipped to main; merge main first**, and only after a1 and a2 are live.

---

### Task 14: Docs, redesign plan, release (controller and implementer)

**Files:**
- Modify: `docs/superpowers/plans/2026-11-26-premium-pass.md` (add the new screens and components to the rollout list, each in Butter and Cast Iron: verdict card and sheet, food chips, person rows with allergy line, flag lines on cards and Favorites rows, dislike box and its done state, allergy box, ingredient swap sheet, facts line and sheet, "Type it myself"), `docs/superpowers/specs/2026-11-26-post-launch-backlog.md` (mark I6 and the "T4 default privileges" line done; leave the lines the cart release edits, I7, I4 and T9, alone), `docs/superpowers/specs/2026-11-26-basket-design.md` (§1 non-goal and §5 "steps stay on the source site": add one dated line each pointing to the family spec; and an "As built" list, audit C14: what the spec describes that the app does differently today, including that `dislikes` only becomes real in phase (a)), `package.json` (version `0.3.0`; the cart release is `0.2.0`, and if `main` says something else by then, the next minor after it)

- [ ] **Step 1:** make the three doc edits (with the "As built" list) and the version; no code. Commit:

```bash
git add docs/superpowers package.json
git commit -m "docs: family phase (a) in the redesign plan and backlog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

- [ ] **Step 2 (controller):** whole-branch review by the advisor model against the Review Focus list and the allergy wording rule. The gate is `npx vitest run tests/unit/allergy-wording.test.ts tests/unit/flags.test.ts tests/unit/flag-lines.test.ts` green (it replaces the old whole-tree grep, which could not pass: `safe-area`, `safeNext` and comments already contain the word), plus the reviewer reading every string in `components/flags` and `lib/domain/flags.ts` once. Tag `a3-ready`.
- [ ] **Step 3 (controller): release a3, only after fm-cart has shipped to main; merge main first** (the procedure under "Branch, base and release"), and only after a1 and a2 are live. Tag `v0.3.0`. Tell the owner in plain words what is new and what to tap: Household → a person → Won’t eat / Allergies; search a recipe with that food; open last night's dinner card on This week; Favorites.
- [ ] **Step 4 (owner, on both real phones):** add one real won't-eat food and check a flagged recipe; answer one dinner on one phone and watch the card leave the other.

---

## Deferred minors

Pre-flight findings that are not folded into a task, with the reason. None blocks a release.

- **M11: `select('*')` now brings `steps` into every Favorites and week load.** Accepted for now (a real recipe's steps are a few kilobytes). Measure the Favorites load after a2; if it is slow, select named columns in `listFavorites` and `getMeals`.
- **M13: the merged allergy head does not say whose allergy is which** ("Tree nut and sesame allergies: Daughter (4), Grandma"). Kept as drawn on approved artboard 12. Changing it to "Tree nut allergy: Daughter (4) · Sesame allergy: Grandma" changes approved copy, so it needs the owner.
- **A leave-out can leave a hand-set package count too high**, and a food everyone leaves out leaves unused list flags behind (pre-flight section 3, "note only"). Harmless; revisit with the cart's review screen.
- **A choice changed after a cart send** shows on the cart's review screen as "Take these out" / "New since then". That is the correct behaviour; the new e2e specs never send a cart.
- **A person who leaves out the meat gets no vegetarian swap** unless they pick a swap themselves (Task 4 rule). Revisit if the family asks.
- **"Gluten-free pasta" is still flagged for wheat**, and similar labelled products for other allergens. A false alarm, on the cautious side; add `not` phrases as they come up.
- **Lines added by a person's swap show only the meal's name as their source on the list**, not the person. Each such food also costs one Fred Meyer lookup against the 400-a-day cap, which is negligible.
- **"Keep it as is" is not stored**, so the grey box returns on the next visit. The spec says so.
