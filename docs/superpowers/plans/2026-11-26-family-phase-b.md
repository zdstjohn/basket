# Family Features Phase (b) Implementation Plan — leftover nights and busy nights

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Cook double" on a dinner buys twice as much once and puts a linked Leftovers night on a later night that adds nothing to the list or the budget; and a night can be marked busy for this week or every week, so adding dinner on it starts with quick recipes only.

**Architecture:** All judgment lives in two pure modules under `lib/domain` (`leftovers.ts`: which rows buy food, which nights can take leftovers, what state a cooking night is in; `busy.ts`: which nights are busy, what counts as quick, the words), with table-driven unit tests; React components only render what those return. One additive migration (0010) adds one column each to `households`, `weeks` and `week_meals` plus two small triggers that keep a leftovers night tied to its cooking night whichever phone, or an old copy of the app, writes. A leftovers night is an ordinary `week_meals` row with the same `meal_id`, `leftover_of` set and `servings_override = 0`; everything that turns week rows into a shopping list drops such rows first. No new table, no AI, no paid call, no new route.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Supabase Postgres/RLS/Realtime (user session only), Vitest, Playwright, pgTAP. No new dependencies.

**Spec:** `/home/claude/basket-redesign/family/b/design.md` (to be copied to `docs/superpowers/specs/2026-11-26-family-phase-b-design.md` by the controller before Task 1), the mockups `/home/claude/basket-redesign/family/b/b-mockups.png` and artboards `/home/claude/basket-redesign/family/b/canvas/project/01…10-*.dc.html` (the layout and copy reference: sizes, colours and strings are literal in them; names, amounts and prices in them are samples), `/home/claude/basket-redesign/family/b/questions.md` (this plan builds the recommended answer A to all four; if the owner picks otherwise the controller revises the named task before it starts), and `docs/superpowers/specs/2026-11-26-family-decisions.md` (Q8: leftovers stay in the same week). **The spec binds.** This plan decides only what the spec leaves open; if an executor finds the two disagree, stop and tell the controller.

**Branch, base and release:**
- **Base.** Stream 2 works on branch `family-b` in its own worktree (`/home/claude/basket-family-b`), cut by the controller from `fm-cart` at the same commit `family-a` was cut from (`fade19e`) or later. Tasks 1–6 need nothing from phase (a). Tasks 7–9 need phase (a) and wait for it (each says what it needs).
- **Merges (controller only, never a rebase).** `fm-cart` into `family-b` after each cart task, as for `family-a`. `family-a` into `family-b` twice: at `a2-ready` (before Task 7) and at `a3-ready` (before Task 8). Expect hand-merges in `components/MealSheet.tsx`, `components/WeekScreen.tsx`, `components/DayRow.tsx`, `components/useWeekData.ts`, `lib/week/note.ts`, `lib/db/types.ts`, `lib/db/rows.ts`, `components/add-meal/AddMealScreen.tsx`, `SearchTab.tsx`, `components/FavoritesBrowser.tsx`, `lib/recipes/search/fake.ts` and the `plan(N)` line of `supabase/tests/rls_test.sql`. "Shared files" below says how each is kept small.
- **Releases.** Two, each usable on the phone by itself: **b1 = leftover nights** (tag `b1-ready` after Task 6) and **b2 = busy nights** (tag `b2-ready` after Task 9). Nothing reaches `main` before the cart's own release. b1 may ship before or after a1–a3 (it shares no behaviour with them); b2 ships only after a3 is live. To release: `git checkout -b release/bN bN-ready && git merge main`, the four checks, `scripts/e2e-local.sh`, merge to `main`, deploy, check production.
- **Env.** No new environment variables, no secrets.
- **Migration.** Fixed by the controller for all phases: S1 = 0008, a = 0009, **b = `0010_family_phase_b.sql`**, c = 0011, e = 0012, d = 0013, g = 0014, h = 0015. (The phase overview says 0009 for b; read it as 0010.) 0010 touches only `households`, `weeks` and `week_meals` from 0001 and depends on none of 0007–0009. It is written under its fixed name even if the folder on `family-b` does not yet hold 0008 or 0009; the gap closes when those branches merge.
- **Spend guard (S1).** Phase (b) makes no paid call: no AI, no Brave, no Spoonacular, no Kroger call is added, and the quick filter works on results the browser already has. Nothing here goes near `ai_gate`. If a task finds it needs a paid call, stop and tell the controller.
- **Version.** Task 9 sets the next minor after whatever `main` says then (0.4.0 if phase (a) shipped as 0.3.0).
- **Faster without loss.** Tasks 1 and 2 are pure and independent of everything; either can go first. Tasks 1–6 need no merge from `family-a`, so stream 2 is never idle waiting on stream 1 until Task 7.

## Global Constraints

- Read `AGENTS.md` first: this Next.js differs from older versions. Check `node_modules/next/dist/docs/` before using route handlers, `cookies()` or `searchParams`.
- No Supabase service-role key. Every database call uses the signed-in user's session and row-level security. No secrets in client code. Never open `.env*` files.
- Migrations only add. Nothing existing is dropped, renamed or tightened. `week_meals.meal_id` stays `not null`.
- `lib/domain/*` is pure: no imports from `lib/db`, `lib/kroger`, `lib/recipes`, `lib/ai`, React or Next. (`lib/week/format.ts` imports only domain types, so domain files may import `dayName`, `dayShort` and `formatMinutes` from it.)
- **One rule for "does this night buy food".** Only `cookedNights()` from `lib/domain/leftovers.ts` decides it. Every place that turns `week_meals` rows into meals for a list, a price or an overlap score calls it; nobody tests `leftover_of` by hand.
- **Money.** A leftovers night adds nothing to the list and nothing to the budget, on a phone with this release and on a phone still running the release before it (that is what `servings_override = 0` is for). The doubled night's amounts go through the same `scaleMeal` → `buildShoppingList` → package math as any `servings_override`; no second way to scale.
- **Nothing is ordered or sent.** No task touches the cart, a Fred Meyer store or `cart_sends`. New e2e specs create their own household, never pick a store and never send a cart.
- **No nagging.** A slow dinner on a busy night gets no warning. A leftovers night is never asked "How was dinner?".
- Old shapes keep working: `leftover_of` is read as `row.leftover_of ?? null` and `busy_days` as `?? []`, because a week cached on a phone before this release has neither.
- Current look only: existing colour tokens, `lib/ui.ts` strings (`pillButton`, `primaryButton`, `textInput`, `focusRing`), `Sheet`, `MealThumb`. Inline hex values already in the artboards are allowed (`#A6261B`, `#EEF0ED`, `#EAEEE9`, `#4A544F`, `#134D31`, `#2C5A42`, `#8A948E`, `#C9D1C9`, `#E6F2EB`). No dark styles. Do not restyle existing screens beyond what a task names.
- Touch targets ≥ 44 px both ways, contrast ≥ 4.5:1, real `button`/`a`/`label` elements, no sideways scroll at 360 px. Colour never carries meaning alone: a busy night always has the word "Busy".
- Copy is fixed where quoted (curly apostrophes as written).
- Existing tests keep passing. An existing assertion may change only where a task says so; list each changed assertion in the commit body.
- Every task ends with `npm run lint && npm run typecheck && npm test && npm run build` green ("the four checks") and one commit, with the two trailer lines shown in each commit step. pgTAP runs with `npx supabase test db` if the local stack is up, otherwise in CI.
- **e2e runs only through `scripts/e2e-local.sh <spec>`**, for implementers and the controller alike. Never `npx playwright test` or `npm run test:e2e` by hand. If the local stack cannot start, leave the run to CI and say so in the commit body.
- Steps marked **controller** (production Supabase, Vercel, merges, releases) are not the implementer's.
- **Review tier** is marked on every task. `full`: its own task review. `batched`: reviewed together with the neighbouring batched task named beside it.

## Review Focus

1. **The leftovers night buys nothing, anywhere, and the doubled night buys exactly twice.** The list, the budget meter, "Fits this week", the "Under $15" chip and a phone on the old release must all agree. A leftovers row whose cooking row has just been deleted, or whose meal no longer loads, must not turn into a paid dinner. → Tasks 1, 4, 5 (unit), Task 6 (e2e reads the list before and after).
2. **Two writers.** Both phones pick a leftovers night at once; one phone puts a dinner on the night the other is about to give to leftovers; one phone takes the cooking night off while the other moves the leftovers; an old copy of the app replaces the meal on a cooking night. End state is always legal: at most one leftovers night per cooking night, same week, same meal, never a leftovers night with no cooking night. → pgTAP in Task 3, e2e in Task 6.
3. **Half-finished changes.** Cook double is two writes (double, then add the night) and so is taking leftovers off (remove the night, then un-double). A failure between them must leave a state the screens name correctly ("Cooking double" / "No leftovers night") and that Change can repair. → Task 4 tests the order of writes.
4. **Week edges.** The cooking night is the last night of the week; the week starts on a day other than Sunday; the only later nights are taken; a leftovers night four days on is offered and five is not; Repeat copies a week that has a doubled dinner into a week that already has one. → Tasks 1 and 4.
5. **Quick means what the screen says.** 30 minutes exactly is quick and 31 is not; no time is not quick; a slow-cooker recipe of 8 hours is quick; "Grilled cheese" is not a grill and "freezer-friendly" is make-ahead; the count in "5 more take longer" is right when the switch flips. Busy days survive a household whose week starts on Wednesday, junk in the array, and both phones tapping different nights. → Tasks 2, 5 and 8.

---

## File Structure

```
supabase/migrations/0010_family_phase_b.sql   households.busy_days, weeks.busy_days, week_meals.leftover_of, two triggers, realtime for weeks
supabase/tests/rls_test.sql                   (modified) cross-household and rule tests for the above
lib/domain/leftovers.ts      Night, isLeftover, cookedNights, leftoverFor, cookNightOf, doubleServings, cookState, nightChoices, defaultChoice, laterWords
lib/domain/busy.ts           cleanDays, busyDays, busyChoice, withChoice, busyLine, busySummary, quickReason, titleSaysMakeAhead, QUICK_LABEL
lib/week/note.ts             (modified) dayNote says "cooking double"
lib/week/leftover-copy.ts    the words on the picker, the done box and the leftovers sheet
lib/db/queries/weeks.ts      (modified) setWeekMeal clears leftover_of; copyWeek keeps the link; cookDouble, moveLeftover, removeLeftover, usualAmount, NightTakenError
lib/db/queries/busy.ts       readBusy, setBusyChoice
lib/db/types.ts, lib/db/rows.ts               (modified) the three columns
lib/useWeekList.ts, components/add-meal/AddMealScreen.tsx   (modified) cookedNights before building entries
components/leftovers/CookDoubleRow.tsx        the ask row and the green "Cooking double" box
components/leftovers/NightPicker.tsx          "Eat the leftovers on" (content only; lives inside its host's Sheet)
components/leftovers/LeftoverSheet.tsx        the leftovers night opened from the week
components/busy/BusyLine.tsx, BusyNightsSheet.tsx, BusyBanner.tsx
components/MealSheet.tsx, WeekScreen.tsx, DayRow.tsx, useWeekData.ts   (modified)
components/add-meal/SearchTab.tsx, components/FavoritesBrowser.tsx     (modified, Task 8)
lib/recipes/search/quick.ts  optionQuick, mealQuick (Task 8; needs phase a's cookMethod and toFacts)
lib/recipes/search/fake.ts   (modified, Task 8) "chili" fixtures
e2e/leftovers.spec.ts, e2e/busy-nights.spec.ts
```

**Shared files with other streams, and how conflicts are kept small.**

| File | Also touched by | This plan's edit | Sequencing |
|---|---|---|---|
| `components/MealSheet.tsx` | a Tasks 7, 9, 12 (blocks added after the note) | Replaces only the stepper block (today's lines 123–133) and adds one line above "Take off"; new props at the end of the prop list | Different hunks; merges cleanly unless a reorders the tail. Block order after both: a's order, then `CookDoubleRow`, favorite, take off |
| `components/WeekScreen.tsx` | a Tasks 7, 12 (allergy on `filled`, verdict card above Dinners) | `filled` for leftovers rows, `busy` prop, `BusyLine` after the day list, two sheets at the end | Hand-merge the `filled={…}` object at `a2-ready`/`a3-ready` |
| `components/DayRow.tsx` | a Task 7 (`FilledDay.allergy`) | One new prop `busy`; Task 9 adds `FilledDay.keepNote` | Small; hand-merge the day cell |
| `components/useWeekData.ts` | a Tasks 10, 12 (backfill call; `meal_verdicts` in the subscription); cart W1 (single-flight) | `busy` in `WeekData`; `"weeks", "households"` in the subscription list | Hand-merge the one subscription array |
| `lib/week/note.ts` | a Task 4 (`changeNotes` appended in `dayNote`) | New optional 4th parameter and the leftovers phrase | Hand-merge the `return`; final order: main · cooking double · person changes |
| `lib/useWeekList.ts` | cart W1 and Task 9 | One line: `cookedNights(weekMeals)` | Merge after W1 lands on `fm-cart` |
| `components/add-meal/AddMealScreen.tsx`, `SearchTab.tsx`, `FavoritesBrowser.tsx`, `lib/recipes/search/fake.ts` | a Tasks 6, 7, 9, 10, 13 | Task 5 changes one line in `AddMealScreen`; everything else is Task 8, **after** `a3-ready` is merged | Built on top of a, not beside it |
| `lib/db/queries/verdicts.ts`, `components/flags/*` | a Tasks 6, 7, 12 (creates them) | Task 9 only, after `a3-ready` | Built on top of a |
| `supabase/tests/rls_test.sql`, `lib/db/types.ts`, `lib/db/rows.ts` | a Task 1, S1, every later phase | Appends a block; raises `plan(N)` by the number added (read N from the file) | Hand-merge `plan(N)`: add the counts |
| `docs/superpowers/plans/2026-11-26-premium-pass.md`, `package.json` | every phase's last task | Appends a list; bumps the version | Controller serialises last tasks |

Phase (c) (stream 1) consumes from this plan: `busyDays`, `quickReason`, `cookedNights`, `nightChoices`, `doubleServings` and the query `cookDouble`. Their signatures below are the contract; changing one after Task 2 needs the controller.

**Commit trailers.** Every commit in this plan ends with these two lines, as its own last paragraph (each commit step shows them):

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ
```

---

### Task 1: Leftover logic (pure)

**Review tier: full** (decides what the list buys).

**Files:**
- Create: `lib/domain/leftovers.ts`, `tests/unit/leftovers.test.ts`
- Modify: `lib/week/note.ts` (`dayNote`), `tests/unit/week-note.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // leftovers.ts — a structural type, so the domain never imports lib/db; a WeekMeal row fits it
  export interface Night { id: string; day: string; slot: string; meal_id: string; servings_override: number | null; leftover_of?: string | null }
  export const KEEP_DAYS = 4;
  export function isLeftover(n: Night): boolean;                                   // !!n.leftover_of
  export function cookedNights<T extends Night>(rows: T[]): T[];                    // the rows that buy food
  export function leftoverFor<T extends Night>(rows: T[], cookId: string): T | null;
  export function cookNightOf<T extends Night>(rows: T[], leftover: T): T | null;  // null when its cooking row is not in `rows`
  export function doubleServings(base: number): number;                             // 2 × base, to one decimal
  export type CookState = { kind: 'usual' } | { kind: 'double'; night: Day | null } | { kind: 'extra'; servings: number };
  export function cookState(row: Night, rows: Night[], base: number): CookState;
  export interface NightChoice { day: Day; daysLater: number; taken: 'dinner' | 'leftovers' | null; takenMealId: string | null; busy: boolean; current: boolean }
  export function nightChoices(o: { cookDay: Day; slot: string; weekDays: Day[]; rows: Night[]; busy: Day[]; cookId: string }): NightChoice[];
  export function defaultChoice(choices: NightChoice[]): Day | null;
  export function laterWords(daysLater: number): string;                           // 1 → "The next night", n → "n days later"
  // note.ts
  export function dayNote(meal: Meal, people: Person[], servingsOverride: number | null, double?: boolean): string;
  ```
- Rules:
  - `cookState`: a leftovers row exists for this row → `{ kind: 'double', night: its day }`, whatever the override says. Else `servings_override` null or ≤ `base + 0.05` → `usual`. Else within 0.06 of `2 × base` → `{ kind: 'double', night: null }`. Else `{ kind: 'extra', servings: override − base, to one decimal }`.
  - `nightChoices`: the days of `weekDays` after `cookDay`, in week order, with `daysLater` 1 to `KEEP_DAYS`. `taken` is `'leftovers'` when another cooking night's leftovers row holds that day and slot, `'dinner'` when a cooked row does, `null` when the night is free **or holds this cooking night's own leftovers** (then `current: true`). `takenMealId` is that row's `meal_id`. Rows in other slots are ignored. `busy` is `busy.includes(day)`.
  - `defaultChoice`: the `current` one; else the first free busy night; else the first free night; else `null` ("No set night").
  - `dayNote`: when `double` is true, or the override is within 0.06 of twice the household's servings, the leftovers part reads "cooking double" in place of "+N for leftovers". Anything else is unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
// leftovers.test.ts
const n = (id: string, day: string, o: Partial<Night> = {}): Night => ({ id, day, slot: 'dinner', meal_id: 'm-' + id, servings_override: null, ...o });
const sunWeek: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
it('only cooked nights buy food', () => {
  const rows = [n('a', 'wed', { servings_override: 7.6 }), n('b', 'fri', { meal_id: 'm-a', leftover_of: 'a', servings_override: 0 }), n('c', 'mon')];
  expect(cookedNights(rows).map((r) => r.id)).toEqual(['a', 'c']);
  expect(cookedNights([{ ...n('old', 'tue') }])).toHaveLength(1);              // a row cached before this release has no leftover_of
  expect(leftoverFor(rows, 'a')?.id).toBe('b');
  expect(leftoverFor(rows, 'c')).toBeNull();
  expect(cookNightOf(rows, rows[1])?.id).toBe('a');
  expect(cookNightOf([rows[1]], rows[1])).toBeNull();
});
it('doubles to one decimal', () => {
  expect(doubleServings(3.8)).toBe(7.6);
  expect(doubleServings(3.85)).toBe(7.7);
});
it.each([
  [null, false, { kind: 'usual' }],
  [3.8, false, { kind: 'usual' }],
  [7.6, false, { kind: 'double', night: null }],
  [5.8, false, { kind: 'extra', servings: 2 }],
  [7.6, true, { kind: 'double', night: 'fri' }],
  [5.8, true, { kind: 'double', night: 'fri' }],       // people changed after doubling: the leftovers row still says double
])('cook state for override %s (leftovers row: %s)', (override, has, want) => {
  const cook = n('a', 'wed', { servings_override: override });
  const rows = has ? [cook, n('b', 'fri', { leftover_of: 'a', meal_id: 'm-a', servings_override: 0 })] : [cook];
  expect(cookState(cook, rows, 3.8)).toEqual(want);
});
it('offers later nights of the same week, up to four days on', () => {
  const rows = [n('a', 'sun'), n('x', 'tue'), n('l', 'wed', { leftover_of: 'z' })];
  const got = nightChoices({ cookDay: 'sun', slot: 'dinner', weekDays: sunWeek, rows, busy: ['thu'], cookId: 'a' });
  expect(got.map((c) => [c.day, c.daysLater, c.taken, c.busy])).toEqual([
    ['mon', 1, null, false], ['tue', 2, 'dinner', false], ['wed', 3, 'leftovers', false], ['thu', 4, null, true],
  ]);
  expect(defaultChoice(got)).toBe('thu');                                       // the free busy night first
});
it('offers nothing after the last night, and follows a week that starts on Wednesday', () => {
  expect(nightChoices({ cookDay: 'sat', slot: 'dinner', weekDays: sunWeek, rows: [], busy: [], cookId: 'a' })).toEqual([]);
  const wedWeek: Day[] = ['wed', 'thu', 'fri', 'sat', 'sun', 'mon', 'tue'];
  expect(nightChoices({ cookDay: 'sat', slot: 'dinner', weekDays: wedWeek, rows: [], busy: [], cookId: 'a' }).map((c) => c.day)).toEqual(['sun', 'mon', 'tue']);
});
it('treats its own leftovers night as free and current, and ignores other slots', () => {
  const rows = [n('a', 'wed'), n('b', 'fri', { leftover_of: 'a' }), { ...n('lunch', 'thu'), slot: 'lunch' }];
  const got = nightChoices({ cookDay: 'wed', slot: 'dinner', weekDays: sunWeek, rows, busy: [], cookId: 'a' });
  expect(got.map((c) => [c.day, c.taken, c.current])).toEqual([['thu', null, false], ['fri', null, true], ['sat', null, false]]);
  expect(defaultChoice(got)).toBe('fri');
});
it('falls back to the first free night, then to no set night', () => {
  const free = nightChoices({ cookDay: 'wed', slot: 'dinner', weekDays: sunWeek, rows: [n('x', 'thu')], busy: [], cookId: 'a' });
  expect(defaultChoice(free)).toBe('fri');
  const full = nightChoices({ cookDay: 'thu', slot: 'dinner', weekDays: sunWeek, rows: [n('x', 'fri'), n('y', 'sat')], busy: ['fri'], cookId: 'a' });
  expect(defaultChoice(full)).toBeNull();
});
it('says how far away a night is', () => {
  expect([1, 2, 4].map(laterWords)).toEqual(['The next night', '2 days later', '4 days later']);
});
// week-note.test.ts (added; the two existing "+N for leftovers" cases stay as they are)
it('says cooking double', () => {
  expect(dayNote(veg, familyOfFive, 7.6)).toBe('Everyone vegetarian · cooking double');
  expect(dayNote(veg, familyOfFive, 5.8, true)).toBe('Everyone vegetarian · cooking double');
  expect(dayNote(veg, familyOfFive, null, true)).toBe('Everyone vegetarian · cooking double');
  expect(dayNote(veg, familyOfFive, 5.8)).toBe('Everyone vegetarian · +2 for leftovers');
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/leftovers.test.ts tests/unit/week-note.test.ts`. Expected: FAIL (module missing; new note cases).
- [ ] **Step 3: Implement.** Existing `week-note.test.ts` cases must pass unchanged.
- [ ] **Step 4: Run** the two files plus `npm run typecheck`, then the four checks. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/domain/leftovers.ts lib/week/note.ts tests/unit/leftovers.test.ts tests/unit/week-note.test.ts
git commit -m "feat: leftover-night rules and the cooking-double note" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 2: Busy-night logic (pure)

**Review tier: batched** (with Task 7).

**Files:**
- Create: `lib/domain/busy.ts`, `tests/unit/busy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const QUICK_MINUTES = 30;
  export type BusyChoice = 'no' | 'week' | 'every';
  export function cleanDays(v: unknown): Day[];                                  // known days only, once each, in sun…sat order; anything else → []
  export function busyDays(every: unknown, thisWeek: unknown): Day[];            // both lists together, cleaned
  export function busyChoice(day: Day, every: Day[], thisWeek: Day[]): BusyChoice;   // 'every' wins when a day is in both
  export function withChoice(every: Day[], thisWeek: Day[], day: Day, choice: BusyChoice): { every: Day[]; thisWeek: Day[] };
  export function busyLine(days: Day[], weekDays: Day[]): string;
  export function busySummary(every: Day[], thisWeek: Day[], weekDays: Day[]): string;
  export type QuickReason = 'minutes' | 'slow_cooker' | 'make_ahead';
  export function quickReason(f: { totalMinutes: number | null; method: string | null; makeAhead: boolean }): QuickReason | null;
  export function titleSaysMakeAhead(title: string): boolean;
  export const QUICK_LABEL: Record<QuickReason, string | null>;                  // { minutes: null, slow_cooker: 'Slow cooker', make_ahead: 'Make ahead' }
  ```
- Rules:
  - `withChoice`: `'every'` puts the day in `every` and takes it out of `thisWeek`; `'week'` the other way round; `'no'` takes it out of both. Both results are cleaned.
  - `busyLine` (days named with `dayShort`, in `weekDays` order, joined "Tue", "Tue and Thu", "Mon, Tue and Thu"): none → "No busy nights this week"; all seven → "Busy nights: every night"; else "Busy nights: Tue and Thu".
  - `busySummary` (days named with `dayName`, same joining): neither → "No busy nights."; only every → "Every Tuesday and Friday."; only this week → "This Thursday."; both → "Every Tuesday, and this Thursday."
  - `quickReason`, in this order: `totalMinutes` is a number from 1 to `QUICK_MINUTES` → `'minutes'`; `method === 'slow_cooker'` → `'slow_cooker'`; `makeAhead` → `'make_ahead'`; else `null`. `method` is a plain string here so this file does not wait for phase (a)'s `CookMethod` type.
  - `titleSaysMakeAhead`: lower-case, hyphens to spaces, then true for "make ahead", "overnight", "freezer".

- [ ] **Step 1: Write the failing tests**

```ts
const sunWeek: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
it('cleans what the database hands back', () => {
  expect(cleanDays(['thu', 'tue', 'tue', 'someday', 5, null])).toEqual(['tue', 'thu']);
  expect(cleanDays(null)).toEqual([]);
  expect(cleanDays('tue')).toEqual([]);
  expect(busyDays(['tue'], ['thu', 'tue'])).toEqual(['tue', 'thu']);
  expect(busyDays(undefined, undefined)).toEqual([]);                           // a household cached before this release
});
it('reads and sets one night', () => {
  expect(busyChoice('tue', ['tue'], ['tue'])).toBe('every');
  expect(busyChoice('thu', ['tue'], ['thu'])).toBe('week');
  expect(busyChoice('fri', ['tue'], ['thu'])).toBe('no');
  expect(withChoice(['tue'], ['thu'], 'thu', 'every')).toEqual({ every: ['tue', 'thu'], thisWeek: [] });
  expect(withChoice(['tue'], ['thu'], 'tue', 'week')).toEqual({ every: [], thisWeek: ['tue', 'thu'] });
  expect(withChoice(['tue'], ['thu'], 'tue', 'no')).toEqual({ every: [], thisWeek: ['thu'] });
  expect(withChoice([], [], 'sat', 'no')).toEqual({ every: [], thisWeek: [] });
});
it('writes the line under the week, in the week’s own order', () => {
  expect(busyLine([], sunWeek)).toBe('No busy nights this week');
  expect(busyLine(['tue'], sunWeek)).toBe('Busy nights: Tue');
  expect(busyLine(['thu', 'tue'], sunWeek)).toBe('Busy nights: Tue and Thu');
  expect(busyLine(['mon', 'tue', 'thu'], sunWeek)).toBe('Busy nights: Mon, Tue and Thu');
  expect(busyLine(['tue', 'thu'], ['wed', 'thu', 'fri', 'sat', 'sun', 'mon', 'tue'])).toBe('Busy nights: Thu and Tue');
  expect(busyLine(sunWeek, sunWeek)).toBe('Busy nights: every night');
});
it('sums up the sheet', () => {
  expect(busySummary([], [], sunWeek)).toBe('No busy nights.');
  expect(busySummary(['tue', 'fri'], [], sunWeek)).toBe('Every Tuesday and Friday.');
  expect(busySummary([], ['thu'], sunWeek)).toBe('This Thursday.');
  expect(busySummary(['tue'], ['thu'], sunWeek)).toBe('Every Tuesday, and this Thursday.');
});
it.each([
  [{ totalMinutes: 30, method: null, makeAhead: false }, 'minutes'],
  [{ totalMinutes: 31, method: null, makeAhead: false }, null],
  [{ totalMinutes: null, method: null, makeAhead: false }, null],
  [{ totalMinutes: 0, method: null, makeAhead: false }, null],
  [{ totalMinutes: 480, method: 'slow_cooker', makeAhead: false }, 'slow_cooker'],
  [{ totalMinutes: 20, method: 'slow_cooker', makeAhead: true }, 'minutes'],
  [{ totalMinutes: 70, method: 'oven', makeAhead: true }, 'make_ahead'],
  [{ totalMinutes: 70, method: 'grill', makeAhead: false }, null],
])('quick: %o → %s', (facts, want) => expect(quickReason(facts)).toBe(want));
it('reads make-ahead from a title', () => {
  expect(['Make-ahead breakfast burritos', 'Overnight oats', 'Freezer-friendly chili', 'Grilled cheese'].map(titleSaysMakeAhead)).toEqual([true, true, true, false]);
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/busy.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then the four checks. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/domain/busy.ts tests/unit/busy.test.ts
git commit -m "feat: busy-night rules and what counts as a quick dinner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 3: Migration 0010, row-level security tests, types

**Review tier: full** (RLS, triggers, sync).

**Files:**
- Create: `supabase/migrations/0010_family_phase_b.sql`
- Modify: `supabase/tests/rls_test.sql` (raise `plan(N)` by the number of tests added; read N from the file), `lib/db/types.ts`
- Test: `supabase/tests/rls_test.sql`

**Interfaces:**
- Produces (SQL):
  - `alter table public.households add column busy_days text[] not null default '{}' check (busy_days <@ array['sun','mon','tue','wed','thu','fri','sat'] and cardinality(busy_days) <= 7);` and `grant update (busy_days) on public.households to authenticated;` (column grants on `households` add to those in 0001, 0004 and 0006; the existing `households_update` policy already limits rows to members).
  - `alter table public.weeks add column busy_days text[]` with the same default and check. `weeks` already grants `update` to `authenticated` under `is_member(household_id)`.
  - `alter table public.week_meals add column leftover_of uuid references public.week_meals (id) on delete cascade, add constraint week_meals_leftover_not_self check (leftover_of is null or leftover_of <> id);`
  - `create unique index week_meals_one_leftover on public.week_meals (leftover_of) where leftover_of is not null;` (one leftovers night per cooking night; it also serves lookups by `leftover_of`).
  - Function `public.week_meals_leftover_check()` (`returns trigger language plpgsql security invoker set search_path = ''`), trigger `week_meals_leftover_check before insert or update on public.week_meals for each row`:
    1. On update, when `new.meal_id is distinct from old.meal_id` and `new.leftover_of is not distinct from old.leftover_of` and `new.leftover_of is not null`: set `new.leftover_of := null` (a different dinner was put on a leftovers night, by any version of the app; it becomes an ordinary dinner) and return.
    2. When `new.leftover_of is not null`: select the parent row by id. If there is none visible, or its `week_id <> new.week_id`, or its `meal_id <> new.meal_id`, or its own `leftover_of is not null`: `raise exception 'leftovers must follow a cooking night of the same meal in the same week' using errcode = '23514'`.
  - Function `public.week_meals_leftover_tidy()` (same attributes), trigger `week_meals_leftover_tidy after insert or update on public.week_meals for each row`: when (`tg_op = 'UPDATE'` and `new.meal_id is distinct from old.meal_id`) or `new.leftover_of is not null`: `delete from public.week_meals where leftover_of = new.id;` (leftovers of a dinner that is no longer that dinner, or of a night that has itself become leftovers, are dropped).
  - Both functions: `revoke all on function … from public, anon;` (they are only ever run by the triggers).
  - `alter publication supabase_realtime add table public.weeks;` (`households` joined it in 0004; `week_meals` in 0001).
  - Header comment: only adds; depends on nothing after 0001; safe to apply before or after 0007–0009.
- Produces (TypeScript): `Database` types with `busy_days: string[]` on `households` and `weeks` and `leftover_of: string | null` on `week_meals` (Row; optional in Insert and Update). `WeekMeal` and `Household` in `lib/db/rows.ts` pick them up with no edit.

- [ ] **Step 0: Check the base.** `ls supabase/migrations | tail -1` prints one of `0007_item_keys_by_food.sql`, `0008_spend_guard.sql`, `0009_family_phase_a.sql`. Anything else: stop and tell the controller. Confirm no file starting `0010_` exists. Note the current `plan(N)`.
- [ ] **Step 1: Write the failing pgTAP tests** in `rls_test.sql`, after the block where C joins HA. `W_A`, `M_A`, `W_B`, `M_B` are already in `t_kv`; each household's seeded row is Monday dinner. Tests (as A unless said):
  - `update public.households set busy_days = array['tue']` on HA changes 1 row and reads back; on HB changes 0 rows (verified as B: still `{}`).
  - `busy_days = array['someday']` on HA's household → `23514`; on HA's week → `23514`; eight entries → `23514`.
  - `update public.weeks set busy_days = array['thu']` on HA's week works; on HB's week changes 0 rows.
  - Insert a leftovers row for HA: `(household_id HA, week_id W_A, day 'wed', slot 'dinner', meal_id M_A, servings_override 0, leftover_of <HA's Monday row>)` succeeds; C (same household) reads it.
  - A second leftovers row for the same cooking row on `'thu'` → `23505`.
  - A leftovers row whose `leftover_of` is HB's Monday row (with HA's week and meal) → `23514` (the parent is not visible to A). The same as the superuser with HB's week but HA's meal id → rejected (`23514` or the existing composite foreign key `23503`; assert it throws).
  - A leftovers row pointing at HA's Monday row but with a second HA meal → `23514`. In a second HA week → `23514`. Pointing at HA's Wednesday leftovers row (a chain) → `23514`. Pointing at itself (update `leftover_of = id`) → `23514`.
  - Update HA's Monday row to a second HA meal → the Wednesday leftovers row is gone.
  - Re-create the leftovers row; update **it** to the second meal with `servings_override = null` (what an older app sends) → the row stays, `leftover_of` is null.
  - Re-create; delete HA's Monday row → the leftovers row is gone too.
  - As B: `select count(*) from public.week_meals where leftover_of is not null` → 0. As anon: `select busy_days from public.weeks` → `42501`.
  - `select has_function_privilege('authenticated', 'public.week_meals_leftover_check()', 'execute')` is false; the same for `…_tidy()`.
- [ ] **Step 2: Write `0010_family_phase_b.sql`** as in Interfaces. Run `npx supabase test db` if the local stack starts. Expected: all tests pass, including every test that was there before (the triggers must not disturb an ordinary insert, upsert or delete of `week_meals`).
- [ ] **Step 3: Update `lib/db/types.ts` by hand** to match. Run the four checks. Expected: green (nothing reads the columns yet).
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_family_phase_b.sql supabase/tests/rls_test.sql lib/db/types.ts
git commit -m "feat(db): busy nights and linked leftover nights" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

- [ ] **Step 5 (controller): apply 0010 to production on its own.** List the production migration history through the Supabase MCP and write down which of 0007, 0008 and 0009 are there. Apply 0010 under its own name (it only adds, and the live app ignores the new columns). Record in the ledger what is still pending and whose step applies it. Run the security advisors. Regenerate `lib/db/types.ts` from the local stack and replace the hand-edited file if it differs. This step ships no code.

---

### Task 4: Queries — cook double, move, take off, repeat

**Review tier: full** (list amounts, two writers, sync).

**Files:**
- Modify: `lib/db/queries/weeks.ts`
- Create: `tests/unit/weeks-queries.test.ts`

**Interfaces:**
- Consumes: `WeekMeal.leftover_of` (Task 3); `isLeftover`, `cookedNights`, `leftoverFor` (Task 1).
- Produces:
  ```ts
  export class NightTakenError extends Error {}                                   // the chosen night got a dinner first (unique violation 23505)
  /** Doubles the cooking night, then sets, moves or clears its leftovers night. `servings` comes from doubleServings(). */
  export async function cookDouble(sb: Sb, cook: WeekMeal, servings: number, leftoverDay: Day | null): Promise<void>;
  export async function moveLeftover(sb: Sb, leftoverId: string, day: Day): Promise<void>;
  /** Takes a leftovers night off, then puts its cooking night back to the usual amount. */
  export async function removeLeftover(sb: Sb, leftover: WeekMeal): Promise<void>;
  /** Back to the usual amount: removes the leftovers night if there is one, then clears the override. */
  export async function usualAmount(sb: Sb, cook: WeekMeal): Promise<void>;
  ```
- `cookDouble`, in this order, each failing with a thrown `Error` and stopping:
  1. `update week_meals set servings_override = servings where id = cook.id`.
  2. Read the current leftovers row (`.eq('leftover_of', cook.id).maybeSingle()`).
  3. `leftoverDay === null`: delete that row if there is one. Otherwise, a row on another day → `update … set day = leftoverDay where id = row.id`; no row → `insert { household_id, week_id, day: leftoverDay, slot: cook.slot, meal_id: cook.meal_id, servings_override: 0, leftover_of: cook.id }` (an insert, never an upsert, so it cannot replace a dinner). Error code `23505` on either → `throw new NightTakenError()`.
  - The double is written first on purpose: if step 3 fails the week says "Cooking double / No leftovers night", which is true and which Change repairs. The reverse order could leave a leftovers night with a single batch.
- `moveLeftover`: one update of `day`; `23505` → `NightTakenError`.
- `removeLeftover`: delete the leftovers row, then `update week_meals set servings_override = null where id = leftover.leftover_of`. `usualAmount`: delete `.eq('leftover_of', cook.id)`, then clear the override on `cook.id`.
- `setWeekMeal`: the upsert payload gains `leftover_of: null` (a dinner put on any night is an ordinary dinner; the database already does this for an older app, see Task 3 rule 1). The `mealId === null` branch is unchanged: deleting a cooking night cascades to its leftovers night.
- `copyWeek(from, to)` keeps links. New order:
  1. Read both weeks as today. If `from` is empty, return as today.
  2. Delete every leftovers row of the target week (`.eq('week_id', toWeekId).not('leftover_of', 'is', null)`). They are being replaced anyway, and clearing them first means no step below can trip the one-per-cooking-night rule.
  3. Upsert the source's cooked rows (`cookedNights(from)`) with `leftover_of: null`, as today, adding `.select('id, day, slot')`.
  4. Insert the source's leftovers rows, each with `leftover_of` = the id returned in step 3 for its cooking row's `(day, slot)` and `servings_override: 0`, upserting on `week_id,day,slot`. A leftovers row whose cooking row is not in the source is skipped.
  5. Delete stale target rows as today (`wanted` is built from every source row, cooked or leftovers).
  6. `bumpTimesPlanned` counts cooked rows only.

- [ ] **Step 1: Write the failing tests** (`tests/unit/weeks-queries.test.ts`; the Supabase client is stubbed the way `tests/unit/household-queries.test.ts` does it, recording each call as `[table, verb, payload, filters]`).

```ts
// cookDouble
//  - a night given, no leftovers row yet → calls in order: update week_meals {servings_override: 7.6} id=cook.id; select leftover_of=cook.id;
//    insert {household_id, week_id, day: 'fri', slot: 'dinner', meal_id: cook.meal_id, servings_override: 0, leftover_of: cook.id}. No upsert is made.
//  - a leftovers row already on Friday, Saturday chosen → update {day: 'sat'} id=row.id; no insert.
//  - a leftovers row already on Friday, Friday chosen → no write after the first update.
//  - null chosen with a row → delete id=row.id. null chosen with no row → only the first update.
//  - the insert answers { code: '23505' } → rejects with NightTakenError, and the first update was already made.
//  - the first update answers an error → rejects, and nothing else was called.
// moveLeftover: update {day}; '23505' → NightTakenError; another error → Error.
// removeLeftover: delete id=leftover.id, THEN update {servings_override: null} id=leftover.leftover_of (assert the order);
//    the delete fails → the update is not made.
// usualAmount: delete leftover_of=cook.id, then update {servings_override: null} id=cook.id.
// setWeekMeal: the upsert payload toEqual today's payload plus leftover_of: null.
// copyWeek, source = Wed cooked (7.6) + Fri leftovers of it + Mon cooked; target = Mon cooked (other meal) + Tue leftovers of it + Sat cooked:
//  - first write is the delete of the target's leftovers rows;
//  - the cooked upsert has two rows, both leftover_of: null, Wed with servings_override 7.6;
//  - the leftovers upsert has one row: day 'fri', servings_override 0, leftover_of = the id the stub returned for Wed;
//  - the stale delete names the target's Sat row;
//  - the meals bumped are the two cooked meals only (Mon's changed meal and Wed's), never the leftovers row's.
// copyWeek with a source leftovers row whose cooking row is missing → that row is not written, and nothing throws.
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/weeks-queries.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then the four checks. Expected: PASS; `e2e/week.spec.ts` is not run here (Task 6 runs it).
- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/weeks.ts tests/unit/weeks-queries.test.ts
git commit -m "feat: cook double, move and take off leftovers; Repeat keeps the link" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 5: The list, the budget and "Fits this week" skip leftovers nights

**Review tier: full** (money).

**Files:**
- Modify: `lib/useWeekList.ts` (where `entries` is built from `weekMeals`), `components/add-meal/AddMealScreen.tsx` (the "other dinners this week" effect), `tests/unit/build-list.test.ts`
- Create: `lib/list/entries.ts`, `tests/unit/list-entries.test.ts`

**Interfaces:**
- Consumes: `cookedNights` (Task 1); `toMeal` (`lib/db/queries/meals.ts`).
- Produces:
  ```ts
  // lib/list/entries.ts — the one place week rows become things to buy
  export function weekEntries(rows: WeekMeal[], meals: Map<string, MealRow>): { meal: Meal; servings: number | null }[];
  ```
  `weekEntries` = for each of `cookedNights(rows)` whose meal is in the map: `{ meal: toMeal(row), servings: servings_override === null ? null : Number(servings_override) }`. It is today's inline code in both callers, moved, with the one new filter. Both callers use it; neither keeps its own copy.
- `useWeekList.ts`: `getMeals` is asked only for cooked rows' meal ids. `AddMealScreen.tsx`: same, after its existing filter that drops the night being added.
- Not touched: `lib/domain/list.ts`, `lib/domain/scaling.ts`, `lib/domain/packages.ts`. The doubled night is an ordinary `servings_override`.

- [ ] **Step 1: Write the failing tests**

```ts
// list-entries.test.ts (tacosRow = a MealRow built from the tacos fixture; base servings 4; familyOfFive = 3.8)
it('a leftovers night is not an entry', () => {
  const rows = [wm('a', 'wed', tacosRow.id, { servings_override: 7.6 }), wm('b', 'fri', tacosRow.id, { servings_override: 0, leftover_of: 'a' })];
  expect(weekEntries(rows, new Map([[tacosRow.id, tacosRow]]))).toEqual([{ meal: toMeal(tacosRow), servings: 7.6 }]);
});
it('keeps ordinary nights, with and without an override, and drops a night whose meal did not load', () => {
  const rows = [wm('a', 'mon', tacosRow.id), wm('c', 'tue', 'gone')];
  expect(weekEntries(rows, new Map([[tacosRow.id, tacosRow]]))).toEqual([{ meal: toMeal(tacosRow), servings: null }]);
});
it('a leftovers night whose cooking night is not in the rows still buys nothing', () => {
  expect(weekEntries([wm('b', 'fri', tacosRow.id, { servings_override: 0, leftover_of: 'a' })], new Map([[tacosRow.id, tacosRow]]))).toEqual([]);
});
// build-list.test.ts (added) — the money check, through the real list builder
it('cook double buys exactly twice, the leftovers night buys nothing, and the swap doubles', () => {
  const single = buildList(inputs([{ meal: tacos, servings: null }]));
  const doubled = buildList(inputs(weekEntries([cook7_6, leftoverFri], mealsMap)));
  for (const food of ['boneless chicken thighs', 'black beans', 'yellow onion']) {
    expect(grams(row(doubled, food))).toBeCloseTo(2 * grams(row(single, food)), 3);   // same helper the file already uses for amounts
  }
  expect(doubled.items).toHaveLength(single.items.length);
});
it('a phone on the last release adds nothing for a leftovers night either', () => {
  // what that release does: every row becomes an entry, with its override
  const old = buildList(inputs([{ meal: tacos, servings: 7.6 }, { meal: tacos, servings: 0 }]));
  const now = buildList(inputs([{ meal: tacos, servings: 7.6 }]));
  expect(old.items.map((i) => [i.key, i.parts])).toEqual(now.items.map((i) => [i.key, i.parts]));
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/list-entries.test.ts tests/unit/build-list.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** If the last test fails because a zero amount makes a row or a part appear, do not special-case zero in `lib/domain`: stop and tell the controller (the fallback is to drop `servings_override = 0` from the design, which changes Task 4).
- [ ] **Step 4: Run** the four checks. Expected: green; `overlap.test.ts`, `list.test.ts` and `packages.test.ts` unchanged.
- [ ] **Step 5: Commit**

```bash
git add lib/list/entries.ts lib/useWeekList.ts components/add-meal/AddMealScreen.tsx tests/unit/list-entries.test.ts tests/unit/build-list.test.ts
git commit -m "feat: leftover nights add nothing to the list or the budget" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 6: Cook double on the meal sheet, the leftovers night on the week, and the b1 end-to-end

**Review tier: full** (two phones, the list).

**Files:**
- Create: `lib/week/leftover-copy.ts`, `components/leftovers/CookDoubleRow.tsx`, `components/leftovers/NightPicker.tsx`, `components/leftovers/LeftoverSheet.tsx`, `tests/unit/leftover-copy.test.ts`, `e2e/leftovers.spec.ts`
- Modify: `components/MealSheet.tsx` (the stepper block goes; `CookDoubleRow` and the picker view come; one line above "Take off"), `components/WeekScreen.tsx` (leftovers rows; which sheet opens), `components/useWeekData.ts` (nothing new is fetched: `weekMeals` already holds every row; `getMeals` is unchanged because a leftovers row has its cooking night's `meal_id`)

**Interfaces:**
- Consumes: Tasks 1 and 4; `swapPeople`, `joinNames` (`lib/week/note.ts`); `dayName` (`lib/week/format.ts`); `householdServings`.
- Produces:
  ```ts
  // leftover-copy.ts (pure)
  export function pickerIntro(mode: 'cook' | 'move', mealName: string, cookDay: Day): { title: string; sub: string; action: string };
  export function choiceSub(c: NightChoice, takenName: string | null): string;
  export function tintLines(day: Day | null, swapLine: string | null): string[];
  export function swapDoubleLine(meal: Meal, people: Person[]): string | null;
  export function lastNightLine(cookDay: Day): string;
  export function doneBox(state: CookState): { head: string; sub: string } | null;   // null for 'usual'
  export function leftoverRowNote(mealName: string, cookDay: Day): string;
  export function leftoverSheetCopy(mealName: string, day: Day, cookDay: Day, daysBefore: number, swapLine: string | null): { when: string; nothing: string; undo: string };
  export function takeOffNote(leftoverDay: Day | null): string | null;
  // components
  export function CookDoubleRow(props: { state: CookState; disabled: boolean; offline: boolean; onOpen: () => void }): JSX.Element;   // data-testid="cook-double"
  export function NightPicker(props: { mode: 'cook' | 'move'; mealName: string; cookDay: Day; choices: NightChoice[]; takenNames: Record<string, string>;
    swapLine: string | null; initial: Day | null; busy: boolean; error: string | null; showUsual: boolean;
    onConfirm: (day: Day | null) => void; onUsual: () => void; onBack: () => void }): JSX.Element;                                  // data-testid="night-picker"
  export function LeftoverSheet(props: { sb: Sb; leftover: WeekMeal; cook: WeekMeal | null; meal: MealRow; photo: string | null; people: Person[];
    nights: WeekMeal[]; mealNames: Record<string, string>; weekDays: Day[]; busyDays: Day[]; onClose: () => void; onChanged: () => Promise<void> }): JSX.Element;
  ```
- Fixed copy (artboards 01–06):
  - Ask row: "Leftovers night" / "Cook once, eat it twice." / button "Cook double".
  - `pickerIntro('cook', …)` → title "Cook double", sub "{Meal} on {Wednesday}. Buy and cook twice as much, then eat it again.", action "Cook double". `pickerIntro('move', …)` → "Move the leftovers", "{Meal}, cooked {Wednesday}.", "Move".
  - Group label "Eat the leftovers on". Rows: `dayName(day)` with `choiceSub`: `laterWords(daysLater)`, then " · busy night" when busy, then " · where they are now" when current; a taken night instead reads "{Meal name} is planned" (`taken: 'dinner'`) or "Leftovers are planned" (`'leftovers'`) and is not a radio (it is a plain row with `aria-disabled="true"`). Last row "No set night" / "For lunches, or whenever".
  - `tintLines('fri', swap)` → ["Friday adds nothing to the list and nothing to the budget.", swap]; `tintLines(null, swap)` → ["The list gets twice the ingredients.", swap]; a null swap line is left out.
  - `swapDoubleLine`: with `swapPeople(meal, people)` not empty and a `vegSwap` → "{joinNames}’s {swap.canonical} double too." ("Mom’s black beans double too."); otherwise null.
  - Under the rows: "Leftovers are best within 3 to 4 days." With no rows at all (`choices` empty), in place of the radio rows above "No set night": `lastNightLine('sat')` → "Saturday is the last night of this week, so there’s no later night for leftovers. You can still cook double for lunches."
  - `doneBox`: double with a night → { "Cooking double", "Leftovers on Friday" }; double, no night → { "Cooking double", "No leftovers night. Extra for lunches." }; extra → { "Cooking 2 extra servings", "For leftovers, no set night" } ("1 extra serving" for one). Button "Change". In the picker opened by Change, `showUsual` adds a `pillButton` "Back to the usual amount" under the main button.
  - `leftoverRowNote` → "{Meal}, from {Wednesday}". The row's name is "Leftovers".
  - Leftovers sheet: title "Leftovers", sub "{Friday} dinner"; card with the photo, the meal name and `when` = "Cooked {Wednesday}, {2 days} before" ("the day before" for one); `nothing` = "Nothing to buy for {Friday}. It’s all on {Wednesday}’s list." with ", {Mom}’s {kidney beans} too." in place of the final full stop when there is a swap line's worth to say; `pillButton` "Move to another night"; `undo` = "Taking it off puts {Wednesday} back to the usual amount."; red `pillButton` "Take off {Friday}".
  - `takeOffNote('fri')` → "Friday’s leftovers come off too."; `takeOffNote(null)` → null. It sits directly above the meal sheet's existing "Take off {Day}" button.
  - Errors: `NightTakenError` → "{Saturday} was just taken. Pick another night." (the picker stays open and the choices are rebuilt from fresh rows after `onChanged()`); any other failure → the sheet's existing "We couldn’t change that. Try again."
  - Offline (`navigator.onLine === false`, kept current with the `online`/`offline` events): `CookDoubleRow`'s button, Change, "Move to another night" and both "Take off" buttons are disabled, with "You’re offline. Connect to change this week." under the row.
- **One dialog at a time.** `NightPicker` is content, not a `Sheet`. `MealSheet` and `LeftoverSheet` each hold `view: 'main' | 'pick'` and render the picker inside their own `<Sheet>` in place of their main content (the `Sheet` is a native `<dialog>`; nesting two would stack two modals). The picker's close button and "Back" return to `'main'`.
- `MealSheet` new props, added after `people`: `nights: WeekMeal[]`, `mealNames: Record<string, string>`, `weekDays: Day[]`, `busyDays: Day[]`. `setLeftovers`, `extra` and the − / + block are removed. `dayNote` is called with `double = cookState(...).kind === 'double'`.
- `WeekScreen`: for a row with `isLeftover(wm)`, `filled` is `{ name: 'Leftovers', note: leftoverRowNote(meal.name, cook.day), photo, favorite: false }` (when its cooking row is missing from the week, the note is the meal's name alone); tapping it opens `LeftoverSheet`. For a cooked row the note passes `double`. `busyDays` is `[]` until Task 7 supplies it. `mealNames` comes from `data.meals`.
- After `cookDouble` succeeds from the picker, the sheet returns to `'main'` (it does not close), so the green box is the confirmation.

- [ ] **Step 1: Write the failing unit tests** (`leftover-copy.test.ts`): every string above, exactly, including: `choiceSub` for the four kinds of row; `tintLines` with and without a swap and with `null` day; `swapDoubleLine(tacos, familyOfFive)` → "Mom’s black beans double too." and null for an everyone-vegetarian meal and for a household with no vegetarian; `doneBox` for the four states (`usual` → null; "1 extra serving"); `leftoverSheetCopy('Chicken tacos', 'fri', 'wed', 2, 'Mom’s black beans double too.').nothing` → "Nothing to buy for Friday. It’s all on Wednesday’s list, Mom’s black beans too." and without a swap → "…on Wednesday’s list."; `when` for 1 and 2 days; `lastNightLine`; `takeOffNote`.
- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/leftover-copy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the copy module, the three components and the wiring. Layout from artboards 01–06: the ask row is the old stepper's bordered box; the done box is phase (a)'s green "done" box shape (`bg-[#E6F2EB]`, head `#134D31`, sub `#2C5A42`) with the repeat icon already used on the week's Repeat button; radio rows are 52 px with a 22 px ring.
- [ ] **Step 4: Write `e2e/leftovers.spec.ts`** (same header as `e2e/fits-this-week.spec.ts`: `serviceWorkers: "block"`, `routeFoodImages`; meals are planned through the Add screen with the "tacos" search and the "Chicken tacos" card, as that spec's `plan` helper does). One test per bullet:
  - Plan Chicken tacos on Wednesday. On `/list`, read the amounts of the chicken row and the black beans row and the number of rows. Open Wednesday: there is no "Fewer leftovers" or "More leftovers" button. "Cook double" → the picker lists Thursday, Friday, Saturday and "No set night", with Thursday chosen, "Mom’s black beans double too." and "Leftovers are best within 3 to 4 days." → choose Friday → "Cook double". The sheet now shows "Cooking double" and "Leftovers on Friday". Close: Wednesday's row ends "cooking double"; Friday's row reads "Leftovers" and "Chicken tacos, from Wednesday". `/list`: the chicken and black beans amounts are twice what they were (within 2%), and the row count is the same.
  - Continue: open Friday → "Move to another night" → Saturday → "Move": Saturday reads "Leftovers", Friday reads "Add dinner". Open Saturday → the line "Taking it off puts Wednesday back to the usual amount." → "Take off Saturday": Saturday is empty, Wednesday's note no longer says "cooking double", and `/list` amounts are back to the first reading.
  - Cook double with "No set night": the box reads "No leftovers night. Extra for lunches."; no row says "Leftovers"; the list is doubled. Change → "Back to the usual amount" → the ask row is back.
  - Cook double to Friday, then open Wednesday: "Friday’s leftovers come off too." is above "Take off Wednesday" → tap it: both rows read "Add dinner".
  - Plan tacos on Saturday (the week starts Sunday in the test household): "Cook double" shows only "No set night" and the last-night line.
  - A taken night: plan a second dinner on Thursday; Wednesday's picker shows Thursday as "… is planned" and it cannot be chosen (`aria-disabled`).
  - Two phones (`joinAsPartner`): phone 1 cooks double to Friday; phone 2 shows the Leftovers row within 5 s without a reload. Phone 1 opens the picker to move it; phone 2 puts a dinner on Saturday (through the database with `clientFor` and `setWeekMeal`, so phone 1's sheet is still open); phone 1 chooses Saturday → "Saturday was just taken. Pick another night."; the leftovers are still on Friday.
  - Repeat: seed last week through the database (`setWeekMeal` Monday, then `cookDouble` to Wednesday); Repeat → "Copy dinners": Monday ends "cooking double" and Wednesday reads "Leftovers".
  - Favorites: with Sunday empty and a leftovers night on Monday, "+" on a favorite says "Added … to Sunday."; with every night filled (one of them leftovers) it says "This week's dinners are all planned."
  - Every new button and radio row is ≥ 44 px both ways; no sideways scroll at 360 px with the picker open.
- [ ] **Step 5: Run** the four checks, then `scripts/e2e-local.sh e2e/leftovers.spec.ts`, then `scripts/e2e-local.sh e2e/week.spec.ts` (its Repeat test exercises the new `copyWeek`). Expected: green.
- [ ] **Step 6: Commit**

```bash
git add lib/week/leftover-copy.ts components/leftovers components/MealSheet.tsx components/WeekScreen.tsx components/useWeekData.ts tests/unit/leftover-copy.test.ts e2e/leftovers.spec.ts
git commit -m "feat: cook double and a linked leftovers night" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

- [ ] **Step 7 (controller): b1.** Tag `b1-ready`. Release b1 only after `fm-cart` has shipped to `main` and 0010 is applied in production; merge `main` first (the procedure under "Branch, base and release"). After the release, tell the owner what to tap: open a planned dinner → Cook double → pick a night; look at the list.

---

### Task 7: Marking busy nights

**Review tier: batched** (with Task 2).

**Files:**
- Create: `lib/db/queries/busy.ts`, `components/busy/BusyLine.tsx`, `components/busy/BusyNightsSheet.tsx`, `tests/unit/busy-queries.test.ts`
- Modify: `components/useWeekData.ts` (`WeekData.busy`; subscription tables), `components/WeekScreen.tsx` (the line, the sheet, `busy` on each row, `busyDays` to both sheets), `components/DayRow.tsx` (prop `busy`)

**Interfaces:**
- Consumes: Task 2; `Household.busy_days`, `Week.busy_days` (Task 3).
- Produces:
  ```ts
  // busy.ts (queries)
  export async function readBusy(sb: Sb, householdId: string, weekId: string): Promise<{ every: Day[]; thisWeek: Day[] }>;
  /** Reads both lists fresh, applies withChoice, writes only the list that changed, and returns the result. */
  export async function setBusyChoice(sb: Sb, householdId: string, weekId: string, day: Day, choice: BusyChoice): Promise<{ every: Day[]; thisWeek: Day[] }>;
  // useWeekData.ts
  export interface WeekData { /* existing */ busy: { every: Day[]; thisWeek: Day[] } }
  // components
  export function BusyLine(props: { days: Day[]; weekDays: Day[]; onOpen: () => void }): JSX.Element;        // data-testid="busy-line"
  export function BusyNightsSheet(props: { sb: Sb; householdId: string; weekId: string; weekDays: Day[]; busy: { every: Day[]; thisWeek: Day[] };
    onClose: () => void; onChanged: () => Promise<void> }): JSX.Element;
  // DayRow.tsx
  export function DayRow(props: { day: Day; slot: string; filled: FilledDay | null; onOpen: () => void; busy?: boolean }): JSX.Element;
  ```
- `useWeekData`: `week.busy_days` comes with the week row it already reads; the household's list is read fresh in the same `Promise.all` (`select('busy_days')` on `households` by id) because the `household` prop is as old as the page. `busy` is built with `cleanDays` on each. The subscription list becomes `["week_meals", "meals", "people", "weeks", "households"]`. Nothing else about the hook changes (cart W1's single-flight stays as it is).
- `setBusyChoice` reads before it writes so that two phones tapping different nights a moment apart both land (each write starts from what is in the database, not from what the screen last drew). It writes `households.busy_days` when `every` changed and `weeks.busy_days` when `thisWeek` changed; when both changed (a move between "This week" and "Every week") it writes the list that **gains** the day first, so a failure between the two leaves the night busy, not silently cleared.
- Layout and copy (artboards 07, 08, 10):
  - `BusyLine` sits under the last day row, inside the Dinners section: a clock icon, `busyLine(days, weekDays)`, and a 44 px text button: "Change" when there are busy nights, "Mark busy nights" when there are none. It is not rendered until the week has loaded.
  - `DayRow` with `busy`: the word "Busy" (11 px, semibold, `#4A544F`) under the day's short name, on filled and empty rows; an empty busy row reads "+ Add a quick dinner". The row's accessible name gains ", busy night".
  - Sheet: title "Busy nights", sub "Busy nights get quick dinners: 30 minutes or less, slow cooker, or make-ahead."; one row per day in `weekDays` order: the short day name and a radio group (`aria-label` "{Tuesday}") of "Not busy", "This week", "Every week", styled as the search tab's segmented control, arrow keys moving within a row; then `busySummary` (`aria-live="polite"`); then `primaryButton` "Done".
  - A tap marks the choice at once, calls `setBusyChoice`, then `onChanged()`. While a write is in flight that row's radios are disabled. On failure the row goes back and "That didn’t save. Try again." shows (`role="alert"`) in place of the summary. Offline: all radios disabled and "You’re offline. Connect to change this week." in place of the summary.

- [ ] **Step 1: Write the failing tests** (`busy-queries.test.ts`, client stubbed as in Task 4)

```ts
//  - readBusy cleans both lists: households {busy_days: ['tue','junk']}, weeks {busy_days: null} → { every: ['tue'], thisWeek: [] }.
//  - setBusyChoice(…, 'thu', 'week') from every ['tue'], thisWeek [] → one update, on weeks, { busy_days: ['thu'] }; households not written; returns { every: ['tue'], thisWeek: ['thu'] }.
//  - 'tue' → 'no' from every ['tue'] → one update, on households, { busy_days: [] }.
//  - 'thu' from 'week' to 'every' → two updates, households ({ busy_days: ['tue','thu'] }) FIRST, then weeks ({ busy_days: [] }).
//  - 'tue' from 'every' to 'week' → weeks first, then households.
//  - a choice that changes nothing ('sat' → 'no') → no update.
//  - it starts from the database, not from the caller: the stub's read returns every ['mon'] although the screen had ['tue'];
//    setting 'thu' to 'every' writes ['mon','thu'].
//  - the first update fails → rejects, and the second is not made.
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/busy-queries.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the queries, the two components and the wiring. Pass `busyDays(data.busy.every, data.busy.thisWeek)` to `MealSheet` and `LeftoverSheet` (Task 6 passed `[]`).
- [ ] **Step 4: Run** the four checks. Expected: green. The e2e for this task is in Task 8's spec (`e2e/busy-nights.spec.ts`), so that the spec is written once.
- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/busy.ts components/busy/BusyLine.tsx components/busy/BusyNightsSheet.tsx components/useWeekData.ts components/WeekScreen.tsx components/DayRow.tsx tests/unit/busy-queries.test.ts
git commit -m "feat: mark a night busy for this week or every week" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 8: Quick dinners first when adding on a busy night, and the b2 end-to-end

**Review tier: batched** (with Task 7).

**Wait for:** `a3-ready` merged into `family-b` by the controller (`ls lib/domain/method.ts components/flags/FlagLines.tsx lib/domain/verdicts.ts` finds all three, and `grep -n "steps" lib/recipes/search/provider.ts` finds `RecipeOption.steps`). If not, this task waits. It is written on top of phase (a)'s versions of the add-meal files, not beside them.

**Files:**
- Create: `lib/recipes/search/quick.ts`, `components/busy/BusyBanner.tsx`, `tests/unit/quick.test.ts`, `e2e/busy-nights.spec.ts`
- Modify: `components/add-meal/AddMealScreen.tsx` (reads whether the night is busy; holds `quickOnly`; renders the banner above the tabs), `components/add-meal/SearchTab.tsx` (props `quickOnly`, `onShowAll`), `components/FavoritesBrowser.tsx` (optional props `quickOnly`, `onShowAll`), `components/WeekScreen.tsx` (the time on a slow dinner's note), `lib/recipes/search/fake.ts` (fixtures)

**Interfaces:**
- Consumes: `quickReason`, `titleSaysMakeAhead`, `QUICK_LABEL`, `busyDays` (Task 2); `readBusy` (Task 7); phase (a): `cookMethod` (`lib/domain/method.ts`), `toFacts` (`lib/db/queries/meals.ts`), `RecipeOption.steps`, `cardLines`/`CardLine` (`components/flags/FlagLines.tsx`).
- Produces:
  ```ts
  // quick.ts
  export function optionQuick(o: Pick<RecipeOption, 'title' | 'totalMinutes' | 'steps'>): QuickReason | null;
  export function mealQuick(row: MealRow): QuickReason | null;
  export function quickSplit<T>(items: T[], reason: (t: T) => QuickReason | null, on: boolean): { shown: T[]; hidden: number };
  export function hiddenLine(kind: 'results' | 'favorites', shown: number, hidden: number): { text: string; action: string } | null;
  export function slowNote(row: MealRow, busy: boolean): string | null;      // "1 hr 10 min" for a planned dinner that is not quick, on a busy night, with a saved time
  // BusyBanner.tsx
  export function BusyBanner(props: { day: Day; on: boolean; onChange: (on: boolean) => void }): JSX.Element;   // data-testid="busy-banner"; the switch is role="switch"
  ```
- Rules:
  - `optionQuick`: `quickReason({ totalMinutes: o.totalMinutes, method: cookMethod(o.title, o.steps.length ? o.steps : null), makeAhead: titleSaysMakeAhead(o.title) })`.
  - `mealQuick`: `quickReason` over `toFacts(row)` with `makeAhead: facts.makeAhead || titleSaysMakeAhead(row.name)`.
  - `quickSplit`: with `on` false → everything shown, `hidden: 0`; with `on` true → only items with a reason, in their given order.
  - `hiddenLine('results', s, h)`: `h === 0` → null; `s === 0` → { "None of these {h} are quick, or they don’t say how long they take.", "Show all {h}" }; else { "{h} more take longer, or don’t say how long.", "Show all {s + h}" } ("1 more takes longer, or doesn’t say how long."). `hiddenLine('favorites', s, h)`: `h === 0` → null; `s === 0` → { "None of your favorites are marked quick yet.", "Show all {h}" }; else { "{s} of your {s + h} favorites are quick.", "Show all {s + h}" }.
- **Spoonacular.** Minutes and steps from a search result are used here only in the browser, for the life of the results on screen, to decide what to show. Nothing from Spoonacular is stored by this task. (Under the owner's Spoonacular ruling, phase (a) may hand `steps: []` for Spoonacular options; then a Spoonacular slow-cooker recipe is recognised by its title or not at all. That is accepted.)
- `AddMealScreen`: `busyNight` starts as `cleanDays(household.busy_days).includes(day)` (the page's own household row) and is refined once by `readBusy` after the week row is found (`findWeek`; no week row → the household's list alone). A failed read changes nothing. `quickOnly` state starts `true` and is only applied when `busyNight`. The banner renders above the tabs only when `busyNight`; its switch sets `quickOnly`. "Show all" on either tab calls the same setter with `false`. Nothing is stored: the next visit starts on. The Paste tab and "Type it myself" ignore it.
- `SearchTab`: `shown` (after sorting) goes through `quickSplit(shown, (x) => optionQuick(x.option), quickOnly)`. A card whose reason has a `QUICK_LABEL` shows it as a green line (`data-testid="result-quick"`, 13 px semibold `#1F7A4D`) directly under the rating-and-time line, and its `aria-label` gains ", Slow cooker". **It is a fifth kind of extra line**: extend phase (a)'s `CardLine` with `'quick'` and `cardLines` so the order is quick, shares, made, allergy, dislike; the cap of three extra lines stays; the allergy line is still never dropped; when four or more are present the first ones dropped are shares, then made, then quick. Under the list, `hiddenLine('results', …)` with a 44 px text button; when nothing is shown the same words sit in the empty-results box. The "Most loved" badge stays with `found[0]` only if that card is shown. No new request is made when the switch flips.
- `FavoritesBrowser`: when `quickOnly`, rows pass through `quickSplit(rows, mealQuick, true)` after its own search-and-chip filtering, with `hiddenLine('favorites', …)` above the list. The Favorites screen itself never passes the prop.
- `WeekScreen`: a cooked row on a busy night whose `slowNote` is not null gets it appended to its note with " · ". Leftovers rows never get it.
- `BusyBanner` (artboards 09, 10): box `bg-[#EEF0ED]`, clock icon, "{Thursday} is a busy night" (14 px semibold), under it "Showing quick dinners only." or "Showing every dinner.", and the same control `StaplesSection` uses for a staple: a native checkbox with `role="switch"` and `accent-green`, `size-5` inside a `size-12` label, `aria-label` "Quick dinners only".
- Fixtures (fake search, query "chili"), all under `SPOON` with `structured` lines so drafts need no AI fake: "Weeknight bean chili" (`totalMinutes: 25`), "Slow-cooker three-bean chili" (`totalMinutes: 360`), "Sunday chili" (`totalMinutes: 90`), "Chili with no clock" (`totalMinutes: null`), "Make-ahead chili bake" (`totalMinutes: 70`). Keep every existing fixture and its order for existing queries.

- [ ] **Step 1: Write the failing unit tests** (`quick.test.ts`): `optionQuick` for the five fixtures → `['minutes', 'slow_cooker', null, null, 'make_ahead']`; an option with steps `['Cook on low in the slow cooker for 8 hours.']` and a plain title → `'slow_cooker'`; `mealQuick` for a row with `total_minutes: 30`, with `make_ahead: true` and 70 minutes, with `method: 'slow_cooker'`, with all null → `['minutes', 'make_ahead', 'slow_cooker', null]`; `quickSplit` on and off (order kept; `hidden` counts); every `hiddenLine` string above including the singular; `slowNote` (not busy → null; busy and quick → null; busy, 70 minutes, oven → "1 hr 10 min"; busy, no time → null); and `cardLines({ quick: true, shares: true, made: true, allergy: true, dislike: true })` → `['quick', 'allergy', 'dislike']`, `cardLines({ quick: true, shares: true, made: false, allergy: false, dislike: false })` → `['quick', 'shares']`. Phase (a)'s existing `cardLines` cases gain `quick: false` and keep their expected values; name them in the commit body.
- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/quick.test.ts tests/unit/flag-lines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Write `e2e/busy-nights.spec.ts`** (same header as `e2e/leftovers.spec.ts`). One test per bullet:
  - `/week`: the line reads "No busy nights this week" → "Mark busy nights" → in the sheet set Tuesday to "Every week" and Thursday to "This week" → the summary reads "Every Tuesday, and this Thursday." → Done → the line reads "Busy nights: Tue and Thu"; `day-row-tue` and `day-row-thu` contain "Busy" and "+ Add a quick dinner"; `day-row-wed` contains neither. Reload: unchanged. Through the database (`clientFor`): `households.busy_days` is `['tue']` and this week's `weeks.busy_days` is `['thu']`.
  - Add on Thursday: `busy-banner` reads "Thursday is a busy night" and "Showing quick dinners only."; search "chili": exactly three cards (Weeknight, Slow-cooker, Make-ahead); the slow-cooker card has `result-quick` "Slow cooker" and the make-ahead card "Make ahead"; the line reads "2 more take longer, or don’t say how long." → "Show all 5" → five cards, the switch is off, the banner reads "Showing every dinner."; exactly one request to `/api/recipes/search` was made (`page.on('request')`). Switch back on → three cards.
  - Search "lasagna" on Thursday (no times in that fixture): "None of these … are quick, or they don’t say how long they take." and a "Show all" button; tapping it shows the cards.
  - Favorites tab on Thursday with two favorites saved through the UI earlier in the test ("Weeknight bean chili" and "Sunday chili"): one row, and "1 of your 2 favorites are quick." → "Show all 2" → two rows. `/favorites` (the main screen) always shows both and has no such line.
  - Add on Wednesday: no `busy-banner`; "chili" shows five cards.
  - Add "Sunday chili" to Thursday with the switch off: it is added without any message; `day-row-thu` contains "Busy" and "1 hr 30 min".
  - Leftovers meet busy: plan "Weeknight bean chili" on Monday; its Cook double picker marks Tuesday "The next night · busy night" and has it chosen.
  - Two phones (`joinAsPartner`): phone 1 sets Friday to "This week"; phone 2's line reads "Busy nights: Tue, Thu and Fri" within 5 s without a reload.
  - The switch, every radio in the sheet, "Change" and "Show all" are ≥ 44 px both ways; no sideways scroll at 360 px on `/week` with the sheet open or on the add screen.
- [ ] **Step 5: Run** the four checks, then `scripts/e2e-local.sh e2e/busy-nights.spec.ts e2e/fits-this-week.spec.ts e2e/family-flags.spec.ts` (the last two share the cards this task changed). Expected: green.
- [ ] **Step 6: Commit**

```bash
git add lib/recipes/search/quick.ts lib/recipes/search/fake.ts components/busy/BusyBanner.tsx components/add-meal/AddMealScreen.tsx components/add-meal/SearchTab.tsx components/FavoritesBrowser.tsx components/flags/FlagLines.tsx components/WeekScreen.tsx tests/unit/quick.test.ts tests/unit/flag-lines.test.ts e2e/busy-nights.spec.ts
git commit -m "feat: quick dinners first when adding on a busy night" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

---

### Task 9: Leftovers meet phase (a), docs, redesign plan, release

**Review tier: full** (allergy warnings).

**Wait for:** the same merge as Task 8.

**Files:**
- Modify: `lib/db/queries/verdicts.ts` (`listDinnerDates` leaves out leftovers rows), `components/DayRow.tsx` (`FilledDay.keepNote`), `components/WeekScreen.tsx`, `components/leftovers/LeftoverSheet.tsx` (the allergy box), `tests/unit/verdict-queries.test.ts` (or whichever file phase (a) Task 12 put `listDinnerDates`' tests in), `e2e/leftovers.spec.ts`, `docs/superpowers/plans/2026-11-26-premium-pass.md`, `docs/superpowers/specs/2026-11-26-post-launch-backlog.md`, `docs/superpowers/specs/2026-11-26-basket-design.md`, `package.json`

**Interfaces:**
- Consumes: phase (a): `listDinnerDates`, `findFlags`, `ingredientNames`, `allergyCopy`, `AllergyBox`, `FilledDay.allergy`.
- Rules:
  - **Verdicts.** `listDinnerDates` adds `.is('leftover_of', null)` to its `week_meals` read. So "How was dinner?" is never asked about a leftovers night, and "last had" and "Made N times" count the night it was cooked. Nothing else in the verdict code changes.
  - **Allergy on a leftovers night.** It is the same food for the same people, so it carries the same warning. `WeekScreen` sets `allergy` on a leftovers row exactly as phase (a) does for a cooked row (same `findFlags` call on the same meal), plus `keepNote: true`. `DayRow`: when `allergy` is set and `keepNote` is true it shows the note line **and** the allergy line under it (phase (a) replaces the note; a row named only "Leftovers" must still say of what). `LeftoverSheet` renders `<AllergyBox>` under the meal card whenever the meal matches an allergy; it has no dismiss, and no leave-out or swap is offered there. Dislike boxes are not repeated on the leftovers sheet (the choice was made on the cooking night and already shaped what was bought).
  - The allergy wording rule from phase (a)'s Global Constraints applies unchanged; `tests/unit/allergy-wording.test.ts` gains `components/leftovers` and `lib/week/leftover-copy.ts` in its list of files that may contain neither `\bsafe\b` nor "free of".

- [ ] **Step 1: Write the failing tests.** Unit: `listDinnerDates` with a week holding a cooked row and its leftovers row → the query carries `.is('leftover_of', null)` and one dinner comes back. `allergy-wording.test.ts` lists the two new paths. e2e, added to `e2e/leftovers.spec.ts`: a household where "Daughter (4)" has a tree nut allergy (`allergies` on the helper's `PersonInput`, from phase (a) Task 7); plan the pilaf fixture on Wednesday with "Add to Wednesday anyway"; cook double to Friday; Friday's row shows "Leftovers", "Broccolini quinoa pilaf with toasted almonds, from Wednesday" and "Tree nut allergy: Daughter (4)"; its sheet shows `allergy-box` with "check every label" and no "Leave" or "Swap" button. And: with a doubled dinner eaten yesterday and its leftovers "eaten" today (`seedPastDinner` for the cooked night, then `cookDouble` through the database onto the next day), move the clock forward a day (`page.clock`) → the verdict card asks about the cooked night's day name and is not shown a second time for the leftovers night after answering.
- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/unit/allergy-wording.test.ts` and the verdict query test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Docs, no code.** `premium-pass.md`: add to the rollout list, each in Butter and Cast Iron: the Cook double row and its "Cooking double" box, the night picker (cook and move), the Leftovers row on the week, the leftovers sheet, the "Busy" word on day rows and "+ Add a quick dinner", the busy line under the week, the busy nights sheet (seven segmented rows), the busy banner with its on/off control, the green "Slow cooker" / "Make ahead" card line, and the "more take longer" line. `post-launch-backlog.md`: add "Ask Spoonacular for a maximum time on a busy night", "A general Move for any dinner", "Leftovers into next week (owner's Q8 B)". `basket-design.md`: one dated line pointing to the phase (b) spec where it describes "+N leftovers". `package.json`: the next minor.
- [ ] **Step 5: Run** the four checks, then `scripts/e2e-local.sh e2e/leftovers.spec.ts e2e/verdicts.spec.ts e2e/family-flags.spec.ts`. Expected: green.
- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/verdicts.ts components/DayRow.tsx components/WeekScreen.tsx components/leftovers/LeftoverSheet.tsx tests/unit e2e/leftovers.spec.ts docs/superpowers package.json
git commit -m "feat: leftovers keep allergy warnings and are never asked about; phase (b) docs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ"
```

- [ ] **Step 7 (controller):** whole-branch review by the advisor model against the Review Focus list. Run the whole e2e suite once with `scripts/e2e-local.sh` (no arguments). Tag `b2-ready`.
- [ ] **Step 8 (controller): release b2**, only after a3 is live; merge `main` first. Tell the owner in plain words what is new and what to tap: This week → "Mark busy nights" → pick Tuesday, Every week; tap Tuesday's "+ Add a quick dinner" and search.
- [ ] **Step 9 (owner, on both real phones):** cook one real dinner double and check the list; mark one busy night on one phone and watch it appear on the other.

---

## Deferred minors

Found while writing or scanning this plan and not folded into a task, with the reason. None blocks a release.

- **Between b1 and Task 9, a leftovers night can be asked "How was dinner?" and shows no allergy line** if phase (a) ships in that window. Both are closed by Task 9. If a3 and b1 are both live for more than a day or two before b2, the controller pulls Task 9's first two rules forward as a hotfix on `main`.
- **A doubled dinner after a cart send** shows on the cart's review screen as "New since then". Correct behaviour; the new specs never send a cart.
- **A doubled amount is absolute.** Adding a person later does not re-double (design, "Judgment calls"). Same as today's extra servings.
- **`times_planned` does not count a leftovers night.** Intended.
- **The picker only offers free nights.** Replacing a planned dinner with leftovers takes two steps.
- **`weeks` joins the realtime publication**, so every `weeks` insert (one per household per week) now sends an event. Negligible.
- **An old copy of the app pressing Repeat** on a week that has a leftovers night copies it as a dinner with zero servings and no link: it shows as that dinner and buys nothing. It lasts only until that phone loads the new version.
- **No "busy, but not this week" exception** (design, "Judgment calls").

---

## Pre-flight conflict scan (2026-11-26, by the plan's author)

Scanned against `family-a` at `a1f4fb5` (with uncommitted phase (a) Task 11 work in `lib/domain/weeks.ts` and `lib/domain/verdicts.ts`), `fm-cart`'s plan, and the revised phase (a) plan. Findings are ruled on here and the rulings are already folded into the tasks above.

### Task pairs that share a file or an interface

| Pair | Produces → consumes | Checked | Finding and ruling |
|---|---|---|---|
| T1 → T4 | `cookedNights`, `leftoverFor`, `isLeftover` → `copyWeek`, `cookDouble` | `Night` is structural; `WeekMeal` has `id, day, slot, meal_id, servings_override, leftover_of` after T3 | **F1.** `servings_override` is `numeric`; the generated type is `number \| null` (callers wrap it in `Number()` defensively). `Night.servings_override: number \| null` fits. No change. |
| T1 → T5 | `cookedNights` → `weekEntries` | T5 is the only place rows become entries; `useWeekList.ts:233-238` and `AddMealScreen.tsx:96-99` hold the same inline code today | Clean. Ruling: both callers must use `weekEntries`; the reviewer rejects a second copy (the rubric treats duplicated logic as a defect). |
| T1 → T6 | `cookState`, `nightChoices`, `defaultChoice`, `laterWords`, `dayNote(…, double)` → components and copy | Signatures match what T6 calls | **F2.** `nightChoices` needs `takenMealId` for "{Meal} is planned"; added to `NightChoice` in T1 and `mealNames`/`takenNames` to T6's props. Folded. |
| T1 ↔ a Task 4 | both edit `dayNote` in `lib/week/note.ts` | a appends `changeNotes` after the existing text; b changes the leftovers phrase and adds a 4th optional parameter | **F3 (cross-stream).** Same function, adjacent lines. Ruling: hand-merge at `a2-ready`; final order "main · cooking double · person changes"; a's tests call `dayNote` with three arguments and stay valid. Listed under Shared files. |
| T3 → T4 | triggers ↔ client writes | Walked every write in T4 against both triggers | **F4.** `copyWeek` could trip the one-leftovers-per-cooking-night index mid-copy when the target week already has a doubled dinner. Ruling: step 2 deletes the target's leftovers rows first (T4). **F5.** A leftovers row being re-pointed while it has a child of its own could chain. Ruling: the tidy trigger deletes children of any row that becomes leftovers; the check trigger refuses a parent that is itself leftovers (T3). |
| T3 → T4 | `setWeekMeal` upsert onto a leftovers night | New client sends `leftover_of: null`; an old client omits it | **F6.** Without help an old client's upsert would keep `leftover_of` with a different meal and be refused. Ruling: check-trigger rule 1 clears the link when the meal changes and the link was not touched (T3), tested in pgTAP. |
| T3 → T7 | `households.busy_days` column grant → `setBusyChoice` | `households` uses column-level update grants (`0001:157`, `0004:8`, `0006:168`) | **F7.** A new column is not writable without its own grant. Ruling: `grant update (busy_days)` is in T3 and tested as A on HA. |
| T3 → T7 | `weeks` realtime → `useWeekData` subscription | `0001:410-411` publishes `week_meals, week_item_state, meals, people, staples`; `0004` adds `households`; `weeks` is in neither | **F8.** The other phone would not see a this-week busy change. Ruling: 0010 adds `weeks` to the publication (T3); T8's two-phone test covers it. |
| T4 → T6 | `cookDouble`, `moveLeftover`, `removeLeftover`, `usualAmount`, `NightTakenError` → sheets | Names and arguments match | Clean. |
| T5 ↔ cart W1 / cart Task 9 | both edit `lib/useWeekList.ts` | b changes the `entries` block only | **F9 (cross-stream).** Ruling: T5 runs after W1 is merged into `family-b` if W1 has landed on `fm-cart` by then; otherwise the controller hand-merges one block. Listed under Shared files. |
| T6 ↔ a Tasks 7, 9, 12 | `MealSheet.tsx`, `WeekScreen.tsx`, `DayRow.tsx` | a adds blocks after the note and sets `FilledDay.allergy`; b replaces the stepper block and adds props | **F10 (cross-stream).** Different hunks, same files. Ruling: b keeps its edits to the stepper block, one line above "Take off" and trailing props; a's "One order for the meal sheet" is extended with "…then `CookDoubleRow`, then the existing controls". The controller tells stream 1. |
| T6 → T7 | `busyDays` prop on `MealSheet`/`LeftoverSheet` | T6 passes `[]`; T7 passes the real list | Clean; T6's e2e does not assert busy words. The "busy night" picker case is asserted in T8. |
| T7 ↔ a Tasks 10, 12 | `useWeekData.ts` | a adds a call after `setData` and `meal_verdicts` to the subscription; b adds `busy` and two tables | **F11 (cross-stream).** One array literal both edit. Ruling: hand-merge; final list `["week_meals", "meals", "people", "weeks", "households", "meal_verdicts"]`. |
| T2 → T8 | `quickReason(method: string \| null)` ← `cookMethod(): CookMethod \| null` | `CookMethod` is a string union | Clean by design: T2 takes a plain string so it does not wait for a Task 8. |
| T8 ↔ a Tasks 6, 13 | `cardLines`/`CardLine` in `components/flags/FlagLines.tsx` | a caps a card at three extra lines: shares, made, allergy, dislike | **F12.** The quick line is a fifth kind and would break a's cap or a's tests. Ruling: T8 extends `CardLine` and `cardLines` explicitly, keeps the cap and "allergy never dropped", and names the changed test literals. T8 is therefore gated on `a3-ready`, not `a2-ready`. |
| T8 ↔ a Task 6 | `lib/recipes/search/fake.ts` | a adds "soup" fixtures under `SPOON`; b adds "chili" | Clean once built on top of a (T8 waits for the merge). |
| T8 ↔ Spoonacular ruling | minutes/steps of a Spoonacular option used to filter | Brief: store only id, title, image; everything else ≤ 1 hour | Clean: used in the browser only, never stored. Stated in T8. If a hands `steps: []` for Spoonacular, the slow-cooker test fixture still passes by title. |
| T9 ↔ a Task 12 | `listDinnerDates` in `lib/db/queries/verdicts.ts` | The file does not exist yet on `family-a` | **F13 (cross-stream).** Ruling: T9 waits for `a3-ready`; the one-line filter is b's, made after the merge, so stream 1 never needs to know about `leftover_of`. |
| T9 ↔ a Task 7 | `FilledDay.allergy` "replaces the note line" | A leftovers row needs both lines | **F14.** Ruling: `FilledDay.keepNote` (T9); a's behaviour is unchanged when it is absent. |
| T3 ↔ a Task 1 / S1 | `rls_test.sql` `plan(N)`, `lib/db/types.ts` | Each raises the same number | Ruling: read N from the file; the controller adds the counts at each merge. |
| T3 ↔ migration order | 0010 may reach production before 0008/0009 | 0010 references only 0001 objects | Ruling: allowed; T3 Step 5 records what is pending, as a Task 1 Step 5 does. |

### Each task against itself

| Task | Tests against code, files created against files touched | Finding |
|---|---|---|
| T1 | Every exported function has a case; `week-note` additions use fixtures that exist in that file (`veg`, `familyOfFive`); 2 × 3.8 = 7.6 does not collide with the existing 5.8 cases | **F15.** `cookState` with a leftovers row but a stale override (5.8) must still read double, or the box and the note disagree. Test row added; `dayNote` takes `double` for the same reason. |
| T2 | All strings in the tests match the rules text; `cleanDays` order is sun…sat while `busyLine` orders by `weekDays` (tested with a Wednesday week) | Clean. |
| T3 | Each rule in Interfaces has a pgTAP test; the seeded rows it relies on exist in `pg_temp.seed` (`mon`/`dinner`) | **F16.** "As the superuser with HB's week but HA's meal" can fail on either the trigger or the composite key depending on order. Ruling: assert that it throws, not which code. |
| T4 | Tests assert order of writes, which the Review Focus (3) depends on; file list matches the commit | Clean. |
| T5 | Creates `lib/list/entries.ts` and both callers are in Files and in the commit | **F17.** The old-client test depends on a zero-amount line adding no row or part (`list.ts:95` rounds counts up with `Math.ceil(0) = 0`; `addQuantities` adds 0). Believed true from reading; ruling: the test is the proof, and Step 3 says to stop, not patch `lib/domain`, if it fails. |
| T6 | Copy in Interfaces matches the artboards and `design.md`; the e2e's default-choice expectation (Thursday chosen when nothing is busy) matches `defaultChoice` | **F18.** The artboard 02 shows Friday chosen with Thursday free; that is the owner's sample tap, not the default. Noted here so a reviewer does not flag it. **F19.** `useWeekData.ts` is in Files but needs no edit for T6; kept in the list only because the hook's `weekMeals` is now read for leftovers; ruling: remove it from the `git add` if untouched. |
| T7 | Query tests cover both write orders; the components have no unit test | Ruling: accepted; they render pure functions tested in T2, and T8's e2e drives them. Not a test that asserts nothing: none is written. |
| T8 | Fixture count (5) matches the e2e's "three cards" and "2 more"; `hiddenLine` numbers in the e2e match the rule ("Show all 5") | **F20.** `e2e` step for Favorites expects "1 of your 2 favorites are quick." The grammar is off for one. Ruling: keep the string as designed (the design's example is plural); revisit with the owner's copy pass. |
| T9 | Depends on names from a (`seedPastDinner`, `AllergyBox`, `PersonInput.allergies`) that exist only after `a3-ready` | Gated by "Wait for". If a renames any of them, T9 follows a's names. |

**Global Constraints against the tasks.** "Migrations only add": T3 adds columns, an index, two functions, two triggers, a grant and a publication entry; nothing is dropped or tightened (the phase overview's "nullable `meal_id`" idea was dropped for this reason). "No paid call": no task adds a fetch to AI, Brave, Spoonacular or Kroger; T8 asserts one search request across a switch flip. "One rule for does this night buy food": only T1 defines it; T4, T5 and T6 consume it. "e2e only through `scripts/e2e-local.sh`": every e2e step says so.

**Not checkable from here.** Whether `Math.ceil(0 - 1e-9) + 0` yields `0` and not `-0` in a rendered row (F17's test compares `parts`, which would catch `-0` with `toEqual`); and how phase (a) finally names the verdict query test file (T9 says "whichever file").
