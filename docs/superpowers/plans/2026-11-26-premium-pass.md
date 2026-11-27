# Basket Premium Visual and Motion Pass Implementation Plan

## Changelog (revised 2026-11-26, after the pre-flight and the feature work that landed since)

The plan of 8cadb20 had 20 tasks in one line. This revision has **27 tasks in three streams** and starts only after all ten family features are on `main`.

- **Order and gate.** The redesign ships after family phases a–h (owner). Nothing from this branch reaches production before Task C2. The branch is re-cut from `main` at that point; Task S1 seeds its lists from the code as it then stands.
- **Three streams, no shared files.** Stream 1 (S1–S11): tokens, theme, motion, shared components, shell, proof, edges. Stream A (A1–A7): family pieces, This week, Add a meal, recipe page, Favorites. Stream B (B1–B7): shopping list, swap, cart review, Household, login, invite, onboarding. Close-out (C1–C2). The three things every screen task used to edit are gone: `LEGACY_FILES` is now one list file per stream, `HEADER_DONE` is replaced by one CSS `:has()` rule, `CONTRAST_PENDING` and `SCREENS` live in one registry file per stream. `e2e/motion.spec.ts` is split per stream; cross-screen e2e steps go through `e2e/helpers/flows-a.ts` and `flows-b.ts`. Ownership table and merge order are under "Streams".
- **Pre-flight adopted.** 41 findings: 37 adopted as written, 2 adopted in a changed form (F2, F8), 2 overtaken by events (F17 first half, F41). Section 5: three recommendations rejected with rulings. See "Pre-flight rulings".
- **New screens covered.** Ratings and "Most loved", "Check off all" with Undo, the "Fits this week" sort (A5, B1). Fred Meyer cart: product rows with photo, pack count and package price, the stale-prices banner, Swap sheet, Amazon and Costco search links (B1, B3), Kroger connect (B5), cart review (B4), and the four audit tasks S1/W1/E/W2 (their `loading.tsx`, single-flight hooks and spend-guard messages are kept, see S5, B1). Family phase (a): verdict card and sheet, flag lines, allergy and dislike boxes, ingredient swap sheet, facts line and sheet, "Type it myself" (A1, A5, A6), the per-person editor with won't-eat and allergy chips (B5). Phases b–h: restyled by kind inside the files each task owns, and their own new screens in **Task C1**, driven by each phase's `design.md`.
- **Audit triage folded in** (items routed REDESIGN): the copy pass C3–C8, tokens C9, control contrast C10, tab, radio and sheet semantics C11, page titles and announcements C12, one loading pattern and text-zoom C15. SEC-4 and SEC-5 (Join button, revoke and remove) are **not** here: they need database functions and are features; see "Needs the owner".
- **Review mode** on every task: `full` or `batched` (defined under Global Constraints).
- **e2e** runs only through `scripts/e2e-local.sh`, one run at a time across all streams. Commit trailers fixed. Helpers are Sonnet; Fable reviews.
- **Moved by the pre-flight:** the rolling total is built before the owner checkpoint (S9, used in A2); `e2e/photo.spec.ts` is written in A2, not with the component; the Lucide nav assertion lives in S5; old Task 18 is split into B6 (login, invite) and B7 (onboarding).
- **Dropped:** the "See what costs most" sort and every trace of it (ledger ruling, F11); `staggerDelay` (F26); the repo-wide rename of `lib/ui.ts` exports (old names stay as aliases until C2).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every Basket screen from one set of design values (Butter in light, Cast Iron in dark, or Match my phone), add the motion language and its three signature moments, and fix all ten audit items, with every feature, all data and every test still working. The result should feel premium, calm and fast, not decorated.

**Architecture:** Design values live as CSS variables in `app/globals.css` (`--bk-*`, exposed to Tailwind v4 through `@theme inline`); components use only the utilities. Motion is CSS (`linear()` springs, transitions, keyframes) plus small pure helpers in `lib/motion/` and the browser's View Transitions API with a plain fallback; no animation library. Shared primitives in `components/ui/` are built first (Stream 1), then two streams rebuild the screens on them in parallel, each inside its own files, and a guard test with a shrinking per-stream list of not-yet-restyled files keeps old styling from coming back.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase, Vitest (node; jsdom per file with `// @vitest-environment jsdom`), Playwright (projects `iphone-17`, `pixel-7`, `android-small`). New packages: `lucide-react` (dependency), `sharp` (dependency, pinned to the version Next already installed), `ffmpeg-static` (devDependency, proof recordings only).

**Spec:** `docs/superpowers/specs/2026-11-26-premium-pass-brief.md` (the brief), `docs/design/audit.md` (ten items, all must be fixed), `docs/design/design-values.md` and `docs/design/tokens.css` (the values), the approved week mockups `/home/claude/basket-redesign/root/project/Week-Light.dc.html`, `Week-Dark.dc.html` (picture: `/home/claude/basket-redesign/round2/before-after.png`), the phase (a) artboards `/home/claude/basket-redesign/family/canvas/project/01…13-*.dc.html` (structure and copy only; their colours are the old look), and for phases b–h each `/home/claude/basket-redesign/family/{b,c,d,e,f,g,h}/design.md`. Read the design-values section named in your task before you start it.

**Owner decisions (bind; do not reopen):** two looks, Butter = light and Cast Iron = dark, plus "Match my phone"; one merged system; the "Dipped" app icon (option 3); the redesign ships after all ten family features; helpers run on Sonnet and Fable reviews.

## Streams

**Start condition.** Family phases a–h and the cart are released on `main`. The controller cuts `premium-pass` from `main` (the old branch of that name is replaced) and one worktree per stream: `premium-pass` (Stream 1 and integration), `premium-a`, `premium-b`.

**Who owns which files.** A task edits only files its stream owns. A new file that phases b–h added belongs to the stream that owns its folder; anything that fits no row belongs to Task C1.

| Stream | Owns |
|---|---|
| **1 — values, theme, shared** | `app/globals.css`, `app/layout.tsx`, `app/(app)/layout.tsx`, `app/(app)/loading.tsx`, `app/manifest.ts`, `app/icon.svg`, `app/favicon.ico`, `public/**`, `lib/ui.ts`, `lib/look.ts`, `lib/design/**`, `lib/text/**`, `lib/motion/**`, `lib/photos/**`, `lib/domain/budget.ts`, `lib/domain/money-input.ts`, `components/ui/**`, `components/Sheet.tsx`, `components/BottomNav.tsx`, `components/ClientBoot.tsx`, `components/LookPicker.tsx`, `components/BudgetSentence.tsx`, `components/RollingNumber.tsx`, `tests/unit/design-guard.test.ts`, `tests/unit/design-legacy/shared.txt`, `e2e/helpers/**` except the two flow files, `e2e/screens/index.ts`, `e2e/screens/shared.ts`, `e2e/{layout,a11y,look,sheet,pwa}.spec.ts`, `proof/**`, `scripts/**`, `package.json`, `supabase/migrations/**` |
| **A — planning screens** | `components/WeekScreen.tsx`, `components/week/**`, `components/DayRow.tsx`, `components/MealTile.tsx`, `components/MealSheet.tsx`, `components/MealThumb.tsx`, `components/MealFacts*.tsx`, `components/add-meal/**`, `components/Favorites*.tsx`, `components/flags/**`, `components/verdicts/**`, `components/useWeekData.ts`, `app/(app)/week/**`, `app/(app)/favorites/**`, `tests/unit/design-legacy/a.txt`, `e2e/screens/a.ts`, `e2e/helpers/flows-a.ts`, `e2e/{week,find-my-dish,fits-this-week,family-flags,meal-facts,verdicts,photo,motion-week}.spec.ts` |
| **B — shopping and household** | `components/List*.tsx`, `components/StoreTabs.tsx`, `components/SwapSheet.tsx`, `components/Review*.tsx`, `components/BudgetMeter.tsx`, `components/PersonRow.tsx`, `components/StorePicker.tsx`, `components/household/**`, `app/(app)/list/**`, `app/(app)/household/**`, `app/onboarding/**`, `app/login/**`, `app/invite/**`, `tests/unit/design-legacy/b.txt`, `e2e/screens/b.ts`, `e2e/helpers/flows-b.ts`, `e2e/{list,swap,fred-meyer-prices,fred-meyer-connect,fred-meyer-cart,onboarding,login-code,smoke,motion-list}.spec.ts` |
| **Close-out (C1)** | `tests/unit/design-legacy/later.txt`, `e2e/screens/later.ts`, and every b–h file no row above covers |

Two stated exceptions: **S2** mounts `LookPicker` in `HouseholdScreen.tsx` and **S7** adds one call in `useWeekData.ts` and `FavoritesBrowser.tsx`; both run before A and B exist. **B7** edits `e2e/helpers/household.ts` and is the last task of Stream B.

**A screen task that needs a shared file changed** (a missing prop on a primitive, a new keyframe) stops and tells the controller. The controller dispatches a small Stream 1 patch on `premium-pass` (`full` review if it touches tokens, motion or `Sheet`), then merges it into both stream branches. Screen tasks never edit Stream 1 files.

**Order and merge order.**

1. **S1 → S9** land on `premium-pass`, in order (S6, S7, S8 and S9 share no file with each other; the controller may run two at once).
2. The controller cuts `premium-a`. **A1 → A2 → A3** run there while **S10** and **S11** run on `premium-pass`. Stream B does not start yet.
3. `premium-a` is merged into `premium-pass`; **A4, the owner checkpoint,** runs on the merged branch. Stream B and A5 onward wait for the owner's reply, or for 30 minutes with no objection (ledger ruling).
4. The controller merges `premium-pass` into `premium-a` and cuts `premium-b`. **A5 → A7** and **B1 → B7** run side by side. After each task passes its review the controller merges into `premium-pass` in the fixed order **Stream 1 patches, then A, then B**, runs `npm test`, and merges `premium-pass` back into a stream branch before that stream's next task. Always a merge, never a rebase. Implementers never merge.
5. When A and B are empty: **C1**, then **C2**, on `premium-pass`.

A merge conflict means the ownership table was broken: stop and tell the controller; do not resolve it by hand.

**e2e is one at a time.** `scripts/e2e-local.sh` builds into `.next`, serves port 3000 and uses the one local Supabase. Only one run may be in flight across all three worktrees; the controller hands out the turn (`flock /tmp/basket-e2e.lock scripts/e2e-local.sh …`). Name all of a task's specs in one run so the build happens once.

**Faster without loss.** Full Playwright suite only at S5, A4, B7 and C2; named specs elsewhere. Unit tests, lint and typecheck are cheap and run in every task. Batched reviews cover up to three tasks in one pass.

| Task | Stream | Review | What |
|---|---|---|---|
| S1 | 1 | full | Design values, fonts, type and copy helpers, style guard |
| S2 | 1 | full | Light, Dark or Match my phone |
| S3 | 1 | full | Motion language and helpers |
| S4 | 1 | full | Shared controls, icons and states |
| S5 | 1 | full | App shell, safe areas, screen registry, contrast audit |
| S6 | 1 | batched | Photo, fallback and packshot components |
| S7 | 1 | full | Photo data: preview, width, best resolution |
| S8 | 1 | full | Sheet that follows the finger |
| S9 | 1 | full | Budget sentence and the rolling total |
| S10 | 1 | batched | Proof tooling |
| S11 | 1 | full | Edges: manifest, icons, splash, status bar, page titles |
| A1 | A | full | Family pieces: flags, allergy and dislike boxes, verdicts, meal facts |
| A2 | A | full | This week: hero, pinboard, every state |
| A3 | A | full | This week in motion, and the dinner sheet |
| A4 | A | full | The week shown to the owner (checkpoint) |
| A5 | A | batched | Add a meal: search, sort, Find my dish, paste, favorites tab |
| A6 | A | full | The recipe page, the allergy gate, the photo growing into it |
| A7 | A | batched | Favorites |
| B1 | B | full | Shopping list: product rows, store tabs, states, budget bar |
| B2 | B | full | Shopping list in motion: the strike and the move |
| B3 | B | full | Item sheet and product Swap sheet |
| B4 | B | full | Cart review screen |
| B5 | B | full | Household: people and allergies, stores, Fred Meyer account, Look |
| B6 | B | batched | Login and invite |
| B7 | B | batched | Onboarding |
| C1 | close-out | full | Restyle the screens phases b–h added |
| C2 | close-out | full | Clean-up and the full proof |

## Global Constraints

Decided; do not reopen.

- **Read `AGENTS.md` first.** This Next.js differs from older versions; check `node_modules/next/dist/docs/` before using `metadata`, `viewport`, `loading.tsx`, route handlers or `next/font`.
- **One system, two looks.** `<html data-look="light | dark | auto">`. Light is Butter, dark is Cast Iron, `auto` follows the phone. Nothing but color, shadow and photo filter differs between looks.
- **Color, only through tokens** (utilities such as `bg-ground`, `text-ink-soft`). Butter / Cast Iron values: ground `#F5E6A6` / `#191614`; surface `#FFFBEC` / `#231F1B`; raised `#FFFDF6` / `#2E2923`; sunk `#EBD88F` / `#110F0E`; ink `#2B1422` / `#F3EDE0`; ink-soft `#62414F` / `#B9AE9C`; line `#DCC98A` / `#3A332E`; line-strong `#8C6E6A` / `#80766B`; accent `#4C1D3A` / `#E9B030`; on-accent `#F5E6A6` / `#191614`; accent-press `#3A152C` / `#CF9A22`; sale `#9A3412` / `#FF9070`; error `#A8123A` / `#FF9DAE`; price `#275E36` / `#A6C97C`; packshot `#FFFBEC` / `#EDE5D3`; scrim `25 12 20` / `17 15 14`. No hex value, `white`, `black` or grey utility in `app/` or `components/`.
- **Accent in three places only:** the screen's one main action (filled), the active tab, the "Tonight" label. Links in text are `ink`, semibold, with a chevron or underline. Sale, error and price colors are for text and small icons, always next to the word. A chosen option in a group that is not the tab bar is `ink`, never accent.
- **Type:** Gloock 400 (`font-display`) and Figtree 400/600/700 (`font-sans`) through `next/font/google`. Six sizes only: `text-display` 34/38, `text-title` 24/28, `text-heading` 18/24 (700), `text-body` 16/24, `text-small` 14/20, `text-label` 12/16. 12 px is the floor. Gloock never below 24 px, never bold. One `text-display` title per screen; a title longer than 18 characters uses `text-title` instead. Inputs are `text-body`. Caps only for day stamps and "Tonight" (`.bk-caps`).
- **Copy:** curly quotes and apostrophes (’ “ ”), en dash in ranges, `…` as one character. Quantities go through `<Qty>`. Servings through `servingsText` ("1 serving"). **Money:** an amount that comes from prices always shows cents (rows, tab totals, the list and review totals, the budget total); an amount the family typed as a target (budget, wiggle room) and the words after it ("$32 left") drop `.00`. Prices in a column use `.bk-price`, right-aligned, and never wrap or shrink. Errors say what failed and offer the retry as a button.
- **Spacing:** 2, 4, 8, 12, 16, 24, 32, 48, 64 px only (Tailwind `0.5 1 2 3 4 6 8 12 16`). Exceptions, both on the photo tile: caption padding 8 top/bottom and 10 sides, and the day stamp 6 px in from the tile's corner. Gutter 16, tile gap 8. Touch targets at least 44 px, main action 52 px, 8 px between neighbors. Controls use `min-h-*`, never a fixed `h-*`, so large text does not clip (audit C15).
- **Corners:** `rounded-xs` 2 (under 28 px), `rounded-sm` 4 (28–56), `rounded-md` 6 (56–200), `rounded-lg` 10 (over 200, and sheet top corners). Full-bleed photos have none. `rounded-full` only for avatars and the switch thumb. No pills: a chip is `rounded-md`.
- **Depth:** shadows only on things that float: `shadow-1` lifted tile and toast, `shadow-2` sheets and menus, `shadow-3` a dragged tile. Nothing on the page has a shadow or a card border; groups separate by `surface` on `ground` or a `line` hairline. The one colored border is the allergy box (see Kinds).
- **Photos:** crops hero 2:1, tile 8:5, thumb 1:1, nothing else. Every recipe photo goes through `<Photo>`; every store product shot through `<Packshot>`. Recipe photos stay plain `<img>` with `referrerPolicy="no-referrer"`; never proxy them. No illustrated or generated food.
- **Icons:** `lucide-react` only, through `<Icon>` (stroke 1.75, `currentColor`), sizes 18 (in buttons and rows), 22 (tab bar), 24 (standalone). No inline `<svg>`, no filled icons, no emoji. The characters ★ and ♥ in a rating line are text, kept as they are (tests and spoken names read them), set in `ink-soft`.
- **Motion:** durations fast 120 ms, base 240 ms, slow 400 ms; springs `ease-snap` (370 ms, no overshoot) and `ease-settle` (560 ms, 3.6% overshoot, signature moments only); `ease-out` for opacity and color. Animate only `transform`, `opacity` and `clip-path`. Nothing blocks a tap. Nothing over 400 ms except the three signature moments. Under `prefers-reduced-motion: reduce` every move is a 120 ms fade (the tokens already switch; multiply every travel distance by `var(--bk-move)`). Haptic: `navigator.vibrate(8)` where it exists.
- **Allergy wording and behaviour are untouched.** Never the words "safe", "nut-free", "allergen-free", "no allergens" or "free of". Every allergy flag keeps its warning icon, the word "allergy" and "check labels" or "check every label". An allergy line or box is never clamped, truncated, collapsed, dismissible or shown by color alone, in either look. Leave-out and swap are never offered for an allergy. `tests/unit/allergy-wording.test.ts` must pass unchanged.
- **Cart behaviour is untouched.** No change to what is sent, when, or to the double-send and unsure-send warnings. Their strings stay exact (curly apostrophes only).
- **Keep working:** every route, feature and stored value stays. Keep every role, accessible name, `data-testid` and visible string exactly as it is unless your task lists the change. When a task changes a string or structure that an e2e test selects, update that test in the same task. The blanket change is straight to curly quotes: grep your stream's specs and flow file for each string you touch. Known test ids to keep: `day-row-*`, `week-range`, `verdict-card`, `result-card`, `result-title`, `result-site`, `result-meta`, `result-loved`, `result-shares`, `result-made`, `result-flag`, `fits-empty`, `allergy-box`, `dislike-box`, `favorite-row`, `list-row`, `list-bar`, `list-total`, `row-total`, `row-count`, `check-all-undo`, `skipped`, `staple-row`, `person-row`.
- **Inventory first.** Every screen task begins by reading its files as they stand and the `design.md` of each phase b–h, and lists in its report every block the phases added to those files. Each is restyled in that task by the rule for its kind (below). Where a phase changed a screen's structure in a way this plan does not describe, keep the phase's structure, apply the values, and say so in the report.
- **Guard lists.** `tests/unit/design-legacy/{shared,a,b,later}.txt` hold the files not yet restyled, one path per line. A task that restyles a file removes it from its own stream's list in the same commit; the guard must then pass for it.
- **Every task ends green:** `npm run lint && npm run typecheck && npm test && npm run build`, plus the specs the task names.
- **e2e runs only through `scripts/e2e-local.sh <specs> [--project=…]`**, for implementers and the controller alike, one run at a time (see Streams). It builds against the local Supabase and refuses anything else. Never run `npx playwright test` or `npm run test:e2e` by hand. If the local stack is not up, leave the run to CI and say so in the commit body. Never open `.env*` files.
- **Review mode.** `full`: when the task's commit lands, Fable reviews that task alone (spec, then code), in both looks, at 360 px and with reduced motion where they apply; fixes land before the stream's next task starts. `batched`: the stream moves on; Fable reviews up to three batched tasks together at the next merge point, with one fix round.
- **Models.** Every implementer is Sonnet. Every reviewer is Fable. No task is handed to a stronger implementer; the tasks the pre-flight flagged (S8, A3, B2) are kept small and get a `full` review instead.
- **Commit trailers.** Every commit in this plan ends with these two lines, as its own last paragraph:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hf29AdVWKYk2WSmcXdZKkQ
```

## Kinds: how anything not named in a task is styled

Used for phase b–h blocks inside owned files, and for Task C1.

| Kind | Rule |
|---|---|
| **Sheet** | `Sheet` (S8) with `title`; one main action at most, in the sheet's own bottom row; rows split by hairlines; a choice among a few is `RadioRows`; closes through `useSheetClose()`. |
| **Notice block** (was a "card": the after-dinner question, a hint, "Plan my week" offer) | `bg-surface rounded-md p-3`, no border, no shadow; a question or sentence in `text-body` (the dish or subject in semibold), ghost buttons, `quietLink` for the way out. Never the filled accent button when the screen already has a main action. |
| **Status line** (stale prices, offline, "Saved.", connected) | `Banner tone="info"`: `bg-sunk`, icon, `text-small`, `role="status"`. |
| **Error** | `ErrorBanner` with a retry button. Field errors under the field. |
| **Allergy box and allergy line** | Box: `bg-error-tint border border-error rounded-md p-3`, `TriangleAlert` 18 and the title in `text-small font-bold text-error`, body in `text-small text-ink`. Line: `TriangleAlert` 18 and the words in `text-label font-semibold text-error` (on a photo: `text-on-photo`, over the scrim). Wraps freely. |
| **Won't-eat box and line** | Box: `bg-sunk rounded-md p-3`, title `text-small font-bold`, ghost buttons. Its done state: `bg-surface`, a `Check` icon and the words; no green. Line: `text-label text-ink-soft`. |
| **Chips** (foods, allergens, pick lists) | `Chip`: `min-h-11 rounded-md bg-surface`, text `text-small`, remove is an `IconButton` `X` named `Remove {name}`. Suggestions to tap are `ghostButton`s. |
| **Choice of two or three, inline** | `Segmented` (a radiogroup with roving focus and arrow keys); chosen is `bg-ink text-ground`. |
| **Settings rows** (notification settings, quiet hours, school days) | A section on the ground with a `text-heading` title; 52 px rows split by hairlines; `Switch` on the right; times and amounts as `TextField`; a phone permission state is words plus one ghost button ("Turn on reminders"), never color alone. |
| **Full-screen mode** (cook mode) | No tab bar. A header with an `IconButton` `X` and `data-bk-header`; the step in `font-display text-title`; that step's ingredients in `text-body` with `<Qty>`, a person's swap as a won't-eat line; timers in `text-title` with `.bk-price`; `barBottom` holds the main action. Steps change with a 16 px slide on `ease-snap` (times `--bk-move`), a 120 ms fade under reduced motion. An allergy line stays on every step that uses the food. |
| **Generated plan to accept** (Plan my week) | `MealTile` grid, the reason in `text-label text-ink-soft` under the name, the week total as `BudgetSentence`, one main action, a ghost "Try another". |
| **Sale and saving words** | `Tag` 18 and `on sale` in `text-label text-sale`; "saves about $X" in `ink` with `.bk-price`. |
| **Lists of rows** | Rows on the ground, split by `line` hairlines, 52 px minimum, a chevron when the row opens something. |

## Review Focus

Conditions the spec implies and that would bite a person; each has a test in the task named.

1. **Storage is blocked or holds junk** (private mode, a hand-edited value): the look falls back to Match my phone, nothing throws, no flash. S2.
2. **The browser has no View Transitions API or no `linear()`** (older Android WebView, Firefox): a tile still opens its recipe, sheets still move, with ordinary easing. S1, S3, A3.
3. **A second tap lands mid-animation** (ticking and unticking a list item inside 300 ms, tapping a tile while the week is still revealing, tapping Close while a photo is still growing): the end state matches the last tap and no tap is lost. A3, A6, B2.
4. **A photo is missing, 404s after its preview showed, never finishes, or is too small**: the designed fallback or the held preview shows, the layout does not jump, and a small photo is never the hero. S6, A2.
5. **Very long or very large values at 360 px wide** (an 80-character dish name with no spaces, a $1,234.56 total against a $10,000 budget, a total that gains a digit, a four-line product name): no sideways scroll, prices on one line, the rolling total keeps its place. S9, A2, B1.
6. **An allergy warning in the dark look, on a narrow tile, beside a long name**: the line is fully visible (never clamped), reads at 4.5:1 or better on its own background, and the "Pick a different dinner" gate is still the main action. A1, A5, A6, A7, B5.
7. **A cart screen restyled while a send is unsure, repeated or refused**: every warning the cart plan pinned still shows with the same words, and the safer button is the filled one. B4.

## Pre-flight rulings

`.superpowers/sdd/2026-11-26-premium-pass/preflight.md`, 41 findings. "Adopted" means the advisor's recommended ruling is written into the task named.

| # | Ruling | Where |
|---|---|---|
| F1 | Adopted, fitted to the cart: with no store chosen the caveat line stays; in product mode the lead is `This week’s total: ` and there is no caveat (the total is whole packages). | S9, B1 |
| F2 | **Changed.** `0006` is taken (cart) and so will be every number through phase h. Ruling: the migration takes the next free number when S7 starts (`ls supabase/migrations \| tail -1`, plus one). | S7 |
| F3 | Adopted. The controller applies the migration before S7's code is deployed anywhere; the false sentence is gone. | S7 |
| F4 | Adopted: straight quotes are found with the TypeScript parser. | S1 |
| F5 | Adopted: `THEME_COLOR` in `lib/look.ts`. | S2, S11 |
| F6 | Adopted: `ROUND_OK` includes `components/PersonRow.tsx`; onboarding reuses `PersonRow`. | S1, B5, B7 |
| F7 | Adopted: `<Qty q={Quantity}>` snaps from the unrounded number. | S1 |
| F8 | **Changed.** The `HEADER_DONE` list is replaced by one CSS rule keyed on `[data-bk-header]`, so there is no prefix to match and no shared list. The flex-column note is kept. | S5 |
| F9 | Adopted: hairline as an inset shadow, nav stays 48 + inset. | S5 |
| F10 | Adopted: `::view-transition { pointer-events: none; }` and a tap-through test. | S3, A3 |
| F11 | Adopted: every trace of the cost sort removed. | S9, B1 |
| F12 | Adopted: `budgetSentence` returns `total` and `of`. | S9 |
| F13 | Adopted, plus the hotfix's changes (no `maxLength`, the new failed-link sentence, `next` kept). | B6 |
| F14 | Adopted: `addFromSearch` in `e2e/helpers/flows-a.ts`, matching the label with either apostrophe. | S5 |
| F15 | Adopted. | S4 |
| F16 | Adopted. | S7 |
| F17 | First half **already done** by family Task 8 (signed links reused for 50 minutes, audit P7): S7 verifies it, does not rebuild it. Second half adopted. | S7, A2 |
| F18 | Adopted: `pinToday`. It also pins the after-dinner card, which depends on the date. | S5, A2 |
| F19 | Adopted. | A2, B1 |
| F20 | Adopted, both parts. | S2 |
| F21 | Adopted. | S8 |
| F22 | Adopted. | A3, B2 |
| F23 | Adopted: exemptions named. | S10 |
| F24 | Adopted: the roll is built in S9 and on the week before the checkpoint. | S9, A2, A4 |
| F25 | Adopted. | S5, S6, A2 |
| F26 | Adopted, all five. | S3, S5, S7, S10 |
| F27 | Adopted. | S1, S4 |
| F28 | (a) and (b) adopted. (c) is a controller step, offered at the checkpoint. | A3, A4 |
| F29 | Adopted. | A7 |
| F30 | Adopted, using the flags W1 already exposes. | B1 |
| F31 | Adopted: accessible names `Target` and `Weekly budget target` stay. Audit C5's wish to rename them is recorded in `audit-check.md`, not done. | B5, B7 |
| F32 | Adopted. | S11 |
| F33 | Adopted. | S3 |
| F34 | Adopted. | S1 |
| F35 | Adopted. | A6 |
| F36 | Adopted. | S1 |
| F37 | Adopted: written into `audit-check.md`, not ticked. | C2 |
| F38 | Adopted; `Segmented` takes its behaviour from the live `SortControl`. | S4 |
| F39 | Adopted. | S6, A5 |
| F40 | Adopted. | S7 |
| F41 | **Overtaken:** the ratings work was committed and shipped (340eb97…f313877). Its remaining half is adopted: keep `result-meta` and the strings; `Most loved` in `ink` semibold; ★ and ♥ stay as text. | A5 |
| Process | Adopted: nothing from this branch reaches production before C2. | Streams |
| §5 "stronger model for 8, 10, 16" | **Rejected.** Owner: helpers run on Sonnet. Those tasks are split smaller and get `full` Fable review. Cost if wrong: one extra fix round on each. | S8, A3, B2 |
| §5 "Haiku for 19" | **Rejected** for the same reason; Sonnet. | S11 |
| §5 "no parallel implementers for 9–18" | **Rejected.** Its cause (three shared arrays) is removed; see Streams. Cost if wrong: a merge conflict, which stops the stream rather than corrupting anything. | Streams |
| §5 splits and moves | Adopted: 16 split, 18 split into B6 and B7, `photo.spec` and the nav assertion moved, edges during the owner wait, full suite at four points only. 7 is not split (one task, one review of the guarded fetch). | — |

Smaller notes from the pre-flight's pair tables are written into the tasks: `markSettle` uses `sessionStorage`; `Packshot` keeps the attributes the Kroger spec asserts; the photo preview is an image on a `::before`, not the parent's background; Escape is caught on `cancel`; `settled` starts equal to `checked`; onboarding saves the open editor on `Start planning`.

---

## File structure

New: `lib/design/contrast.ts`, `lib/text/typography.ts`, `lib/look.ts`, `lib/motion/{motion,haptics,sheet-gesture,roll,view-transition,flip,settle}.ts`, `lib/photos/{verdict,best-url,preview,ensure-previews}.ts`, `components/ClientBoot.tsx`, `components/LookPicker.tsx`, `components/ui/{Icon,Button,Field,Tabs,Segmented,RadioRows,Check,Switch,Chip,Stepper,states,Banner,Toast,Qty,Photo,Packshot,ScreenHeader}.tsx`, `components/BudgetSentence.tsx`, `components/RollingNumber.tsx`, `components/MealTile.tsx`, `components/week/{TonightHero,OpenDay}.tsx`, `components/add-meal/RecipePage.tsx`, `app/api/meals/preview/route.ts`, one migration (`NNNN_photo_preview.sql`), `tests/unit/design-legacy/*.txt`, `e2e/screens/*.ts`, `e2e/helpers/{look,clock,flows-a,flows-b,audit}.ts`, `e2e/{look,sheet,a11y,photo,motion-week,motion-list}.spec.ts`, `proof/*.spec.ts`, `playwright.proof.config.ts`, `scripts/icons/splash.mjs`.

Replaced and deleted by the task that replaces them: `components/DayRow.tsx` (A2), `components/BudgetMeter.tsx` (B1, after A2 stopped using it), `components/add-meal/DraftPreview.tsx` becomes `RecipePage.tsx` (A6), `components/MealThumb.tsx` (A7, its last user).

---

## Stream 1 — values, theme and shared components

### Task S1: Design values, fonts, type and copy helpers, style guard

**Review: full** (contrast).

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`, `lib/domain/money-input.ts`
- Create: `lib/design/contrast.ts`, `lib/text/typography.ts`, `components/ui/Qty.tsx`, `tests/unit/design-legacy/{shared,a,b,later}.txt`
- Test: `tests/unit/tokens.test.ts`, `tests/unit/typography.test.ts`, `tests/unit/design-guard.test.ts`, `tests/unit/money-input.test.ts`

**Interfaces:**
- Produces: every `--bk-*` variable and Tailwind utility named in Global Constraints; classes `.bk-price`, `.bk-qty`, `.bk-photo`, `.bk-packshot`, `.bk-press`, `.bk-press-icon`, `.bk-caps`, `.bk-gutter`, `.bk-fallback-letter`; `--bk-nav-h`.
- `contrastRatio(a: string, b: string): number` (two `#RRGGBB` or two `rgb()` strings), `parseTokens(css: string): { light: Record<string,string>; dark: Record<string,string> }` in `lib/design/contrast.ts`.
- In `lib/text/typography.ts`: `curly(text: string): string`; `quantityParts(q: Quantity): { lead: string; built: string | null; rest: string }` (snaps from the unrounded amount; the unit is singular when the amount is 1 or less; anything it cannot snap falls back to `formatQuantity`'s text); `servingsText(n: number): string`; `portionText(f: number): string` (`1 portion`, `0.7 of a portion`).
- `<Qty q={Quantity} />` renders `lead`, then `built` inside `<span className="bk-qty">`, then `rest`. A bare whole number renders as the element's whole text (a test reads `"12"` exactly). A need with several parts ("1 + 7 oz") is one `<Qty>` per part.
- `formatMoney(cents: number, opts?: { zero: 'keep' | 'drop' }): string` in `lib/domain/money-input.ts` (thousands separator; `keep` is the default and always shows cents); `parseMoneyToCents` also accepts `.99`, `3.` and `1,200`. `formatDollars` and `formatPrice` stay as thin callers until their screens move over.
- The guard reads the four list files; `ROUND_OK = ['components/ui/Switch.tsx', 'components/PersonRow.tsx']`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/tokens.test.ts` reads `app/globals.css`:
```ts
const PAIRS = [['ink','ground'],['ink','surface'],['ink','raised'],['ink','sunk'],['ink','error-tint'],['ink','sale-tint'],['ink-soft','ground'],['ink-soft','surface'],['ink-soft','raised'],['ink-soft','sunk'],['on-accent','accent'],['on-accent','accent-press'],['accent','ground'],['accent','surface'],['ground','ink'],['sale','ground'],['sale','surface'],['sale','sale-tint'],['error','ground'],['error','surface'],['error','raised'],['error','error-tint'],['price','ground'],['price','surface'],['estimate','ground'],['estimate','surface']];
for (const look of ['light','dark'] as const) for (const [fg,bg] of PAIRS)
  it(`${look}: ${fg} on ${bg} is at least 4.5`, () => expect(contrastRatio(t[look][fg], t[look][bg])).toBeGreaterThanOrEqual(4.5));
it('line-strong and error are at least 3 against ground and surface in both looks (control and box edges, audit C10)', ...);
it('ink on ground is 13.67 in Butter and 15.44 in Cast Iron', () => { /* toBeCloseTo(…, 1) */ });
it('[data-look="dark"] and the auto media block hold the same values', ...);
it('there is a fallback for browsers without linear()', () => expect(css).toMatch(/@supports not \(transition-timing-function: linear\(0, 1\)\)/));
it('.bk-press and the html and body rules each appear once', ...);
```
If a new pair fails (the candidates are `error` on `raised` and `ink` on a tint), stop and tell the controller; do not change a color.

`tests/unit/typography.test.ts`:
```ts
expect(curly(`Who's eating`)).toBe('Who’s eating');
expect(curly(`"Mom's pick"`)).toBe('“Mom’s pick”');
expect(quantityParts({ amount: 1.5, unit: 'cup', kind: 'volume' })).toEqual({ lead: '1½', built: null, rest: ' cups' });
expect(quantityParts({ amount: 0.5, unit: 'cup', kind: 'volume' })).toEqual({ lead: '½', built: null, rest: ' cup' });
expect(quantityParts({ amount: 1 / 3, unit: 'cup', kind: 'volume' }).lead).toBe('⅓');
expect(quantityParts({ amount: 0.75, unit: 'tsp', kind: 'volume' }).lead).toBe('¾');
expect(quantityParts({ amount: 2.125, unit: 'lb', kind: 'mass' })).toEqual({ lead: '2 ', built: '1/8', rest: ' lb' });
expect(quantityParts({ amount: 11.2, unit: 'oz', kind: 'mass' })).toEqual({ lead: '11.2', built: null, rest: ' oz' });
expect(quantityParts({ amount: 12, unit: 'each', kind: 'count' })).toEqual({ lead: '12', built: null, rest: '' });
expect(servingsText(1)).toBe('1 serving'); expect(servingsText(3.8)).toBe('3.8 servings'); expect(servingsText(0)).toBe('0 servings');
```
(Use the real `Quantity` shape from `lib/domain/types.ts`; the literals above show intent.)

`tests/unit/money-input.test.ts` additions: `formatMoney(300)` is `$3.00`; `formatMoney(20000, { zero: 'drop' })` is `$200`; `formatMoney(123456)` is `$1,234.56`; `parseMoneyToCents('.99')` is 99; `'1,200'` is 120000; `'3.'` is 300; `'abc'` and `''` still fail.

`tests/unit/design-guard.test.ts`: walk every `.tsx` and `.ts` under `app/` and `components/` plus `lib/ui.ts`; for each file not on a legacy list, fail on any match of: `#[0-9a-fA-F]{3,8}\b` inside a string or class; `\b(bg|text|border|outline|accent|decoration|fill|stroke)-(white|black|gray-|slate-|zinc-|neutral-|stone-)`; `\btext-\[\d`; `\btext-(xs|sm|base|lg|xl|[2-9]xl)\b`; `\bfont-(thin|light|medium|extrabold|black)\b`; `\b(p|m)[trblxy]?-|\bgap-` with a step outside `0, 0.5, 1, 2, 2.5, 3, 4, 6, 8, 12, 16, px, auto`; `\brounded-\[`; `\brounded-(xl|2xl|3xl)\b`; `\brounded-full\b` outside `ROUND_OK`; `<svg`; `\bshadow-(sm|md|lg|xl)\b`; `\b(text|bg|border|outline|accent)-(green|green-tint|muted)\b`; `env\(safe-area-inset`; `\bh-(9|10|11|12|13)\b` on a `button`, `a` or `input` class string (use `min-h-`); `&apos;|&quot;`. **Straight quotes** are found with the TypeScript parser, not a regex: walk each `.tsx`, and fail on `'` or `"` in a `JsxText` node, or in a string literal that is a JSX child or the value of an attribute named `label`, `message`, `sentence`, `placeholder`, `title` or `aria-label`. Seed each list file with the current files that fail, placed by the ownership table. A second test fails if a list entry no longer exists or no longer fails (so the lists can only shrink), and a third fails if a path is on two lists.

- [ ] **Step 2: Run** `npx vitest run tests/unit/tokens.test.ts tests/unit/typography.test.ts tests/unit/design-guard.test.ts tests/unit/money-input.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 3: Replace the `:root` and `@theme inline` blocks of `app/globals.css` with the contents of `docs/design/tokens.css`,** after `@import "tailwindcss"`. Then, in `globals.css`:
  - `--bk-font-display: var(--font-gloock), "Iowan Old Style", Georgia, serif;` and `--bk-font-sans: var(--font-figtree), system-ui, sans-serif;`.
  - `--bk-nav-h: calc(3rem + var(--bk-safe-bottom));` in `:root`.
  - Merge the pasted `html` and `body` rules with the ones already there (one of each). Keep the `body` safe-area padding for now (S5 moves it). Delete the `h1, h2, h3` font rule.
  - **Replace** the two pasted `.bk-press` lines with: `.bk-press { transition: transform var(--bk-dur-snap) var(--bk-spring-snap); } .bk-press:active:not(:disabled) { transform: scale(var(--bk-press-scale)); transition: transform var(--bk-dur-fast) var(--bk-ease-out); }` and `.bk-press-icon:active:not(:disabled) { transform: scale(calc(1 - (1 - var(--bk-press-scale)) * 2)); }`.
  - `.bk-caps { text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }`, `.bk-gutter { padding-left: var(--bk-safe-left); padding-right: var(--bk-safe-right); }`, `.bk-fallback-letter { font-family: var(--bk-font-display); font-size: 54px; line-height: 1; color: var(--bk-ink-soft); }`.
  - `:focus-visible { outline: 2px solid var(--bk-accent); outline-offset: 2px; }`, `:disabled, [aria-disabled="true"] { opacity: 0.45; }`.
  - `@supports not (transition-timing-function: linear(0, 1)) { :root { --bk-spring-snap: cubic-bezier(0.2, 0.8, 0.2, 1); --bk-spring-settle: cubic-bezier(0.2, 0.8, 0.2, 1); } }` before the reduced-motion block.
  - A block marked `/* LEGACY ALIASES: deleted in Task C2 */` inside `@theme inline`: `--color-green: var(--bk-accent); --color-green-tint: var(--bk-sunk); --color-muted: var(--bk-ink-soft);` so screens not yet restyled stay readable in both looks.

- [ ] **Step 4: Fonts in `app/layout.tsx`.** `Gloock({ weight: '400', subsets: ['latin'], variable: '--font-gloock', display: 'swap' })` and `Figtree({ weight: ['400','600','700'], subsets: ['latin'], variable: '--font-figtree', display: 'swap' })` on `<html className>`; remove Bricolage Grotesque and DM Sans.

- [ ] **Step 5: Implement** `contrast.ts`, `typography.ts`, `Qty.tsx`, the money changes. Snapping: a fractional part within 0.02 of .25 .5 .75 .33 .67 becomes ¼ ½ ¾ ⅓ ⅔ joined to the whole number (no whole number when it is 0); within 0.01 of an odd eighth becomes `built`; anything else is left as `formatQuantity` writes it. Leave `formatQuantity` alone (tests and spoken names read it).

- [ ] **Step 6: Run** the four test files and `npm run lint && npm run typecheck && npm test && npm run build`. Expected: PASS.

- [ ] **Step 7: Commit** `feat(design): Butter and Cast Iron tokens, Gloock and Figtree, type and money helpers, style guard` (+ trailers).

---

### Task S2: Light, Dark or Match my phone

**Review: full** (theme switching).

Stored per device in `localStorage` under `basket:look` (`'light' | 'dark' | 'auto'`, default `'auto'`). Each person picks on their own phone. It survives sign-out (it describes the phone, not the person's data).

**Files:**
- Create: `lib/look.ts`, `components/ClientBoot.tsx`, `components/LookPicker.tsx`, `e2e/look.spec.ts`
- Modify: `app/layout.tsx`, `app/(app)/household/HouseholdScreen.tsx` (mount only), `tests/unit/signout.test.ts`
- Test: `tests/unit/look.test.ts`

**Interfaces:**
- In `lib/look.ts`:
  - `type Look = 'light' | 'dark' | 'auto'`; `LOOK_KEY = 'basket:look'`; `THEME_COLOR = { light: '#F5E6A6', dark: '#191614' } as const` (the only place these two values are written outside `globals.css`)
  - `parseLook(v: unknown): Look` (anything unknown is `'auto'`)
  - `readLook(storage?: Pick<Storage, 'getItem'> | null): Look` and `saveLook(look: Look, storage?: Pick<Storage, 'setItem'> | null): void`; neither ever throws
  - `boot(key: string, colors: { light: string; dark: string }): void`: one self-contained function (no imports, no closures) that reads the key inside `try/catch`, sets `documentElement.dataset.look`, and on every `meta[name="theme-color"]` sets `content` to that look's color (for `auto`, each tag by its own `media` attribute)
  - `LOOK_BOOT_SCRIPT = \`(${boot})(${JSON.stringify(LOOK_KEY)}, ${JSON.stringify(THEME_COLOR)})\``; `applyLook(): void` calls the same `boot` (one implementation, F20)
- `<ClientBoot />` (client, renders nothing): on mount `applyLook()`; again on every `usePathname()` change (Next may re-emit the theme-color tags); on a `storage` event for `LOOK_KEY`.
- `<LookPicker />`: `RadioRows`-shaped (S4 restyles it): `role="radiogroup"` `aria-label="Look"`, real `<input type="radio">` named `Light`, `Dark`, `Match my phone`, each with one line under it: `Butter`, `Cast Iron`, `Follows your phone’s setting`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/look.test.ts` (`// @vitest-environment jsdom`):
```ts
it('parseLook keeps the three values and turns anything else into auto', () => { for (const v of ['light','dark','auto']) expect(parseLook(v)).toBe(v); for (const v of [null, 'DARK', 7, '']) expect(parseLook(v)).toBe('auto'); });
it('readLook returns auto when storage throws or is missing', () => { expect(readLook({ getItem() { throw new Error('blocked'); } })).toBe('auto'); expect(readLook(null)).toBe('auto'); });
it('saveLook swallows a full or blocked storage', () => expect(() => saveLook('dark', { setItem() { throw new Error('full'); } })).not.toThrow());
it('boot with "dark" stored sets data-look and both theme-color tags to #191614', ...);
it('boot with "auto" gives the light tag #F5E6A6 and the dark tag #191614', ...);
it('the boot script sets data-look from storage and survives a throwing localStorage', () => { /* run LOOK_BOOT_SCRIPT with new Function against jsdom */ });
```
`tests/unit/signout.test.ts`: `clearDeviceData` leaves `basket:look` in place (this pins today's behaviour; it passes before the change).

`e2e/look.spec.ts`:
```ts
test('auto follows the phone', async ({ browser }) => { /* context colorScheme: 'dark' → html background rgb(25, 22, 20); 'light' → rgb(245, 230, 166) */ });
test('choosing Dark sticks, sets the status bar color, and does not flash on reload', async ({ page }) => {
  // createHousehold, goto /household, check radio "Dark"
  // expect html[data-look="dark"], localStorage basket:look === 'dark', every meta[name=theme-color] content '#191614'
  // addInitScript: a MutationObserver that records documentElement.dataset.look into window.__lookAtBody when <body> first appears
  // reload → window.__lookAtBody === 'dark'
});
test('the status bar color survives a tap on the tab bar', ...);   // choose Dark, tap "List" in the nav, every theme-color tag is still #191614
test('a junk stored value behaves as Match my phone', ...);         // localStorage basket:look = 'purple'
test('a second tab follows the choice', ...);                       // two pages, choose Light in one, the other has data-look="light"
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/look.test.ts tests/unit/signout.test.ts`. Expected: `look.test.ts` FAILS.
- [ ] **Step 3: Implement** `lib/look.ts`, `ClientBoot`, `LookPicker`.
- [ ] **Step 4: Wire `app/layout.tsx`.** Keep the font `className` from S1: `<html lang="en" className={…} data-look="auto" suppressHydrationWarning>`; first child of `<head>`: `<script data-look-boot dangerouslySetInnerHTML={{ __html: LOOK_BOOT_SCRIPT }} />`; `viewport.themeColor = [{ media: '(prefers-color-scheme: light)', color: THEME_COLOR.light }, { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark }]`; render `<ClientBoot />` in `<body>`.
- [ ] **Step 5: Mount the picker** in `HouseholdScreen.tsx` as `<section aria-label="Look">` with heading `Look`, directly above the Account section (B5 styles the section).
- [ ] **Step 6: Run** unit tests, then `scripts/e2e-local.sh e2e/look.spec.ts`. Expected: PASS on `iphone-17` and `pixel-7`.
- [ ] **Step 7: Commit** `feat(look): Light, Dark or Match my phone, stored on the device, no flash on load` (+ trailers).

---

### Task S3: Motion language and helpers

**Review: full** (motion and reduced motion).

All motion CSS for every stream lives here, so no screen task edits `globals.css`.

**Files:**
- Create: `lib/motion/motion.ts`, `haptics.ts`, `sheet-gesture.ts`, `roll.ts`, `view-transition.ts`, `flip.ts`, `settle.ts`
- Modify: `app/globals.css`
- Test: `tests/unit/motion.test.ts`

**Interfaces (all produced here):**
- `motion.ts`: `DUR = { fast: 120, base: 240, slow: 400, snap: 370, settle: 560 } as const`; `prefersReducedMotion(win?: Pick<Window, 'matchMedia'>): boolean`
- `haptics.ts`: `tick(nav?: { vibrate?: (ms: number) => boolean }): boolean` calls `vibrate(8)`; false when absent; never throws
- `sheet-gesture.ts`: `velocity(samples: { t: number; y: number }[]): number` (px/ms over the last 100 ms; positive is downward); `shouldDismiss(dragPx: number, sheetHeightPx: number, velocityPxPerMs: number): boolean` (true when velocity > 0.5, or dragPx / height > 0.3)
- `roll.ts`: `rollDigits(prev: string, next: string): { char: string; from: string | null; delayMs: number }[]` (one entry per character of `next`, compared from the right; `from` is the old digit when a digit changed or is new, else null; `delayMs` is 30 × the changed digit's rank from the right); `rollDirection(prevCents: number, nextCents: number): 'up' | 'down'`
- `view-transition.ts`: `supportsViewTransitions(doc?: Document): boolean`; `morph(opts: { from: HTMLElement | null; to: () => HTMLElement | null; update: () => void; name?: string; doc?: Document; reduced?: boolean }): Promise<void>`
- `flip.ts`: `invert(first: { left: number; top: number }, last: { left: number; top: number }): { dx: number; dy: number }`; `useFlipList(ref: React.RefObject<HTMLElement | null>, signature: string): void` (reads `ref.current.querySelectorAll('[data-flip-key]')`, at any depth; when `signature` changes, each one that moved animates from its old place with the Web Animations API, 370 ms, the computed value of `--bk-spring-snap`; under reduced motion a 120 ms opacity fade instead)
- `settle.ts`: `SETTLE_KEY = 'basket:settle'`; `markSettle(day: string, storage?: Storage | null, now?: number): void` and `takeSettle(storage?: Storage | null, now?: number): string | null` (default storage is `sessionStorage`; returns and removes the day when marked under 10 s ago); `newlyFilled(prev: string[] | null, next: string[]): string[]`
- CSS classes: `.bk-reveal` (reads `--i`), `.bk-settle`, `.bk-skeleton`, `.bk-fade-in`, `.bk-strike` (toggled by `data-on`), `.bk-roll` (the digit column), and the `meal-photo` view-transition rules.

- [ ] **Step 1: Write the failing tests** in `tests/unit/motion.test.ts`:
```ts
expect(tick(undefined)).toBe(false); expect(tick({})).toBe(false); const v = vi.fn(() => true); expect(tick({ vibrate: v })).toBe(true); expect(v).toHaveBeenCalledWith(8);
expect(tick({ vibrate() { throw new Error('no'); } })).toBe(false);
expect(shouldDismiss(100, 600, 0.1)).toBe(false); expect(shouldDismiss(181, 600, 0)).toBe(true); expect(shouldDismiss(20, 600, 0.51)).toBe(true); expect(shouldDismiss(20, 600, -0.9)).toBe(false);
expect(velocity([{ t: 0, y: 0 }, { t: 50, y: 40 }, { t: 100, y: 80 }])).toBeCloseTo(0.8);
expect(rollDigits('$168.00', '$172.00').filter((d) => d.from !== null).map((d) => d.char)).toEqual(['7', '2']);
expect(rollDigits('$98.50', '$104.50').map((d) => d.from)).toEqual([null, ' ', '9', '8', null, null, null]); // a new leading digit rolls in from blank
expect(rollDigits('$1,234.56', '$1,234.56').every((d) => d.from === null)).toBe(true);
expect(rollDirection(16800, 17200)).toBe('up'); expect(rollDirection(17200, 16800)).toBe('down');
expect(invert({ left: 10, top: 100 }, { left: 10, top: 160 })).toEqual({ dx: 0, dy: -60 });
markSettle('thu', s, 1000); expect(takeSettle(s, 5000)).toBe('thu'); expect(takeSettle(s, 5000)).toBeNull();
markSettle('thu', s, 1000); expect(takeSettle(s, 12000)).toBeNull();
expect(newlyFilled(null, ['mon'])).toEqual([]); expect(newlyFilled(['mon'], ['mon', 'thu'])).toEqual(['thu']);
// morph (jsdom)
it('without the API, morph calls update once and names nothing', ...);
it('with reduced: true, morph calls update once and never calls startViewTransition', ...);
it('with the API, the name is on `from` before the transition, on `to()` inside it, and on neither after `finished`', ...);
it('morph with from: null just calls update', ...);
it('useFlipList finds keys on grandchildren', ...);
```
- [ ] **Step 2: Run** `npx vitest run tests/unit/motion.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the seven modules.** `morph`: default `name` is `'meal-photo'`; set `from.style.viewTransitionName`, call `doc.startViewTransition(() => { clear it on from; update(); set it on to() })`, clear it on the destination when `finished` settles (resolve either way). `update` must be synchronous (callers wrap state changes in `flushSync`).
- [ ] **Step 4: Add the CSS** to `app/globals.css`:
```css
@keyframes bk-reveal { from { opacity: 0; transform: translateY(calc(8px * var(--bk-move))); } }
.bk-reveal { animation: bk-reveal var(--bk-dur-base) var(--bk-ease-out) both; animation-delay: calc(min(var(--i, 0), 7) * var(--bk-stagger)); }
@keyframes bk-settle-move { from { transform: translateY(calc(-12px * var(--bk-move))) scale(calc(1 + 0.04 * var(--bk-move))); } }
@keyframes bk-settle-fade { from { opacity: 0; } }
@keyframes bk-settle-shadow { 0%, 54% { opacity: 1; } 100% { opacity: 0; } }
.bk-settle { position: relative; animation: bk-settle-move var(--bk-dur-settle) var(--bk-spring-settle) both, bk-settle-fade var(--bk-dur-base) var(--bk-ease-out) both; }
.bk-settle::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: var(--bk-shadow-1); pointer-events: none; animation: bk-settle-shadow var(--bk-dur-settle) linear both; }
@keyframes bk-skeleton { 50% { opacity: 0.6; } }
.bk-skeleton { background: var(--bk-sunk); animation: bk-skeleton 1.2s ease-in-out infinite; }
@keyframes bk-fade-in { from { opacity: 0; } }
.bk-fade-in { animation: bk-fade-in var(--bk-dur-base) var(--bk-ease-out) both; }
.bk-strike { position: absolute; inset: 0; color: transparent; text-decoration: line-through; text-decoration-color: var(--bk-ink-soft); text-decoration-thickness: 1.5px; clip-path: inset(0 100% 0 0); transition: clip-path var(--bk-dur-base) var(--bk-ease-out); pointer-events: none; }
.bk-strike[data-on] { clip-path: inset(0); transition-delay: 60ms; }
.bk-roll { display: inline-block; overflow: hidden; height: 1lh; vertical-align: bottom; }
.bk-roll > span { display: block; transition: transform var(--bk-dur-settle) var(--bk-spring-settle); }
::view-transition { pointer-events: none; }
::view-transition-group(meal-photo) { animation-duration: var(--bk-dur-slow); animation-timing-function: var(--bk-spring-snap); }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: var(--bk-dur-base); animation-timing-function: var(--bk-ease-out); }
@media (prefers-reduced-motion: reduce) { .bk-skeleton { animation: none; } .bk-strike, .bk-strike[data-on] { transition: opacity var(--bk-dur-fast) linear; transition-delay: 0ms; } }
```
- [ ] **Step 5: Run** the test file and the full unit suite. Expected: PASS.
- [ ] **Step 6: Commit** `feat(motion): durations, two springs, reduced-motion path, haptic tick and helpers` (+ trailers).

---

### Task S4: Shared controls, icons and states

**Review: full** (every screen stands on these; focus, keyboard and contrast).

**Files:**
- Create: `components/ui/Icon.tsx`, `Button.tsx`, `Field.tsx`, `Tabs.tsx`, `Segmented.tsx`, `RadioRows.tsx`, `Check.tsx`, `Switch.tsx`, `Chip.tsx`, `Stepper.tsx`, `states.tsx`, `Banner.tsx`, `Toast.tsx`
- Modify: `lib/ui.ts`, `components/ClientBoot.tsx`, `components/LookPicker.tsx`, `package.json`
- Test: `tests/unit/ui-controls.test.tsx` (jsdom)

**Interfaces:**
- `<Icon icon={LucideIcon} size={18 | 22 | 24} label?: string />`: `strokeWidth={1.75}`; `aria-hidden` unless `label`, then `role="img"` and `aria-label`.
- `lib/ui.ts` new exports: `mainAction` (`min-h-13 w-full rounded-md bg-accent text-on-accent active:bg-accent-press text-body font-bold bk-press`, flex centered, `no-underline`), `ghostButton` (`min-h-11 rounded-md border border-line-strong bg-transparent px-3 text-small font-semibold text-ink bk-press`, flex centered, `gap-2`; wraps rather than clips), `quietLink` (`inline-flex min-h-11 items-center gap-0.5 text-small font-semibold text-ink no-underline`), `textInput` (`min-h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-body text-ink`), `barAboveNav` (`sticky bottom-[var(--bk-nav-h)] z-10 bg-ground bk-gutter pt-2 pb-2 shadow-[inset_0_1px_0_var(--bk-line)]`), `barBottom` (the same with `bottom-0` and `pb-[var(--bk-safe-bottom)]`). **The old names stay as aliases** (`primaryButton = mainAction`, `bigGreenLink = mainAction`, `pillButton = ghostButton`, `stickyAboveNav = barAboveNav`, `stickyBottom = barBottom`, `focusRing = ''`) under a comment `LEGACY NAMES: deleted in Task C2`; no call site is touched here. `lib/ui.ts` leaves `shared.txt`.
- `<Button variant="main" | "ghost" busy?: boolean busyLabel?: string className? {...buttonProps} />` (when `busy`: disabled, shows `busyLabel`, keeps its width); `<ButtonLink variant href className? {...} />` (a `next/link`); `<IconButton icon label onClick? href? className? disabled? {...} />` (44 × 44, `rounded-md`, `bk-press bk-press-icon`, `aria-label={label}`).
- `<TextField label error? icon? hideLabel? {...inputProps} />` (label in `text-small` `ink-soft` above, or visually hidden; error under the field in `text-small text-error`, `role="alert"`, passed through `curly()`); `<TextAreaField>` and `<SelectField>` on the same box.
- `<Tabs label items={{ id: T; label: string; detail?: string }[]} active onChange panelId />`: `role="tablist"` `aria-label={label}`; each `role="tab"` with `aria-selected`, `aria-controls={panelId}`, roving `tabIndex` and arrow keys; min 48 px tall, label `text-small`, detail `text-label` under it; active is `text-accent font-bold` with a 2 px `accent` bottom edge; inactive `text-ink-soft`; one `line` hairline under the row. The accessible name of a tab is its label then its detail. The caller renders the `role="tabpanel"` with that id.
- `<Segmented label options={{ id: T; label: string }[]} value onChange />`: `role="radiogroup"` `aria-label={label}`, buttons `role="radio"` `aria-checked`, roving focus and arrow keys exactly as `components/add-meal/SortControl.tsx` does today; min 44 px; chosen `bg-ink text-ground font-semibold rounded-md`, others `text-ink`; the group sits on `bg-sunk rounded-md p-0.5`.
- `<RadioRows label name options={{ value; label; detail? }[]} value onChange />`: `role="radiogroup"`, real `<input type="radio">` in 52 px label rows split by hairlines; the mark is a 20 px ring in `line-strong`, filled `ink` when chosen.
- `<Check checked onChange label children? />`: a 44 × 44 `<label>` around a real `<input type="checkbox" aria-label={label}>` shown as a 20 px `rounded-xs` box with a 1.5 px `line-strong` edge; checked fills `ink` with the check stroke in `ground`, drawn by `stroke-dashoffset` over `--bk-dur-fast` (a transition, so it reverses). `children` is visible text inside the same label.
- `<Switch checked onChange label />`: real `<input type="checkbox" role="switch" aria-label={label}>` in a 48 px label; track 44 × 24 `rounded-full`, `sunk` with a `line-strong` edge off and `ink` on; thumb 20 px `rounded-full` `surface`, slides with `ease-snap`.
- `<Chip onRemove? removeLabel?>{text}</Chip>` and `<Stepper value min max onChange fewerLabel moreLabel />` (two `IconButton`s, `Minus` and `Plus`, the number between in `.bk-price text-body` with `aria-live="polite"`).
- `states.tsx`: `<SkeletonLines lines size="body" | "small" />`, `<SkeletonTile crop="hero" | "tile" />` (both `aria-hidden`), `<Loading label />` (a visually hidden `role="status"`; every skeleton group gets one, audit C12), `<EmptyState sentence action? />` (one sentence in `text-body`, one ghost action, on the ground), `<ErrorBanner message actionLabel? onAction? />` (`role="alert"`, `bg-error-tint`, `TriangleAlert` and text in `text-error`, `rounded-md`, padding 12; message through `curly()`).
- `<Banner tone="info" icon? role="status">` (`bg-sunk`, `text-small`); `<OfflineStrip state="offline" | "back" | "saved" />` on top of it (texts `Offline. Showing your last list.`, `Back online.`, `Back online. Saved.`).
- `<Toast message tone="ok" | "bad" action?: { label; onAction } ms?: number onDone testId? />`: `role="status"`, fixed above the nav, `bg-raised shadow-1 rounded-md`, `text-small`; leaves after `ms` (default 4000); message through `curly()`.

- [ ] **Step 1: Write the failing test** `tests/unit/ui-controls.test.tsx`: `Tabs` moves selection with ArrowRight and ArrowLeft and only the selected tab has `tabIndex` 0; `Segmented` does the same with `aria-checked`; `RadioRows` renders native radios sharing one `name`; `Button busy` is disabled and shows `busyLabel`; `ErrorBanner message="We couldn't save."` renders `couldn’t`; `Toast` calls `onDone` after `ms` (fake timers) and not before; `IconButton` has the label as its accessible name; `Stepper` never goes below `min` or above `max`.
- [ ] **Step 2: Run** it. Expected: FAIL. **Install** `npm i lucide-react`.
- [ ] **Step 3: Build the components** to the interfaces above. Utilities only; none goes on a legacy list. Restyle `LookPicker` as `RadioRows`.
- [ ] **Step 4: Press on iOS.** In `ClientBoot`, add `document.addEventListener('touchstart', () => {}, { passive: true })` on mount (Safari only applies `:active` to non-links when a touch listener exists).
- [ ] **Step 5: Run** `npm run lint && npm run typecheck && npm test && npm run build`, then `scripts/e2e-local.sh e2e/look.spec.ts e2e/layout.spec.ts`. Expected: PASS (old screens pick up the new buttons through the aliases and look mixed; that is expected until their task).
- [ ] **Step 6: Commit** `feat(ui): Lucide icons, buttons with a press state, fields, tabs, radios, chips and designed states` (+ trailers).

---

### Task S5: App shell, safe areas, the screen registry and the contrast audit

**Review: full** (contrast).

**Files:**
- Create: `components/ui/ScreenHeader.tsx`, `e2e/helpers/look.ts`, `e2e/helpers/clock.ts`, `e2e/helpers/audit.ts`, `e2e/helpers/flows-a.ts`, `e2e/helpers/flows-b.ts`, `e2e/screens/{index,shared,a,b,later}.ts`, `e2e/a11y.spec.ts`
- Modify: `components/BottomNav.tsx`, `app/(app)/layout.tsx`, `app/(app)/loading.tsx`, `app/globals.css`, `e2e/layout.spec.ts`, and, once, every spec that crosses streams (listed in Step 1)

**Interfaces:**
- `<ScreenHeader title action? below? back?: { href; label } size?: 'display' | 'title' />`: `<header data-bk-header className="bk-gutter pt-[var(--bk-safe-top)] pb-2">`, a row with an optional `IconButton` back or close, `<h1 className="font-display text-display">` (`text-title` when `size="title"`), `action` on the right, then `below`.
- **Top inset without a list:** in `globals.css`, `body { padding: 0; }` and `body:not(:has([data-bk-header])) { padding-top: var(--bk-safe-top); }`. A screen that renders a `[data-bk-header]` owns its own top inset; every other screen keeps it from this rule. C2 deletes the rule.
- Tab bar: order **This week, Favorites, List, Household** (hrefs `/week`, `/favorites`, `/list`, `/household`); icons `Calendar`, `Bookmark`, `ListChecks`, `Users` at 22; labels `text-label`; active `text-accent font-bold`, others `text-ink-soft font-semibold`; `bg-surface`, hairline as `shadow-[inset_0_1px_0_var(--bk-line)]` (no border, so the height is exactly `--bk-nav-h`); padding `4px 8px var(--bk-safe-bottom)`; each link `min-h-11 flex-1 bk-press`. If a phase added a fifth destination, keep it, in the phase's position, and say so.
- `app/(app)/layout.tsx` keeps the `max-w-md` column as `flex flex-1 flex-col` (bottom bars rely on `mt-auto`). `app/(app)/loading.tsx` (added by cart task W2) uses `SkeletonTile`, `SkeletonLines` and `Loading`.
- `e2e/helpers/look.ts`: `setLook(page, look)` and `setInsets(page, top, bottom)`, both through `page.addInitScript` so they survive every `goto`.
- `e2e/helpers/clock.ts`: `pinToday(page, day)` uses `page.clock.setFixedTime` at noon Los Angeles time on that weekday of the current week.
- `e2e/helpers/audit.ts`: `audit(page): Promise<Problem[]>` (the layout checks, moved out of `layout.spec.ts`) and `textPairs(page): Promise<[fg: string, bg: string, text: string][]>`; the spec computes ratios in Node with the real `contrastRatio` (one copy of the maths).
- `e2e/screens/*.ts`: `interface Screen { name: string; path: string; signedOut?: true; fresh?: true; contrastPending?: true; setup?: (page: Page) => Promise<void> }`. `a.ts`: `week`, `add-meal`, `favorites`. `b.ts`: `list`, `review`, `household`, `onboarding` (`fresh`), `login` (`signedOut`), `invite-failed`. Any screen a phase added to `layout.spec.ts` moves to the file of the stream that owns it, else `later.ts`. Every entry starts with `contrastPending: true`; `index.ts` joins them.
- `e2e/helpers/flows-a.ts` (drives Stream A's screens, owned by A): `addFromSearch(page, { day, query, pick, source? })` (finds the field with `getByLabel(/What.s for dinner\?/)`), `weekBudget(page): Promise<{ totalCents: number; text: string }>`, `addFavoriteToDay`. `flows-b.ts` (owned by B): `chooseStore`, `setBudget`, `openList`, `listTotal`, `openItemSheet` (S8's sheet spec uses it).

- [ ] **Step 1: Update the tests first.**
  - Nav link `"Week"` becomes `"This week"` wherever a spec clicks it.
  - **Untangle the specs.** Grep every spec for steps on a screen its stream does not own (`list.spec.ts` plans dinners and reads the week's budget; `fred-meyer-prices.spec.ts` adds a meal and reads the week's meter; `week.spec.ts` and `onboarding.spec.ts` open `/household`). Replace each with a call to a flow helper, so no spec holds another stream's selectors. Assertions about the *wording* of another stream's screen move to that stream's spec (`list.spec.ts`'s week-side budget words go to `week.spec.ts`). List every move in the commit body. No assertion is dropped.
  - `e2e/layout.spec.ts`: loop over `SCREENS` from the registry, for `look of ['light', 'dark']`, and again in light with `setInsets(page, 62, 34)` (iPhone 17) and `setInsets(page, 28, 24)` (Pixel 7 gestures). Checks: `audit()`; every pair from `textPairs()` is at least 4.5 unless the screen is `contrastPending` (skip nodes inside `[data-on-photo]`); the first `h1` starts at or below the top inset; the nav's bottom padding is at least the bottom inset and the nav's bottom edge equals `innerHeight`; the last row of the page scrolls clear of any bottom bar.
  - `e2e/a11y.spec.ts`: `nav[aria-label="Main"] svg:not(.lucide)` count is 0; `document.title` differs between the four tabs (passes after S11 and the screen tasks; mark that one `test.fixme('enabled in C2')`).
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/layout.spec.ts e2e/a11y.spec.ts`. Expected: FAIL (nav label, nav icons, insets on body).
- [ ] **Step 3: Implement** `ScreenHeader`, the new `BottomNav`, the body rule, `loading.tsx`.
- [ ] **Step 4: Run the whole suite:** `scripts/e2e-local.sh`. Expected: PASS on all three projects.
- [ ] **Step 5: Commit** `feat(shell): tab bar in the new order, screen header, safe areas, one screen registry` (+ trailers).

---

### Task S6: Photo, fallback and packshot components

**Review: batched.**

**Files:**
- Create: `lib/photos/verdict.ts`, `components/ui/Photo.tsx`, `components/ui/Packshot.tsx`
- Test: `tests/unit/photo-verdict.test.ts`

**Interfaces:**
- `type Crop = 'hero' | 'tile' | 'thumb'`; `photoVerdict(crop: Crop, sourceWidth: number | null): 'ok' | 'fallback' | 'demote'`: null is `'ok'`; `0` is `'fallback'` (a photo the preview route could not read, F40); `thumb` is otherwise `'ok'`; under 300 is `'fallback'`; `hero` under 600 is `'demote'`.
- `<Photo src: string | null name: string crop: Crop preview?: string | null width?: number | null priority?: boolean hint?: boolean className?: string onDemote?: () => void imgRef?: React.Ref<HTMLImageElement> />`
  - Wrapper: `relative bg-sunk overflow-hidden` with `aspect-hero | aspect-tile | aspect-thumb`, `data-photo-state="loading" | "ready" | "fallback"`.
  - While loading, `preview` (a data URI) is the `background-image` of a `::before` layer (`inset: 0`, `cover`, `filter: blur(var(--bk-photo-blur))`, scaled 1.1), set through a CSS variable on the wrapper. It is **not** an `<img>`: tests rely on one `<img>` per photo.
  - The real photo is one `<img className="bk-photo" alt="" decoding="async" referrerPolicy="no-referrer">`, `loading="lazy"` unless `priority` (then `fetchPriority="high"`), opacity 0 to 1 over `--bk-dur-base` on load (check `img.complete` on mount for cached photos). A changed `src` for the same photo (a re-signed link) does not drop back to loading when the old image is already shown.
  - On load, run `photoVerdict(crop, width ?? img.naturalWidth)`: `'fallback'` shows the fallback; `'demote'` calls `onDemote`. On error, or `src` null: fallback, and no `<img>` in the DOM.
  - Fallback, `tile` and `hero`: `sunk`, the name's first letter upper-cased in `.bk-fallback-letter`, and, when `hint` is not false, `Add a photo` in `text-small font-semibold text-ink-soft` under it. `thumb`: the letter alone in Gloock at 24 px.
- `<Packshot src: string | null alt: string size?: 44 | 64 />`: `.bk-packshot`, the image inside with `loading="lazy"` and `referrerPolicy="no-referrer"`; keep whatever `alt` the Kroger specs assert today (if no test pins it and the name is printed beside it, `alt=""`); renders nothing when `src` is null or the image fails.

- [ ] **Step 1: Write the failing test.**
```ts
expect(photoVerdict('tile', null)).toBe('ok'); expect(photoVerdict('tile', 0)).toBe('fallback'); expect(photoVerdict('tile', 299)).toBe('fallback'); expect(photoVerdict('tile', 300)).toBe('ok');
expect(photoVerdict('hero', 599)).toBe('demote'); expect(photoVerdict('hero', 600)).toBe('ok'); expect(photoVerdict('hero', 250)).toBe('fallback'); expect(photoVerdict('thumb', 120)).toBe('ok');
```
- [ ] **Step 2: Run** `npx vitest run tests/unit/photo-verdict.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files. (The e2e for `<Photo>` is written in A2, against its first real use.)
- [ ] **Step 4: Run** unit tests, lint, typecheck, build. Expected: PASS.
- [ ] **Step 5: Commit** `feat(photo): shared crop and treatment, blurred preview, designed fallback, packshot tile` (+ trailers).

---

### Task S7: Photo data: stored preview, source width, best resolution

**Review: full** (it touches the guarded fetch that stops requests to private addresses).

Adds two nullable columns; no existing value changes. **Controller, before this task's code is deployed anywhere:** apply the migration to production (safe at any time: two nullable columns, and the live code reads with `select *`).

**Files:**
- Create: `supabase/migrations/NNNN_photo_preview.sql` (`NNNN` is the last number in the folder plus one, read when the task starts), `lib/photos/preview.ts`, `lib/photos/best-url.ts`, `lib/photos/ensure-previews.ts`, `app/api/meals/preview/route.ts`
- Modify: `lib/db/types.ts` and `lib/db/rows.ts` (meals: `photo_preview: string | null`, `photo_width: number | null`), `lib/db/queries/meals.ts` (`setMealPhoto`), `lib/recipes/import-url.ts`, `lib/recipes/jsonld.ts`, `lib/recipes/search/spoonacular.ts`, `components/useWeekData.ts` and `components/FavoritesBrowser.tsx` (one call each), `package.json`
- Test: `tests/unit/photo-preview.test.ts`, `tests/unit/best-url.test.ts`, additions to `tests/unit/import-url.test.ts`, `tests/unit/jsonld.test.ts`

**Interfaces:**
- SQL: `alter table public.meals add column if not exists photo_preview text, add column if not exists photo_width integer;`
- `makePreview(bytes: Uint8Array): Promise<{ preview: string; width: number }>` (server-only; `sharp(bytes).rotate()`; `width` is the rotated source width; preview is 16 px wide WebP quality 40 as `data:image/webp;base64,…`; throw if it exceeds 2,000 characters)
- In `import-url.ts`: **extract, do not copy.** `fetchGuarded(url, opts: { accept: string; okType: (contentType: string) => boolean; wrongType: ImportErrorCode; timeoutMs: number; maxBytes: number }): Promise<Uint8Array>` holds the one guarded lookup and redirect loop; `fetchRecipePage` becomes a caller that decodes its result; `fetchPublicBytes(url, opts?)` is a second caller (5,000 ms, 8 MB, `content-type` starting `image/`, else the new code `'not_image'`). Every existing `import-url` test passes unchanged.
- `POST /api/meals/preview` body `{ mealId: string }`: `requireHousehold()` (no paid call, so no spend gate); load the meal through the caller's client; bytes come from `sb.storage.from('meal-photos').download(photo_path)` for an uploaded photo, else `fetchPublicBytes(photo_url)`; `makePreview`; `updateMeal(sb, id, { photo_preview, photo_width })`; responds `200 { preview, width }`, `404` no meal or no photo, `400` bad body, and on `ImportError` or a decode failure `422 { error }` **after** storing `photo_width: 0` so it is not asked again.
- `ensurePreviews(meals: Pick<MealRow, 'id' | 'photo_path' | 'photo_url' | 'photo_preview' | 'photo_width'>[]): void` (browser): for each meal with a photo, no preview and a width that is not 0, POST once per meal id per page session, at most 3 at a time, swallowing every failure. Called after `setData`, not awaited, outside the load's `try` (the same pattern the facts backfill uses; W1's single-flight load is untouched, no subscription is added).
- `bestPhotoUrl(url: string): string`: on hosts `img.spoonacular.com` and `spoonacular.com`, a size suffix `-90x90 | -240x150 | -312x150 | -312x231 | -480x360 | -556x370` before `.jpg | .jpeg | .png | .webp` becomes `-636x393`; every other URL is returned unchanged. `toOption` keeps every field it has today (`likes`, `steps`, the facts).
- `setMealPhoto` also writes `photo_preview: null, photo_width: null`.
- **Verify, do not rebuild:** signed photo links are already reused for 50 minutes (family Task 8, audit P7). Add one test that a realtime reload returns the same `src` for an uploaded photo; if it fails, stop and tell the controller.

- [ ] **Step 1: Write the failing tests.**
```ts
expect(bestPhotoUrl('https://img.spoonacular.com/recipes/716429-312x231.jpg')).toBe('https://img.spoonacular.com/recipes/716429-636x393.jpg');
expect(bestPhotoUrl('https://img.spoonacular.com/recipes/716429-636x393.jpg')).toBe('https://img.spoonacular.com/recipes/716429-636x393.jpg');
expect(bestPhotoUrl('https://example.com/a-312x231.jpg')).toBe('https://example.com/a-312x231.jpg');
// photo-preview: build an 800×400 JPEG with sharp in the test
const out = await makePreview(jpeg); expect(out.width).toBe(800); expect(out.preview).toMatch(/^data:image\/webp;base64,/); expect(out.preview.length).toBeLessThan(2000);
await expect(makePreview(new Uint8Array([1, 2, 3]))).rejects.toThrow();
// import-url additions: fetchPublicBytes rejects a private address with 'blocked_host', a redirect to one with 'blocked_host', a text/html reply with 'not_image', a body over maxBytes with 'too_large'
// jsonld addition: image: [{ '@type': 'ImageObject', url: 'a.jpg', width: 400 }, { '@type': 'ImageObject', url: 'b.jpg', width: 1600 }] → image ends 'b.jpg'; a list of plain strings still returns the first
```
Route test, in the mocking style of `tests/unit/draft-route.test.ts`: 400 on `{}`; 404 when the meal has no photo; an uploaded photo is read with `storage.download` and `fetchPublicBytes` is not called; 422 and one `updateMeal` with `{ photo_width: 0 }` when `fetchPublicBytes` throws `ImportError('blocked_host')`; 200 and one `updateMeal` with `{ photo_preview, photo_width: 800 }` on success. `ensurePreviews`: 7 meals make 7 requests, never more than 3 at once; a second call makes none; a meal with `photo_width: 0` is skipped.
- [ ] **Step 2: Run** the four files. Expected: FAIL.
- [ ] **Step 3: Implement.** `npm i sharp@<the version already in node_modules>`. In `jsonld.ts` prefer the widest `ImageObject` that states a numeric `width`.
- [ ] **Step 4: Run** `npm run lint && npm run typecheck && npm test && npm run build`, then `scripts/e2e-local.sh e2e/week.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(photo): store a tiny preview and the source width per meal, pick the largest photo a source offers` (+ trailers).

---

### Task S8: Sheet that follows the finger

**Review: full** (motion; the pre-flight flagged it as the task most likely to pass tests and fail on a phone).

**Files:**
- Modify: `components/Sheet.tsx`
- Test: `e2e/sheet.spec.ts`, `tests/unit/motion.test.ts` (already covers `velocity`, `shouldDismiss`)

**Interfaces:**
- `<Sheet label onClose title?: string enter?: 'slide' | 'none'>` (still a modal `<dialog aria-label={label}>`, opened in `useLayoutEffect`). With `title`, the sheet renders a header row: the title in `font-display text-title` and an `IconButton` `X` labelled `Close` (so every sheet has a close button, audit C11). Callers that draw their own header (the dinner sheet) omit `title`.
- `useSheetClose(): () => void` (context): children call it so every close path plays the exit.

Design: `bg-raised text-ink shadow-2 rounded-t-lg`, `max-h-[90dvh]`, `pb-[var(--bk-safe-bottom)]`, `overscroll-behavior: contain`; backdrop `rgb(var(--bk-scrim) / 0.5)`. A 44 px tall drag zone on top holds a 36 × 4 px `line-strong` bar (`aria-hidden`), `touch-action: none`. Enter: `translateY(100%)` to 0, `--bk-dur-slow`, `ease-snap`; backdrop fades over `--bk-dur-base`. **Dragging:** pointer events on the drag zone; on the content area, **touch events** (`touchmove`, non-passive, `preventDefault` only when the content's `scrollTop` is 0 and the move is downward), because the browser cancels pointer events once it starts scrolling. The sheet's `transform` equals the finger's travel, 1:1, never above its resting place, no transition while held. Release: `shouldDismiss(drag, height, velocity)` plays the exit from where it is (`ease-snap`) then calls `onClose`; otherwise it returns with `ease-snap`. Escape is caught on the dialog's `cancel` event (`preventDefault`, then the exit); the dialog's `close` event calls `onClose` as a fallback (Chrome closes on a second Escape regardless). A backdrop tap and `useSheetClose()` play the same exit. The sheet takes taps from its first frame. Reduced motion: enter and exit are 120 ms opacity fades; dragging still works.

- [ ] **Step 1: Write the failing test** `e2e/sheet.spec.ts`. Open any sheet built on `Sheet` through `flows-b.ts` `openItemSheet(page)` (B owns what is inside it; this spec only uses the dialog, its drag zone and `Close`):
```ts
test('a short slow drag springs back', ...);      // down 60 px over 400 ms → dialog still visible, transform back to none
test('a drag past 30% dismisses', ...);           // down 40% of the sheet height, slowly → dialog count 0
test('a quick flick dismisses', ...);             // 80 px in 60 ms → dialog count 0
test('a touch drag on the content dismisses (pixel-7 only)', ...); // CDP Input.dispatchTouchEvent on the content area, scrollTop 0
test('a touch drag on scrolled content scrolls and does not move the sheet', ...);
test('Escape, a second Escape and the backdrop all close it once', ...); // onClose effect observed exactly once
test('with reduced motion the sheet fades and never translates', ...);   // context reducedMotion: 'reduce'
test('Close works during the enter animation', ...);                     // dispatch a click 50 ms after opening
```
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/sheet.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `scripts/e2e-local.sh e2e/sheet.spec.ts e2e/list.spec.ts e2e/week.spec.ts e2e/swap.spec.ts`. Expected: PASS. **Controller:** try the drag on one real iPhone before A4; record the result in the ledger.
- [ ] **Step 5: Commit** `feat(sheet): follows the finger, flicks away, same exit on every close` (+ trailers).

---

### Task S9: Budget sentence and the rolling total (signature 3)

**Review: full** (motion; the number the family budgets by).

Built here because the week (A2), the list (B1) and the cart review (B4) all show it.

**Files:**
- Create: `components/BudgetSentence.tsx`, `components/RollingNumber.tsx`
- Modify: `lib/domain/budget.ts`
- Test: `tests/unit/budget.test.ts`, `tests/unit/rolling-number.test.tsx` (jsdom)

**Interfaces:**
- `budgetSentence(totalCents: number, targetCents: number, cushionCents: number, opts: { exact: boolean }): { state: 'under' | 'wiggle' | 'past'; lead: string; total: string; of: string; note: string; noteAmount: string | null; caveat: string | null }` (`budgetState` stays). `total` is `formatMoney(totalCents)` (always cents); the target and the note amounts drop `.00`. `lead` is `This week’s total: ` when `exact` (a store is chosen, the total is whole packages), else `In the basket so far: `; in `wiggle` and `past` it is empty. `caveat` is `Estimated total, for the amounts you’ll use` when not `exact`, else null.
- `<RollingNumber value: string direction: 'up' | 'down' testId?: string />`: a visually hidden `<span aria-live="polite" data-testid={testId}>` holding `value`, updated once; beside it an `aria-hidden` row of characters from `rollDigits(prev, value)`. A character with `from` is a `.bk-roll` column in which the old digit leaves and the new one arrives by `translateY` (upward for `'up'`), `transition-delay: {delayMs}ms`. Tabular figures. Reduced motion: the row crossfades over 120 ms. The first render never rolls.
- `<BudgetSentence totalCents targetCents cushionCents exact totalTestId?: string />`: `<section aria-label="Budget">`, `text-small`, `.bk-price`; `lead`, then the total through `RollingNumber` in bold, then `of`; `note` in `ink-soft` on its own line, keyed by its text with `.bk-fade-in` delayed 120 ms; in `past` the `noteAmount` is `text-sale`; `caveat` in `text-label text-ink-soft`. No bar, pill, card, meter, link or red.

- [ ] **Step 1: Write the failing tests.**
```ts
expect(budgetSentence(16800, 20000, 2500, { exact: false })).toEqual({ state: 'under', lead: 'In the basket so far: ', total: '$168.00', of: ' of $200', note: '$32 left, plus $25 wiggle room if you need it.', noteAmount: null, caveat: 'Estimated total, for the amounts you’ll use' });
expect(budgetSentence(16743, 20000, 0, { exact: true })).toMatchObject({ lead: 'This week’s total: ', total: '$167.43', note: '$32.57 left.', caveat: null });
expect(budgetSentence(21200, 20000, 2500, { exact: true })).toMatchObject({ state: 'wiggle', lead: '', total: '$212.00', of: ' of $200.', note: '$12 into the wiggle room.' });
expect(budgetSentence(23600, 20000, 2500, { exact: true })).toMatchObject({ state: 'past', of: ' of $200.', note: '$11 past the wiggle room.', noteAmount: '$11' });
expect(budgetSentence(20000, 20000, 2500, { exact: true }).state).toBe('under'); expect(budgetSentence(22500, 20000, 2500, { exact: true }).state).toBe('wiggle');
expect(budgetSentence(123456, 1000000, 0, { exact: true })).toMatchObject({ total: '$1,234.56', of: ' of $10,000' });
```
`rolling-number.test.tsx`: the live span's text is exactly the value and changes once per update; `$168.00` → `$172.00` gives two rolling columns; `$98.50` → `$104.50` adds a leading column; under a mocked reduced-motion `matchMedia` there are no columns; the first render has none.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run lint && npm run typecheck && npm test && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(budget): the budget as a sentence, and a total that rolls to its new number` (+ trailers).

---

### Task S10: Proof tooling

**Review: batched.** Runs while Stream A builds the week.

**Files:**
- Create: `playwright.proof.config.ts` (`testDir: './proof'`, projects `iphone-17` and `pixel-7` with **two workers, so WebKit and Chromium run at the same time**, `video: 'on'` for the motion spec), `proof/shoot.spec.ts`, `proof/record.spec.ts`, `proof/measure.spec.ts`, `proof/page.ts`, `proof/README.md`, `docs/design/before/{iphone-17,pixel-7}/*.png` (copied from `/home/claude/basket-redesign/current/`)
- Modify: `package.json` (devDependency `ffmpeg-static`; script `"proof": "scripts/e2e-local.sh --config=playwright.proof.config.ts"`), `.gitignore` (`/proof-out/`)

The proof specs import `e2e/helpers` and `e2e/screens` (no second copy of sign-in, seeding, look or insets).

- `shoot.spec.ts`: for each registry screen and each named state, in each look, with that phone's insets (62 / 34 for iPhone 17, 28 / 24 for Pixel 7), saves `proof-out/after/{screen}-{device}-{look}.png` (viewport and full page). States: `week`, `week-empty`, `week-over-budget`, `week-long-names`, `week-loading`, `week-error`, `week-verdict-card`, `week-allergy`, `add-meal`, `search`, `search-fits`, `search-flags`, `recipe`, `recipe-allergy`, `favorites`, `favorites-empty`, `list`, `list-products`, `list-offline`, `list-stale`, `list-empty`, `swap`, `review`, `review-sent`, `household`, `person-editor`, `household-stores`, `onboarding`, `login`, `login-code`, `invite`, plus every screen in `later.ts`. A state whose screen is still `contrastPending` is skipped with a printed note.
- `record.spec.ts`: one clip each for: week open reveal, a meal settling, photo into the dinner sheet and back, sheet drag and flick, the budget total rolling, a list item's strike and move, and the same six under reduced motion. After the run, `proof/page.ts` converts each `.webm` with `ffmpeg-static` to `proof-out/motion/{name}.mp4` and a quarter-speed `{name}-slow.mp4`. A clip whose screen is not built yet is skipped with a note.
- `measure.spec.ts`, for every screen in both looks: (1) every visible element's computed margin, padding and gap is in {0, 2, 4, 8, 12, 16, 24, 32, 48, 64} or one of the two tile exceptions (10, 6), else it is listed. **Exempt:** padding that comes from `--bk-safe-*`, `auto` margins (their computed value is leftover space), `.bk-packshot > img` (12% inset), negative margins of 4 (the chevron hang), and anything inside `[data-on-photo]` scrim padding of 48. (2) the left edge of every direct child of a `.bk-gutter` block equals the gutter; (3) font sizes are only 12, 14, 16, 18, 24, 34 (and 54 on `.bk-fallback-letter`); (4) text contrast through `textPairs` and `contrastRatio`; (5) saves 200% crops (`deviceScaleFactor` doubled, the screen cut into four) to `proof-out/zoom/`. Fails when 1–4 find anything.
- `page.ts`: writes `proof-out/index.html`, one section per screen: before (from `docs/design/before/`, light only, because the old app had no dark mode; screens added since have no "before") beside after in light and dark, iPhone 17 above Pixel 7, then the clips. Styled with the tokens.

- [ ] **Step 1: Write the config, the three specs, `page.ts` and the README.**
- [ ] **Step 2: Run** `npm run proof -- proof/shoot.spec.ts -g login` to prove the tooling end to end on a screen that needs no stream (it is skipped as pending; the run must still finish and write the page).
- [ ] **Step 3: Commit** `chore(proof): before/after shots in two browsers at once, motion clips, spacing and contrast measurements` (+ trailers).

---

### Task S11: Edges: manifest, icons, splash, status bar, page titles

**Review: full** (the status bar and launch screen are part of each look). Runs while Stream A builds the week.

**Files:**
- Create: `scripts/icons/splash.mjs`, `public/splash/*.png`, `app/icon.svg`
- Modify: `app/manifest.ts`, `app/favicon.ico` (regenerated from the Dipped icon), `app/layout.tsx`, `e2e/pwa.spec.ts`

**Decisions:**
- Icons: the owner chose the "Dipped" icon (butter over radicchio, the Gloock B flipping color where it crosses the line). `public/icons/` already holds it (checked byte for byte by the pre-flight); compare again against `/home/claude/basket-redesign/icons/final/` and copy only if they differ. Copy `final/icon.svg` to `app/icon.svg`; rebuild `favicon.ico` from it with `sharp`.
- Manifest: `theme_color` and `background_color` both `THEME_COLOR.light`, imported from `lib/look.ts`. (A manifest has one color, so the Android launch screen is Butter in both looks; the page's own `theme-color` then follows the look.)
- iPhone launch images: `splash.mjs` renders, from the letter path in `icon.svg`, the ground color with the plain B (one color, no split ground) centered at 192 px tall, for light and dark at 1206 × 2622, 1320 × 2868, 1179 × 2556, 1290 × 2796, 1170 × 2532. Link them through `metadata.appleWebApp = { capable: true, title: 'Basket', statusBarStyle: 'default', startupImage: [...] }`, each with its `device-width`, `device-height`, `-webkit-device-pixel-ratio: 3` and `prefers-color-scheme` media query.
- Page titles (audit C12): `metadata.title = { default: 'Basket', template: '%s · Basket' }` in `app/layout.tsx`. Each page file sets its own title in its screen task.
- `viewportFit: 'cover'` stays. The service worker files are not touched.

- [ ] **Step 1: Update `e2e/pwa.spec.ts`**: `theme_color` and `background_color` are `#F5E6A6`; `test('the page head carries ten launch images', …)`; decoding with `sharp`, the served `icon-512.png` has `#F5E6A6` at (16, 16) and `#4C1D3A` at (16, 496) (this already passes; it pins the icon).
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/pwa.spec.ts --project=pixel-7`. Expected: FAIL.
- [ ] **Step 3: Implement**, run `node scripts/icons/splash.mjs`, and open two of the PNGs to check them by eye.
- [ ] **Step 4: Run** `scripts/e2e-local.sh e2e/pwa.spec.ts e2e/look.spec.ts e2e/layout.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(edges): Butter manifest colors, the Dipped icon everywhere, launch images per look, page title template` (+ trailers).

---

## Stream A — planning screens

### Task A1: Family pieces: flags, allergy and dislike boxes, verdicts, meal facts

**Review: full** (allergy UI).

Restyle only. No wording, logic or order changes. These pieces appear on the week, the dinner sheet, search cards, the recipe page and Favorites, so they go first.

**Files:**
- Modify: `components/flags/{FlagLines,AllergyBox,DislikeBox,IngredientSwapSheet}.tsx`, `components/verdicts/{VerdictCard,VerdictSheet}.tsx`, `components/MealFacts.tsx`, `components/MealFactsSheet.tsx`, `tests/unit/{flag-lines,dislike-box}.test.ts` (only if they read a class), `e2e/screens/a.ts`, `e2e/family-flags.spec.ts`, `e2e/verdicts.spec.ts`, `e2e/meal-facts.spec.ts`, `tests/unit/design-legacy/a.txt`

**Decisions (Kinds table applies; these are the specifics):**
- `FlagLines`: the allergy line and the won't-eat line as in Kinds. `result-flag` and `result-made` stay. A new prop `onPhoto?: boolean` switches to `text-on-photo`. Lines wrap; no `truncate`, no `line-clamp`.
- `AllergyBox` (`data-testid="allergy-box"`): as in Kinds. The marked ingredient ("Sliced almonds · tree nut") is `text-error font-semibold` with the icon.
- `DislikeBox` (`data-testid="dislike-box"`): as in Kinds; `Leave them out` and `Swap them` are ghost buttons side by side, `Keep it as is` a `quietLink`. Done state with `Change` as a `quietLink`.
- `IngredientSwapSheet`: `Sheet title="Instead of {food}"`; the sub-line in `text-small text-ink-soft`; the ideas as `RadioRows` (detail is what it does to the list); `Or something else` is a `TextField`; `Swap for {person}` is the sheet's main action, `Back` a ghost.
- `VerdictCard` (`data-testid="verdict-card"`): a notice block. The question in `text-body`, the meal name in `font-semibold`; `Everyone liked it` and `Not everyone` are ghost buttons side by side (the week's main action is `Build shopping list`); `Skip` a `quietLink`. Saved state: one line with `Change`. Failed save: `ErrorBanner`. Offline: buttons disabled, the offline sentence as a `Banner`.
- `VerdictSheet`: `Sheet title={meal name}`; one row per person, the name left (`text-body`), a `Segmented` right with `Liked it`, `Didn’t like`, `Didn’t try` (accessible names unchanged); at 360 px the control drops under the name rather than shrinking; the running line (`4 of 5 liked it`) in `text-small text-ink-soft`, `aria-live="polite"`; `Save` is the sheet's main action.
- `MealFacts`: one line in `text-small text-ink-soft`, parts joined by ` · `, `Edit` or `Add` as a `quietLink`; the "getting" state is the same line with `Loading`. `MealFactsSheet`: `TextField` `Start to table` (numeric), method as `RadioRows`, `Can be made ahead` as a `Switch`, the "Also saved" note in `text-small text-ink-soft`, `Save` as the main action.
- Add registry screens to `a.ts` with `setup`: `week-allergy` (a household with an allergy, the fixture soup planned "anyway") and `search-flags`.

- [ ] **Step 1: Add e2e.** In `family-flags.spec.ts`: `test('an allergy line is never clipped, in either look, at 360 px', …)` (for each `result-flag` and the `allergy-box`: `scrollHeight <= clientHeight`, `scrollWidth <= clientWidth`, computed `-webkit-line-clamp` is `none`, `text-overflow` is not `ellipsis`; run with `setLook` light and dark and `setViewportSize({ width: 360, height: 800 })`); `test('the allergy box has an edge and an icon in both looks', …)` (border width at least 1 px, one `svg.lucide-triangle-alert` inside). Update strings this task makes curly.
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/family-flags.spec.ts e2e/verdicts.spec.ts e2e/meal-facts.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Remove the eight files from `a.txt`.
- [ ] **Step 4: Run** `npm test` (the scoped `allergy-wording.test.ts` must pass untouched), then the three specs plus `e2e/layout.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(family): flags, allergy and won’t-eat boxes, verdicts and meal facts in the new look` (+ trailers).

---

### Task A2: This week: tonight's hero, pinboard, budget sentence, every state

**Review: full** (the allergy mark on a planned dinner; contrast on a photo).

Read the mockup HTML first; its sizes are the spec. Motion comes in A3.

**Files:**
- Create: `components/MealTile.tsx`, `components/week/TonightHero.tsx`, `components/week/OpenDay.tsx`, `e2e/fixtures/food-wide.jpg` (800 × 400, made once with `sharp` from `e2e/fixtures/food.jpg`), `e2e/photo.spec.ts`
- Modify: `components/WeekScreen.tsx`, `components/useWeekData.ts`, `app/(app)/week/page.tsx` (`metadata.title = 'This week'`), `e2e/week.spec.ts`, `e2e/verdicts.spec.ts`, `e2e/family-flags.spec.ts`, `e2e/helpers/flows-a.ts`, `e2e/screens/a.ts`
- Delete: `components/DayRow.tsx`

**Interfaces:**
- Consumes `todayIn(timeZone, now?)` from `lib/domain/weeks.ts` (family Task 11 added it; do not add a second), `BudgetSentence`, `Photo`, `photoVerdict`, `FlagLines`, `VerdictCard`, `pinToday`.
- `<MealTile name photo preview? width? stamp?: string stampTone?: 'day' | 'tonight' note?: string lines?: React.ReactNode favorite?: boolean onOpen?: () => void trailing?: React.ReactNode imgRef? hint?: boolean />`: `surface`, `rounded-md`; `<Photo crop="tile">` with the top corners rounded; stamp at 6 px from the top-left (`bg-surface text-ink text-label bk-caps px-1 py-0.5 rounded-xs`; `tonight` tone is `text-accent`); caption padding 8 / 10: name `text-small font-semibold line-clamp-2 break-words`, `note` in `text-label text-ink-soft line-clamp-1`, then `lines` (flag lines; **never clamped**), a `Bookmark` `<Icon size={18} label="Favorite">` in `text-ink` when `favorite`, then `trailing`. With `onOpen` the whole tile is one `<button className="bk-press">` whose accessible name is what the row's name is today.
- `<TonightHero … onOpen onDemote imgRef />` and `<OpenDay day slot tonight?: boolean wide?: boolean />`.

Layout rules (decisions):
- Header: `ScreenHeader title="This week"`; action is a ghost button, `History` icon, `aria-label="Repeat last week"` (audit C5: the code copies only last week; update the e2e name), visible text `Repeat`.
- Tonight is `todayIn(household.time_zone)`. If tonight has a dinner with a photo and `photoVerdict('hero', photo_width)` is `'ok'`: the hero, full-bleed, directly under the header. It is a `<button>` inside `<div data-testid="day-row-{day}" data-tonight>`: `<Photo crop="hero" priority>`; over it (`data-on-photo`) a scrim `linear-gradient(rgb(var(--bk-scrim) / 0), rgb(var(--bk-scrim) / 0.8) 42%, rgb(var(--bk-scrim) / 0.92))` with padding 48 16 12; `Tonight · {dayName}` in `text-label bk-caps text-on-photo-accent`; the name in `font-display text-title text-on-photo line-clamp-2`; then `FlagLines onPhoto` (an allergy kept "anyway" shows here in full); then one row in `text-label text-on-photo`: the day note left, `Photo: {credit}` right. A saved favorite shows the `Bookmark` top-right in `text-on-photo`.
- **No jump:** when `photo_width` is null the tile is laid out as a tile first and promoted to hero only once the width is known; on load `WeekScreen` writes `img.naturalWidth` back with `updateMeal` so this happens once ever, and remembers demoted meal ids for the session.
- If the photo demotes, is a fallback, or is missing: tonight is an ordinary `MealTile` placed first in the pinboard with stamp `Tonight`, tone `tonight`.
- If tonight has no dinner: `<OpenDay tonight wide>` first, spanning both columns, 52 px, stamp `Tonight · {Sun}` in `text-accent`.
- Under the hero: one row, `text-small`: `<span data-testid="week-range">` (text exactly `formatWeekRange(…)`), then ` · feeds about {n}` in `ink-soft` (was "{n} servings each", which read as per person, audit C3; keep the number); right, a `quietLink` to `/household`, `Who’s eating` with `ChevronRight` 18 hanging 4 px into the gutter (`-mr-1`).
- `VerdictCard` sits between that row and the pinboard, when there is a dinner to ask about.
- Pinboard: `<section aria-label="Dinners">`, a two-column **CSS grid** in week order (so keyboard and screen-reader order is the week's order), gap 8, `align-items: start`. Each cell is `<div data-testid="day-row-{day}" data-flip-key={day}>` holding a `MealTile` (stamp `Mon`…, `lines` from `FlagLines`) or an `OpenDay`.
- `OpenDay`: a `Link` to `/week/add?day=&slot=`, 48 px, `rounded-md`, `border-[1.5px] border-dashed border-line-strong`, stamp left in `ink-soft`, `Plus` 18 and `Add dinner` right in `text-small font-semibold`.
- Bottom bar (`barAboveNav`): `BudgetSentence exact={!!household.kroger_location_id}`, then `Build shopping list` as `mainAction` link to `/list`. `BudgetMeter` is no longer used here (B1 deletes the file).
- Loading: `SkeletonTile crop="hero"` and four `SkeletonTile crop="tile"`, plus `Loading label="Loading this week"`. Error: `ErrorBanner message="Couldn’t load this week." actionLabel="Try again"`. Repeat sheet: `Sheet title="Repeat last week"`, restyled with `Button`.
- Phase b–h blocks in this file (busy-night marks, leftovers nights, "Plan my week", breakfast and lunch rows, use-it-up and sales entries): by Kinds. Defaults when a phase's design says nothing: a busy night adds the word after the day stamp in `text-label text-ink-soft`; a leftovers night is a `MealTile` with the source dinner's photo and the note `Leftovers from {day}`; breakfast and lunch are hairline rows in a section under the pinboard, not photo tiles.

- [ ] **Step 1: Update and add e2e.** `week.spec.ts` (with `pinToday(page, 'wed')` in `beforeEach`, a day no test plans): replace the `On budget` and `meter` assertions with `region "Budget"` containing `$0.00 of $200` and `$200 left`; the moved-in budget words from S5 become `into the wiggle room` and `past the wiggle room`; `flows-a.ts` `weekBudget` reads the new region. New tests:
```ts
test('tonight with a wide photo leads as the hero', ...);   // pinToday to the dinner's day; [data-tonight] contains "Tonight", is full width, width / height is 2 (±0.02)
test('tonight with a small photo is a tile marked Tonight, never a hero', ...);
test('a photo of unknown width never shows as a hero and then collapses', ...); // no layout shift: record the tile's box before and after load
test('no dinner tonight shows the wide Add dinner row first', ...);
test('long names and big numbers fit at 360 px', ...);       // setViewportSize 360; an 80-character word; budget $10,000 and a $1,234.56 total; no horizontal scroll, tile name at most 2 lines, the budget total on one line
test('a dinner added despite an allergy keeps its warning on the tile and on the hero', ...); // family-flags.spec
test('the pinboard reads in week order', ...);               // DOM order of day-row-* equals the week
```
`e2e/photo.spec.ts` (against a planned dinner's tile): a photo that 404s shows `Add a photo` and no `img` in that tile; a photo held open by `page.route` keeps `data-photo-state="loading"` and the tile's box height equals a loaded tile's; fulfilling it flips to `ready` and the `img` opacity reaches 1.
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/week.spec.ts e2e/photo.spec.ts e2e/verdicts.spec.ts e2e/family-flags.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove `WeekScreen.tsx` and `DayRow.tsx` from `a.txt`; drop `contrastPending` from `week` in `a.ts`.
- [ ] **Step 4: Run** `npm test`, then those specs plus `e2e/layout.spec.ts e2e/a11y.spec.ts e2e/find-my-dish.spec.ts`. Expected: PASS on all projects.
- [ ] **Step 5: Commit** `feat(week): tonight’s dinner as the hero, two-column pinboard, budget as a sentence` (+ trailers).

---

### Task A3: This week in motion, and the dinner sheet as a recipe page

**Review: full** (motion and reduced motion; allergy and dislike boxes inside the sheet).

**Files:**
- Modify: `components/WeekScreen.tsx`, `components/MealSheet.tsx`, `components/add-meal/AddMealScreen.tsx` (one line: `markSettle(day)` before `router.push('/week')`), `components/FavoritesScreen.tsx` (same after a successful add)
- Test: `e2e/motion-week.spec.ts`

**Behavior (decisions):**
- **Open reveal.** The first time week data arrives in a page session (a module-level flag), the hero gets `bk-reveal` with `--i: 0` and each pinboard item `--i: 1…` in week order. Never again in that session: not on realtime reloads, not on returning from Add a meal or a sheet, not on scroll.
- **A meal settles (signature 1).** When data arrives and `takeSettle()` names a day that is now filled, or `newlyFilled(prev, next)` reports one (the other phone added it), that tile gets `bk-settle` for 560 ms. For the local add only, `tick()` fires 150 ms in. Other tiles move through `useFlipList(boardRef, signature)` where `signature` joins `day:mealId` pairs.
- **The total rolls (signature 3).** Already in `BudgetSentence`; this task only checks it on the week.
- **Dinner sheet reads like a recipe page.** `MealSheet` inside `Sheet` (no `title`; it draws its own header). Order, fixed by the family plan and kept: `<Photo crop="hero">` edge to edge at the top (top corners `rounded-lg`; **when the photo demotes, `crop="tile"` inside the gutter with `rounded-lg`**), an `IconButton` `X` labelled `Close` over its top-right on `rgb(var(--bk-scrim) / 0.6)` in `text-on-photo`; then, in the gutter: the full name in `font-display text-title` (no clamp), `Photo: {credit}` in `text-label text-ink-soft`; the day note in `text-small`; `AllergyBox`; `DislikeBox`es; `MealFacts`; the `Last time: …` line with `Change`; `Open the full recipe` as a `quietLink` with a chevron; heading `Ingredients` (`text-heading`) with `Scaled to {servingsText(n)}`, and the scaled lines from `scaleMeal` **called with the meal's `servings_override` and `personChanges`**, name left and `<Qty>` right in `.bk-price`, split by `line` hairlines; then the existing controls, restyled: the leftovers control as it stands after phase b (a `Stepper` if it is still a count, with labels `Fewer leftovers`, `More leftovers`); ghost buttons `Change photo`, `Save as a favorite` / `Remove from favorites` (with `Bookmark`), and `Take off {day}` in `text-error`; errors as `ErrorBanner`. All existing labels stay.
- **Photo grows into the sheet and back.** Opening: `morph({ from: tileImg, to: () => sheetImg, update: () => flushSync(() => setOpenDay(day)) })` and the sheet renders with `enter="none"` when `supportsViewTransitions()` and motion is not reduced; otherwise the sheet slides as in S8. Closing reverses it. The tile, the hero and the sheet's Close take taps from their first frame.

- [ ] **Step 1: Write the failing test** `e2e/motion-week.spec.ts`. Use `page.clock` and step it (`runFor(300)`); assert order from a `MutationObserver` log installed with `addInitScript`, never from elapsed wall time:
```ts
test('the week reveals once on open and not again after a sheet', ...);       // items carry bk-reveal with --i 0,1,2…; open and close a sheet; no new animation named bk-reveal
test('a tap during the reveal opens the dinner', ...);
test('a tap on Close 50 ms after a tile tap closes the sheet', ...);           // dispatch the click; the dialog is gone (view transitions must not swallow it)
test('adding a dinner settles its tile', ...);                                 // the log shows bk-settle added to day-row-fri, then removed after runFor(600)
test('the week total rolls when a dinner is added', ...);
test('reduced motion: 120 ms fades, no travel', ...);                          // computed animation-duration 0.12s; --bk-move is 0
test('without view transitions a tile still opens and closes', ...);           // addInitScript deletes Document.prototype.startViewTransition
test('the dinner sheet lists ingredients scaled for the household', ...);      // the "Scaled to" line and at least one row
test('with leftovers set, the sheet scales to the override', ...);
test('a small photo is a tile in the sheet, not a stretched hero', ...);
```
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/motion-week.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove `components/MealSheet.tsx` from `a.txt`.
- [ ] **Step 4: Run** `scripts/e2e-local.sh e2e/motion-week.spec.ts e2e/week.spec.ts e2e/sheet.spec.ts e2e/find-my-dish.spec.ts e2e/family-flags.spec.ts e2e/meal-facts.spec.ts e2e/verdicts.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(week): staggered open, a meal settles into its day, photo grows into the dinner sheet` (+ trailers).

---

### Task A4: The week shown to the owner (checkpoint)

**Review: full.** Runs on `premium-pass` after `premium-a` (A1–A3), S10 and S11 are merged.

- [ ] **Step 1: Run** `scripts/e2e-local.sh` (the whole suite). Expected: PASS.
- [ ] **Step 2: Run** `npm run proof -- -g "week"`. Expected: files under `proof-out/`; `measure.spec.ts` passes for the week states.
- [ ] **Step 3: Look at every 200% crop** in `proof-out/zoom/` for the week, both looks, both phones. Fix any misalignment or uneven gap (in Stream A's files; anything in a shared file goes to the controller), re-run, and list what you fixed in the commit message.
- [ ] **Step 4: Remove one decorative thing** from the week screen and name it in the commit message (candidates: the hairline above the budget sentence, the favorite bookmark on the hero).
- [ ] **Step 5: Commit** `chore(week): alignment fixes from the 200% review; one decoration removed` (+ trailers).
- [ ] **Step 6: STOP. Hand `proof-out/index.html` to the controller for the owner**, in light and dark, with before and after, the clips of the reveal, the settle, the photo growth, the sheet drag and the rolling total, and these notes: the dinner sheet now lists scaled ingredients (new on that sheet); the cost sort was dropped; older Spoonacular photos are too small to be the hero unless the controller rewrites their stored links to the 636 px size (F28c, offered). **Do not begin A5 or any Stream B task until the controller says so** (the owner's reply, or 30 minutes with no objection).

---

### Task A5: Add a meal: search, sort, Find my dish, paste, favorites tab

**Review: batched.** (The flag components were reviewed in A1; this task places them and has a test that they are never clipped.)

**Files:**
- Modify: `components/add-meal/AddMealScreen.tsx`, `SearchTab.tsx`, `SortControl.tsx`, `FindMyDish.tsx`, `PasteTab.tsx`, `api.ts` (copy only), `app/(app)/week/add/page.tsx` (`metadata.title = 'Add a dinner'`), `e2e/week.spec.ts`, `e2e/find-my-dish.spec.ts`, `e2e/fits-this-week.spec.ts`, `e2e/family-flags.spec.ts`, `e2e/helpers/flows-a.ts`, `e2e/screens/a.ts`

**Decisions:**
- Header: `ScreenHeader title="{Thursday} dinner"` with `back={{ href: '/week', label: 'Close' }}` drawn as `X`.
- One level of tabs: `<Tabs label="How to add">` with `Search`, `Paste`, `Favorites` and one tab panel. `SearchTab` stays mounted when another tab shows (audit P10, already done; keep it).
- **Where to look** leaves the screen. Under the search field, a `quietLink` button reads `Looking on: Big sites` (or `Spoonacular`) with a chevron and opens `Sheet title="Where to look"` holding `RadioRows label="Where to look"` (`Big sites`: `Recipe sites we trust`; `Spoonacular`: `A recipe database`); choosing closes the sheet. e2e: `addFromSearch` and every test that picks a source first click `getByRole('button', { name: /Looking on/ })`.
- **Order results by** stays on the screen: `SortControl` renders `<Segmented label="Order results by">` with `Most loved` and `Fits this week`, above the results, shown once there are results. Its session memory is untouched. `fits-empty` hints are `text-small text-ink-soft`, with their final periods (audit C6).
- Search field: label `What’s for dinner?` (`TextField`, `Search` icon inside). Buttons: `Search` (`ghostButton`; the screen's filled main action is `Add to {day}`, which appears with a recipe) and `Find my dish` (`ghostButton`, `Camera` icon).
- Results: a two-column grid, gap 8, `align-items: start`, of `button[data-testid="result-card"]` with the same `aria-label` as today. Each is tile-shaped: `<Photo crop="tile" hint={false}>`; `result-title` (`text-small font-semibold line-clamp-2`); `result-site` (`text-label text-ink-soft`); `result-loved` (`Most loved`, `text-label font-semibold text-ink`, its own line); `result-meta` (★ / ♥ line with minutes, `text-label text-ink-soft`, wraps rather than truncates); `result-shares` (the fits line, `text-label text-ink`); then `result-made` and `FlagLines` (at most three extra lines, as the family plan rules; an allergy line is always among them and never clamped). Each card image carries `data-option-url` (A6 uses it).
- Searching: the `ul[aria-label="Searching"]` holds six `SkeletonTile`s and a `Loading`. Notes are `text-small text-ink-soft`. Errors are `ErrorBanner` with a retry button; the empty result says the source it actually searched (audit C6: no "our sites" under Spoonacular). Spend-guard answers (`cap`, `slow`, `busy`) keep their strings, as `Banner`. The Spoonacular credit link is a `quietLink`.
- `DishCard`: a 1:1 `rounded-sm` thumb of the person's photo, text beside it; its states keep their strings (curly).
- Paste: `TextAreaField` (min height 128), button unchanged in name; `Type it myself` is a `quietLink` button under it.
- Favorites tab: `FavoritesBrowser` as it stands (restyled in A7), with no empty-state action.
- Empty search (nothing typed yet): one sentence, `Search for a dinner, paste a recipe, or pick a favorite.`

- [ ] **Step 1: Update e2e** for the curly label, the source sheet, and any message this task makes curly. Add: `test('results are photo tiles in two columns', …)` (two `result-card`s share a top edge; each photo box is 8:5 ±0.02); `test('one tab row, one sort control', …)` (`tablist` count 1; exactly one visible `radiogroup`, named `Order results by`, until the source sheet opens); `test('a card with an allergy shows the whole warning at 360 px in both looks', …)`; `test('the rating line is not clipped at 360 px', …)` (keeps the ratings patch's guarantee in the new layout).
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/week.spec.ts e2e/find-my-dish.spec.ts e2e/fits-this-week.spec.ts e2e/family-flags.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `a.txt`; drop `contrastPending` from `add-meal` and `search-flags`.
- [ ] **Step 4: Run** those specs plus `e2e/layout.spec.ts e2e/a11y.spec.ts e2e/meal-facts.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(add-meal): photo-led results, one row of tabs, source choice in a sheet` (+ trailers).

---

### Task A6: The recipe page, the allergy gate, and the photo growing into it

**Review: full** (allergy gate; motion).

**Files:**
- Create: `components/add-meal/RecipePage.tsx` (replaces `DraftPreview.tsx`; keep the exports `draftAsMeal` and anything else imported from it)
- Modify: `components/add-meal/AddMealScreen.tsx`, `IngredientEditor.tsx`, `SearchTab.tsx` (pass the tapped card's `<img>`), `e2e/week.spec.ts`, `e2e/find-my-dish.spec.ts`, `e2e/family-flags.spec.ts`, `e2e/meal-facts.spec.ts`, `e2e/motion-week.spec.ts`
- Delete: `components/add-meal/DraftPreview.tsx`

**Interfaces:**
- `<RecipePage … />` takes every prop `DraftPreview` has when this task starts (including `people`, `startEditing`, the person-change callbacks), plus `pending: RecipeOption | null`, `saveFavorite: boolean`, `onSaveFavorite: (v: boolean) => void`, `heroRef`.
- `SearchTab`'s `onPick(option: RecipeOption, img: HTMLImageElement | null)`.

**Decisions:**
- Tapping a result opens the recipe page at once: `AddMealScreen` sets `pending` and calls `morph({ from: cardImg, to: () => heroRef.current, update: () => flushSync(() => setPending(option)) })`, then loads the draft. While it loads the page shows the option's photo and title, `SkeletonLines` where the ingredients go, and `Reading the recipe…` (`role="status"`). The bottom bar is disabled until the draft **and the people** have arrived (an allergy warning never depends on a request that can fail quietly; keep the family plan's retry). A failure shows `ErrorBanner` with the existing message and returns to the results.
- The page, top to bottom, inside `<section aria-label="Draft recipe">`: `<Photo crop="hero" priority>` full-bleed (when the photo demotes: `crop="tile"` inside the gutter with `rounded-lg`); name in `font-display text-title`; `MealFacts` (no Edit here); one row with `Your photo` or `Photo: {credit}` (`text-label text-ink-soft`) and ghost `Change photo`; `Check` `Use my photo for this meal` when offered; `quietLink` `Open the full recipe`; the vegetarian swap as a sentence between hairlines with a `Leaf` icon (`Mom’s portion: black beans`, then `Chicken cut to 4 people` in `text-small text-ink-soft`), no tinted box; `AllergyBox`; `DislikeBox`es; `Ingredients` (`text-heading`) with `Scaled to {servingsText(n)}`; lines with `line` hairlines, name left, `<Qty>` right in `.bk-price`, an allergen line marked as in A1; `quietLink` button `Edit ingredients`; `Check` `Save as a favorite`. Ghost `Not this one` sits in the header row and runs the reverse `morph` back to the card, found again with `[data-option-url="…"]` after the results remount.
- **Bottom bar (`barBottom`).** No allergy match: `Add to {day}` as `mainAction`; while saving it keeps its width and reads `Adding…`. **With an allergy match: `Pick a different dinner` is the `mainAction`, and `Add to {day} anyway` is a ghost button under it** (owner decision Q1; the order and the words do not change).
- `IngredientEditor`: `TextField`s (`Name`, `Amount`, `Unit`, `Type` keep their labels; `Type` is a `SelectField` using `ROLE_LABELS` from `lib/list/groups.ts`, audit C8), remove as `IconButton` `X`, rows split by hairlines, field errors under the fields, `for {servingsText(n)}`.
- Paste, Type-it-myself and Find-my-dish drafts arrive with `.bk-fade-in` (no source photo to grow from).

- [ ] **Step 1: Update e2e** for curly strings, and add to `e2e/motion-week.spec.ts`: `test('a picked result shows its photo and title before the draft arrives', …)` (delay `/api/meals/draft` with `page.route`; the `Draft recipe` region shows the option's `img` src and title and the main action is disabled; after, enabled); `test('Not this one returns to the results', …)`. Add to `family-flags.spec.ts`: `test('with an allergy the filled button is Pick a different dinner, in both looks', …)` (its background is the accent token; `Add to Thursday anyway` is not) and `test('the gate holds while people are still loading', …)`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `a.txt`.
- [ ] **Step 4: Run** `scripts/e2e-local.sh e2e/week.spec.ts e2e/find-my-dish.spec.ts e2e/family-flags.spec.ts e2e/meal-facts.spec.ts e2e/motion-week.spec.ts e2e/layout.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(recipe): the draft reads like a recipe page; its photo grows from the card and back` (+ trailers).

---

### Task A7: Favorites

**Review: batched.**

**Files:**
- Modify: `components/FavoritesScreen.tsx`, `components/FavoritesBrowser.tsx`, `app/(app)/favorites/page.tsx` (`metadata.title = 'Favorites'`), `e2e/week.spec.ts` (favorites tests), `e2e/verdicts.spec.ts`, `e2e/family-flags.spec.ts`, `e2e/screens/a.ts`
- Delete: `components/MealThumb.tsx` (if nothing imports it; else leave it on `a.txt` and tell the controller)

**Decisions:**
- `ScreenHeader title="Favorites"`. The add message becomes a `Toast` (same strings, curly; `tone="bad"` uses `text-error`).
- Search: `TextField hideLabel` with `Search` icon; label `Search favorites` stays, placeholder `Search meals or ingredients`.
- Filters (`role="group" aria-label="Filter"`): `aria-pressed` buttons, min 44 px, `rounded-md`, `text-small`; pressed is `bg-ink text-ground font-semibold`; others `ghostButton`. One row that scrolls sideways if it does not fit (no wrap, no scrollbar). The price chip keeps the audit's rule: saved prices only, `N not priced yet`.
- List: two-column grid, gap 8, `align-items: start`; each `li[data-testid="favorite-row"]` is a `MealTile` (not a button) with `photo`, `preview`, `width`; `note` is the verdict line from `mealLine` (`Everyone liked it · last had Nov 22`); under it the tag as words (`Vegetarian`, `Veg swap`) in `text-label text-ink-soft`; then `lines` = `FlagLines`; `trailing` is `IconButton` `Plus` with the existing `addLabel`. The order from `orderFavorites` is untouched; nothing marks a meal that sank to the bottom.
- States: loading is six `SkeletonTile`s with `Loading label="Loading favorites…"`; error `ErrorBanner message="Couldn’t load your favorites." actionLabel="Try again"` (retry reloads); none saved: `EmptyState sentence="Nothing saved yet. Meals you keep will wait here."` with `ButtonLink` `Find a dinner` to `/week`, passed in through a new prop `emptyAction?` that the Add-a-meal tab does not pass; no match: `No favorites match that.`

- [ ] **Step 1: Update e2e** strings, and add `test('favorites are photo tiles; an empty list offers Find a dinner', …)`, `test('the Favorites tab inside Add a meal has no Find a dinner link', …)`, `test('a favorite with an allergy shows the whole warning at 360 px', …)`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `a.txt`; drop `contrastPending` from `favorites`.
- [ ] **Step 4: Run** `scripts/e2e-local.sh e2e/week.spec.ts e2e/verdicts.spec.ts e2e/family-flags.spec.ts e2e/layout.spec.ts e2e/a11y.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(favorites): photo tiles, quiet filters, designed empty and error states` (+ trailers).

---

## Stream B — shopping and household

Starts after the owner checkpoint (A4).

### Task B1: Shopping list: product rows, store tabs, states, budget bar

**Review: full** (cart UI).

**Files:**
- Modify: `components/ListScreen.tsx`, `ListRow.tsx`, `StoreTabs.tsx`, `app/(app)/list/page.tsx` (`metadata.title = 'Shopping list'`), `e2e/list.spec.ts`, `e2e/fred-meyer-prices.spec.ts`, `e2e/swap.spec.ts`, `e2e/helpers/flows-b.ts`, `e2e/screens/b.ts`
- Delete: `components/BudgetMeter.tsx` (grep first; if a B4 or C1 file still imports it, leave it for that task)

**Decisions:**
- `ScreenHeader title="Shopping list"`, the item count as `action` in `text-small text-ink-soft`.
- `StoreTabs` renders `<Tabs label="Stores">`: label is the store name, detail `{$42.17} · {4}` (the accessible name still matches `/^Fred Meyer.*· 4$/`). The rows below are its tab panel.
- Status lines under the tabs, as `Banner`s, in this order when more than one applies: `OfflineStrip` (`offline` while `list.offline`; when it turns false, `saved` for 2 s only if the queue flushed with nothing left and nothing refused, else `back`); `Fred Meyer prices may be out of date.` (`role="status"`); with no store chosen, `Choose your Fred Meyer in Household to see real products and prices.` with `Household` as an underlined `ink` link.
- `Check off all (N)`: a ghost button above the groups, hidden when N is 0. Its `Checked off N items · Undo` becomes a `Toast` with `action` and `ms={8000}` and `testId="check-all-undo"`, so the list no longer shifts 44 px. Behaviour unchanged.
- **Row** (`li[data-testid="list-row"]`, `data-checked`, `data-flip-key={item.key}`, min height 52, a `line` hairline under it): `<Check label={"Got " + name}>`; then the open-sheet button: `<Packshot>` when the row has a product photo; name `text-small font-semibold line-clamp-2`; the amount in `text-label text-ink-soft` with `<Qty>` per part and the ` · always have` / ` · outside budget` words; the product line `{product name} · {sizeText}` in `text-label text-ink-soft line-clamp-1`; `Your usual isn’t on the shelf today` in `text-label text-ink`. Right column, `shrink-0 text-right whitespace-nowrap`: `row-total` in `.bk-price text-small font-semibold` (with `about ` when approximate), under it `row-count` (`1 package`, `2 × $1.25`, `2 lb`) in `text-label text-ink-soft`; the source word in `text-label`: `Fred Meyer price` in `text-price`, `estimate` in `text-estimate`, `your price` in `text-ink-soft`; on sale: `Tag` icon and `on sale` in `text-sale text-label` (was a `Sale` pill; update the e2e string).
- **No match:** the name, `No Fred Meyer match yet` in `text-label text-ink-soft`, price `—`, and a ghost `Find a product` as a sibling of the row button (it opens the Swap sheet).
- **Amazon and Costco rows without a typed price:** `Search Amazon` / `Search Costco` in the price column's place, a `quietLink` with `ExternalLink` 18, `target="_blank" rel="noopener noreferrer"`, a sibling of the row button, at least 44 px.
- **`Swap` moves off the row.** It becomes the first action in the item sheet (B3), with the same accessible name, `Swap {Food} product`. The row stays calm at 360 px (check, photo, name, price). `swap.spec.ts` opens the row first. This is a stated move of a control, not a removal; the controller shows it to the owner in the proof.
- Groups: aisle headings in `text-heading`, 24 above, 8 below. Ticked rows live in a last group headed `Got it · {n}` (`text-heading`), below the aisles and above `Skipped, you have them · {n}` (the `<details data-testid="skipped">` stays). The move is animated in B2; here it is immediate.
- Bar (`div[data-testid="list-bar"]`, `barAboveNav`): on the Fred Meyer tab in product mode with at least one line, `Review and send to Fred Meyer` as a `ButtonLink variant="main"`; then `<BudgetSentence exact={productMode} totalTestId="list-total">`; `{n} items without a price` in `text-label text-ink-soft`. The `list-total` element's text is the total alone (`$168.00`).
- States: loading `SkeletonLines` rows with `Loading`; `useWeekId` failed with nothing cached, or a load error: `ErrorBanner message="Couldn’t load your list." actionLabel="Try again"`; save failure `ErrorBanner message="Couldn’t save. Try again."`; nothing at all: `EmptyState sentence="Your list is clear."` with `ButtonLink` `Plan this week` to `/week`; nothing at this store: `Nothing to buy at {store} this week.`
- Money: rows, tab details and totals all go through `formatMoney` (always cents); delete this file's use of `formatPrice` and `formatDollars`.

- [ ] **Step 1: Update e2e.** `list.spec.ts`: `Offline. Showing your last list.`; the empty text `Your list is clear.`; tab totals with cents; the budget test expects, in `list-bar`, `into the wiggle room` at $201, `past the wiggle room` at $226, and `left` after dropping back; rename it `budget: the sentence changes at $201 and $226`; with no store chosen the caveat `Estimated total, for the amounts you’ll use` shows, and in product mode it does not. `fred-meyer-prices.spec.ts`: the product photo sits in an element with class `bk-packshot`; sale text is `on sale`; the sum-of-rows check still holds (`flows-b.ts` `listTotal`). Add:
```ts
test('a ticked item moves to Got it', ...);                    // row ends inside the group headed /^Got it · 1$/
test('prices stay on one line beside a four-line product name at 360 px', ...); // setViewportSize 360
test('back online says Saved only when the queue emptied', ...); // step page.clock; "Back online. Saved." appears then goes; with a refused write it reads "Back online."
test('the stale-prices line and the offline line can show together', ...);
test('Check off all shows Undo without moving the list', ...);  // first row's top is the same before and after
test('an Amazon row with no price links to the store search', ...);
```
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/list.spec.ts e2e/fred-meyer-prices.spec.ts e2e/swap.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Route every close of the item sheet through `useSheetClose` (four callbacks unmount it directly today). Remove the files from `b.txt`; drop `contrastPending` from `list`.
- [ ] **Step 4: Run** those specs plus `e2e/layout.spec.ts e2e/a11y.spec.ts e2e/sheet.spec.ts`. Expected: PASS, including the offline tests.
- [ ] **Step 5: Commit** `feat(list): rows that read at a glance, packshot tiles, calm status lines, budget sentence bar` (+ trailers).

---

### Task B2: Shopping list in motion: the strike and the move (signature 2)

**Review: full** (motion against live, offline and queued state).

**Files:**
- Modify: `components/ListRow.tsx`, `components/ListScreen.tsx`
- Test: `e2e/motion-list.spec.ts`

**Timeline for a tick (design-values, Signature 2):**
- 0 ms: tap; the check presses; `tick()`.
- 0–120 ms: the check mark draws (`Check`).
- 60–300 ms: a 1.5 px `ink-soft` line wipes left to right across the name, as wide as the text: the name sits in a `relative inline-block max-w-full` span; over it an `aria-hidden` copy of the same text with class `bk-strike`, toggled by `data-on` (S3's CSS; a transition, so it reverses). The name's color eases to `ink-soft`.
- 300–670 ms: the row joins `Got it`. `ListScreen` keeps `settled: Set<string>`, **starting equal to `checked` on first load** (so nothing slides on open), that follows `checked` 300 ms later (0 under reduced motion); groups are built from `settled`; `useFlipList(listRef, signature)` slides the row down and its neighbors up with `ease-snap`.
- A second tap inside the 300 ms cancels the pending move; the transitions run back from where they are. `data-checked` always reflects the latest tap at once. Once a row has moved groups it is remounted, so a later untick moves it back without replaying the strike in reverse; that is accepted.
- `Check off all` moves its rows together after one 300 ms wait, not one by one.
- Nothing here touches `useWeekList`, the queue or the single-flight load.

- [ ] **Step 1: Write the failing tests** in `e2e/motion-list.spec.ts` (`page.clock`, a `MutationObserver` log; no wall-clock windows):
```ts
test('ticking draws the strike, then the row moves to Got it', ...);     // log order: data-on set, then the row's parent changes after runFor(300)
test('tick then untick inside 300 ms leaves the row in its aisle, unticked', ...);
test('three fast taps end ticked and in Got it', ...);
test('ticked rows do not slide when the list opens', ...);               // no WAAPI animation on first paint
test('the total rolls only the digits that changed', ...);               // set a price so the total changes by $4: list-total text is exactly the new total; two .bk-roll columns moved
test('a total that gains a digit keeps the bar on one line', ...);
test('reduced motion: no transforms on the list; the total crossfades', ...);
test('a tick made offline strikes, moves and is still ticked after coming back', ...);
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `scripts/e2e-local.sh e2e/motion-list.spec.ts e2e/list.spec.ts e2e/swap.spec.ts` on all projects. Expected: PASS (the realtime and offline list tests are the ones to watch).
- [ ] **Step 5: Commit** `feat(list): the strike draws as the item eases down` (+ trailers).

---

### Task B3: Item sheet and product Swap sheet

**Review: full** (cart UI).

**Files:**
- Modify: `components/ListSheet.tsx`, `components/SwapSheet.tsx`, `e2e/swap.spec.ts`, `e2e/list.spec.ts`, `e2e/helpers/flows-b.ts`, `e2e/screens/b.ts`

**Decisions:**
- `ListSheet`: `Sheet title={name}` (so it has a Close button, audit C11); the amount and store in `text-small text-ink-soft`; the chosen product with a `Packshot size={64}`, its name, size and package line; actions as 48 px rows split by hairlines with a chevron, first `Swap` (accessible name `Swap {Food} product`, shown when the row has a match; `Find a product` when it has none), then the existing ones with their names (`I have it` / `I need it`, `Move to Amazon`, `Leave out of budget`, …). "Set price" stays hidden for an item with a pick, as the cart plan rules. The price form uses `TextField` (`Price`, `inputMode="decimal"`, accepts `.99`) and `Button variant="main"` `Save price`; its error reads `Enter an amount like $3.00.`
- `SwapSheet`: `Sheet title="Swap {food}"`. Each option is a 64 px row button: `Packshot`, name (`text-small font-semibold line-clamp-2`), `sizeText` (`text-label text-ink-soft`), the package line right-aligned in `.bk-price`; tags as words in `text-label font-semibold text-ink`: `Cheapest`, `Your usual`; `Out of stock` in `text-ink-soft` with the row at 45% opacity and still tappable if it is today. The chosen row carries `aria-current="true"` and a `Check` icon. `Search with other words` is a `TextField` with a ghost `Search`; validation `Use 2 to 80 letters.` under the field; `Searching for “{term}”` in `text-small text-ink-soft`; `Back to Basket’s pick` a `quietLink`; empty: `Nothing matched at your Fred Meyer. Try other words.` While `busy`, rows are disabled and a `Loading` announces it.

- [ ] **Step 1: Update e2e** (`swap.spec.ts`: open the row, then `Swap`; curly strings). Add `test('the item sheet has a Close button', …)`, `test('a long product name does not push the price off the row at 360 px', …)`, `test('typing .99 saves 99 cents', …)`.
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/swap.spec.ts e2e/list.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove both files from `b.txt`.
- [ ] **Step 4: Run** those specs plus `e2e/sheet.spec.ts e2e/fred-meyer-prices.spec.ts e2e/layout.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(list): item sheet with a close button; product swap as a sheet of real packshots` (+ trailers).

---

### Task B4: Cart review screen

**Review: full** (cart UI; Review Focus 7).

Restyle only. Every string in cart Task 9 stays exact (curly apostrophes only). No change to what is sent or when.

**Files:**
- Modify: `components/ReviewScreen.tsx`, `components/ReviewLine.tsx`, `app/(app)/list/review/page.tsx` (`metadata.title = 'Review your cart'`), `e2e/fred-meyer-cart.spec.ts`, `e2e/screens/b.ts`

**Decisions:**
- `ScreenHeader title="Review your Fred Meyer cart" size="title"` with `back={{ href: '/list', label: 'Back to list' }}`.
- Not connected: one sentence, `Connect Fred Meyer` as the screen's `mainAction` link, the password sentence in `text-small text-ink-soft`. Cart not configured: the sentence alone.
- `How you’ll get it`: `Segmented` (`Pickup`, `Delivery`).
- `ReviewLine`: `Packshot size={64}`; product name `text-small font-semibold line-clamp-2`; size and the food it is for in `text-label text-ink-soft`; `Stepper` with `One fewer {product}` / `One more {product}`; line total right in `.bk-price`; `Swap` and `I have it` as ghost buttons under the line. Lines split by hairlines.
- Sections with `text-heading` titles: `New since then`, `Already in your cart`, `Take these out in the Fred Meyer app`, `Not in this order` (each unmatched food with a ghost `Find a product`).
- Totals: `Fred Meyer total` as a row with `.bk-price`; the week as `BudgetSentence exact` (replaces the budget pill).
- Earlier-send lines (`You added N items on …`, `N items were added from another phone on …`) as `Banner`s. **`We couldn’t tell if Fred Meyer got the last send. Check your Fred Meyer cart before sending again.` is an `ErrorBanner` that stays until the next send; it is never a toast.**
- Bar (`barAboveNav`): the send button `Add N items to my Fred Meyer cart` as `mainAction` (`Adding…` while busy; disabled with `Nothing new to send` or `You’re offline.` as `text-small text-ink-soft` beside it), and the footer `Basket never places an order. You check out at Fred Meyer.` in `text-label text-ink-soft`.
- Confirmations are `Sheet`s. Over budget: the question as the title, `Go back` ghost and `Add anyway` main. **Send again: the warning sentence in `text-body`, `Cancel` as the main action and `Add again` as the ghost** (the safer choice is the filled one; the second tap still sends exactly as before).
- Results: success as a `Banner` with `Open my Fred Meyer cart` (`ExternalLink`, new tab); partial, `rejected`, `too_many`, `failed`, `not_connected` as `ErrorBanner`s with their strings and, for `not_connected`, the connect link.

- [ ] **Step 1: Update e2e** for curly strings and the confirm sheets. Add: `test('the unsure-send warning stays on screen in both looks', …)`; `test('in the send-again sheet the filled button is Cancel', …)`; `test('a long product name keeps the stepper and total on screen at 360 px', …)`; `test('every warning from the cart plan is still present', …)` (a table of the exact strings, each reached through the fake).
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/fred-meyer-cart.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `b.txt`; drop `contrastPending` from `review`.
- [ ] **Step 4: Run** `scripts/e2e-local.sh e2e/fred-meyer-cart.spec.ts e2e/swap.spec.ts e2e/layout.spec.ts e2e/a11y.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cart): the review screen in the new look, with the safer button filled` (+ trailers).

---

### Task B5: Household: people and allergies, stores, Fred Meyer account, Look

**Review: full** (allergy UI; the Fred Meyer account row).

**Files:**
- Modify: `app/(app)/household/HouseholdScreen.tsx`, `PersonEditor.tsx`, `page.tsx` (`metadata.title = 'Household'`), `components/PersonRow.tsx`, `components/StorePicker.tsx`, `components/household/{FoodChips,StoresSection,StaplesSection,AlwaysHaveSection,SignOutButton}.tsx` and any section a phase added there (reminder settings, busy nights, basics and lunchbox picks: Settings rows and Chips by Kinds), `tests/unit/person-row.test.ts`, `e2e/list.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/fred-meyer-connect.spec.ts`, `e2e/family-flags.spec.ts`, `e2e/helpers/flows-b.ts`, `e2e/screens/b.ts`

**Decisions:**
- `ScreenHeader title="Household"`. Sections sit on the ground, 32 apart, each with a `text-heading` title 8 above its content and rows split by `line` hairlines. No cards. Every section keeps its `aria-label`. While a section loads it shows `SkeletonLines`, not an empty box (audit C15); a failed load shows `ErrorBanner` with a retry, never the save message (audit C6).
- Who’s eating: heading `Who’s eating · {servingsText(n)}`. `PersonRow` (`data-testid="person-row"`): a 32 px `rounded-full` initial on `sunk`, the name in `text-body` (with the age in brackets when a name repeats), `portionText` and the diet in `text-small text-ink-soft`, `Won’t eat olives, cilantro` in `text-small text-ink-soft`, **the allergy line with `TriangleAlert` and `Allergy: tree nuts` in `text-small font-semibold text-error`, never clamped**, `No restrictions` only when neither list has anything, a chevron. The helper line stays inside this section. `+ Add person` is a `ghostButton`.
- `PersonEditor` stays inline, one open at a time: `TextField`s and `SelectField`s for Name, Age, Diet, Appetite; then **Won’t eat** and **Allergies** through `FoodChips`: a heading in `text-small font-semibold`, the helper in `text-small text-ink-soft`, `Chip`s with `Remove {food}`, a `TextField` (`Add a food` / `Add an allergy`) with a ghost `Add`, the family spelled out under the field in `text-small text-ink-soft` (`aria-live="polite"`), the nine common allergens as wrapping `ghostButton`s when the list is empty, and **the label sentence (`Basket only reads ingredient names, so it can miss things. Always check labels.`) always shown, in `text-small text-ink`, not soft**. Save is `Button variant="ghost"`; the two-step Delete (`Tap again to delete`) is a ghost button in `text-error`.
- Weekly budget: two `TextField`s side by side, visible labels `Weekly budget` and `Wiggle room`, accessible names unchanged (`Target`, `Wiggle room`), `.bk-price` in the inputs; a successful save announces `Saved.` through a polite `Banner` (audit C12).
- Stores and sharing: 52 px rows, name and detail left, chevron right. `StorePicker`: `TextField` `ZIP code`, ghost `Search` and `Cancel`, results as hairline rows (name `text-body`, address `text-small text-ink-soft`), status text as today (curly, one live region). Invite: ghost `Invite`, the link in a read-only `TextField` (`Invite link`), `Copied…` as `text-small`.
- **Fred Meyer account** (shown when `cartEnabled`): a row `Fred Meyer account`; not connected: `Connect` as a ghost `ButtonLink` and the password sentence in `text-small text-ink-soft`; connected: the word `Connected` with a `Check` icon in `ink` and a ghost `Disconnect`. The `?fm=` notices are `Banner`s (`role="status"`), the failure one an `ErrorBanner`.
- Where things come from: **one row per kind of food** (`Dairy and eggs` left, the chosen store and a chevron right; the row is a button named `{kind}, {store}`). It opens `Sheet title={kind}` holding `RadioRows` (`Fred Meyer`, `Amazon`, `Costco`); choosing saves and closes. Store names come from `STORE_NAMES` in `lib/list/prices.ts`, not a local copy (audit C8). e2e: click `getByRole('button', { name: /Dairy and eggs/ })`, then the radio in the dialog, then expect the row to read `Costco`.
- Staples: hairline rows with `Switch` named `Buy {name} every week` (audit C11), amounts through `<Qty>`; `+ Add staple` ghost; the form uses `TextField`s; `Save staple` is `Button variant="ghost"` with its busy state.
- Always have: `Chip`s with `Remove {name}`, names capitalised as on the list (audit C8); suggestions as wrapping `ghostButton`s; the add field keeps its label.
- Look: the section S2 mounted, a `text-heading` title and the `LookPicker` rows.
- Account: ghost `Sign out`, the note under it in `text-small text-ink-soft`.
- This screen has no filled accent button (nothing here is the one main action).

- [ ] **Step 1: Update e2e** (curly heading, the food-kind sheet, the staple switch name, anything else selected by a string this task makes curly). Add to `family-flags.spec.ts`: `test('a person’s allergy line shows in full in both looks at 360 px', …)`; `test('the check-labels sentence is always visible in the editor', …)`. Add to `fred-meyer-connect.spec.ts`: `test('Connected is said in words, not by color', …)`.
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/list.spec.ts e2e/onboarding.spec.ts e2e/look.spec.ts e2e/fred-meyer-connect.spec.ts e2e/family-flags.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `b.txt`; drop `contrastPending` from `household`.
- [ ] **Step 4: Run** those specs plus `e2e/layout.spec.ts e2e/a11y.spec.ts e2e/fred-meyer-prices.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(household): sections on the ground, people with their allergies in words, store choice in a sheet` (+ trailers).

---

### Task B6: Login and invite

**Review: batched.**

**Files:**
- Modify: `app/login/LoginForm.tsx`, `app/login/page.tsx`, `app/invite/[token]/page.tsx`, `e2e/login-code.spec.ts`, `e2e/smoke.spec.ts`, `e2e/screens/b.ts`

**Decisions:**
- Both: `bk-gutter`, a header with `data-bk-header` and the top inset, title in `font-display text-display`, body on the ground. Page titles `Sign in` and `Invite`.
- Login: `Basket` as the title, one sentence under it (`Plan the week’s dinners and the shopping, together.`), `TextField` for the email, `Email me a sign-in link` as `mainAction` (`Sending…` while busy), the Google button as `ghostButton`.
- **The code form stays exactly as it works today:** the sentence `We sent a link and a 6-digit code to …`; the `6-digit code` field with `autocomplete="one-time-code"` and `inputmode="numeric"` and no `maxLength` (hotfix B17); in this state `Sign in` is the filled main action and `Use a different email` the ghost; errors inside that state as `ErrorBanner`, including the hotfix's failed-link sentence; the `next` parameter is carried through untouched.
- Invite failure: title `Invite`, the message (with its final period, audit C6) in an `ErrorBanner`, and a `ButtonLink variant="ghost"` `Go to Basket` to `/week`. The page still accepts the invite on load, as today (see "Needs the owner").

- [ ] **Step 1: Update e2e** for curly strings (`That code didn’t work…` and the like).
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/login-code.spec.ts e2e/smoke.spec.ts` (`login-code` needs the local Mailpit). Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `b.txt`; drop `contrastPending` from `login` and `invite-failed`.
- [ ] **Step 4: Run** those specs plus `e2e/layout.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(login): login, the 6-digit code and the invite page in the new look` (+ trailers).

---

### Task B7: Onboarding

**Review: batched** (becomes **full** if the onboarding person editor shows the allergy list when this task starts). Last task of Stream B; it owns `e2e/helpers/household.ts` for its duration.

**Files:**
- Modify: `app/onboarding/OnboardingForm.tsx`, `app/onboarding/page.tsx`, `e2e/helpers/household.ts`, `e2e/onboarding.spec.ts`, `e2e/screens/b.ts`

**Decisions:**
- `bk-gutter`, header with `data-bk-header`, title in `font-display text-display`. Page title `Set up`.
- `TextField` `Household name`. **People are a list, edited one at a time:** saved people show as `PersonRow`s (the same component as Household; tap to reopen); exactly one `<fieldset>` editor is open, its legend `Person {n}` (so `getByRole('group', { name: 'Person 2' })` still finds the open one) with `Name`, `Age`, `Diet` and the appetite field; `+ Add person` (ghost) closes the open editor into a row when it has a name, and opens the next. **`Start planning` saves the person in the still-open editor too.** The servings line uses `servingsText` and updates a polite live region once per change, not per keystroke.
- Budget: the two `TextField`s as in Household; accessible name `Weekly budget target` stays; one parse error wording, `Enter an amount like $200.`
- `Start planning` is the `mainAction` in a `barBottom` (`Saving…` while busy). Errors as `ErrorBanner`.
- `e2e/helpers/household.ts` `onboard()` fills people in order; change it only where it reads a closed group.
- The `onboarding` registry screen uses a fresh user (a household that already exists is redirected to `/week`).

- [ ] **Step 1: Update e2e**, and add `test('onboarding shows one person editor at a time', …)` (after adding the second person, `getByRole('group', { name: /^Person/ })` count is 1 and the first person's name is visible as a row) and `test('Start planning keeps the person still being edited', …)`.
- [ ] **Step 2: Run** `scripts/e2e-local.sh e2e/onboarding.spec.ts e2e/smoke.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `b.txt`; drop `contrastPending` from `onboarding`.
- [ ] **Step 4: Run the whole e2e suite** (`scripts/e2e-local.sh`; every spec signs up through onboarding). Expected: PASS.
- [ ] **Step 5: Commit** `feat(onboarding): people as a list, edited one at a time` (+ trailers).

---

## Close-out

### Task C1: Restyle the screens phases b–h added

**Review: full** (cook mode has motion; several phases touch allergy flags, prices and notifications).

Runs when Streams A and B are empty and merged. What a phase added *inside* a file a stream owns was restyled in that stream's task; this task takes everything else: each phase's own screens, sheets and components.

**Inputs:** `/home/claude/basket-redesign/family/{b,c,d,e,f,g,h}/design.md`. Each has a list of the screens and components the phase added. **That list is the work list.** If a phase has no `design.md`, read its plan under `docs/superpowers/plans/` and its spec, and tell the controller which you used.

**Files:**
- Modify: every file still on `tests/unit/design-legacy/later.txt`, `a.txt` or `b.txt`; `e2e/screens/later.ts`; the phase's own e2e specs (strings only)
- Test: the phases' existing specs, plus the additions below

**Expected, by kind** (the phase's `design.md` wins on structure and copy; Kinds wins on look):

| Phase | What it likely added | Kind |
|---|---|---|
| b | Busy-night chooser; "Cook double" and the leftovers-night link; the 3–4 day hint | Sheet; Notice block; won't-eat-style line |
| c | Plan my week: the draft with reasons, the week total, "Try another", "Use this week" | Generated plan to accept |
| e | Use it up: type or pick foods, recipes that use them | Chips, then result tiles as in A5 |
| d | Cook from the sales: what is on sale, "saves about $X", a line on search cards | Lists of rows; Sale and saving words |
| f | Cook mode: one step per screen, that step's ingredients, timers, the no-steps fallback | Full-screen mode |
| g | Prep reminders: per-meal prep steps with edit and off, the evening summary in the app, notification settings, quiet hours, "Turn on reminders" | Settings rows; Lists of rows; Notice block |
| h | Breakfast and lunch slots, repeating basics, lunchbox pick lists per kid, school days | Settings rows; Chips; Lists of rows |

- [ ] **Step 1: Inventory.** From the seven `design.md` lists and the three legacy list files, write the table of what is left (file, phase, kind, owner stream) into the task report **before changing anything**. If it is more than about fifteen files, tell the controller: the work splits cleanly in two by folder (planning side and shopping-and-household side) and can run as two helpers with the same ownership rule as Streams A and B.
- [ ] **Step 2: Add the screens** to `e2e/screens/later.ts` (with `setup` for states that need data: a cook-mode step with a timer running, a reminder permission denied, a plan draft, a sale list, a lunchbox with picks) and to `proof/shoot.spec.ts`'s state list.
- [ ] **Step 3: Write the failing tests**, in the phase's own spec files:
```ts
test('cook mode: an allergy line stays on every step that uses the food, in both looks', ...);
test('cook mode: reduced motion changes steps with a fade and no travel', ...);
test('cook mode: the timer keeps its width as it counts (tabular figures)', ...);
test('cook mode: Next step works during the step transition', ...);
test('notification settings: a denied permission is said in words with one button', ...);
test('Plan my week: no suggested dinner carries an allergy line', ...);   // pins phase c's rule against the restyle
test('a sale is always written "on sale", never shown by color alone', ...);
```
plus, for every new screen, the registry's layout, contrast and tap-size checks in both looks (they come free from `layout.spec.ts`).
- [ ] **Step 4: Run** the phases' specs. Expected: the new tests FAIL.
- [ ] **Step 5: Implement**, kind by kind. No wording, logic or order changes. Empty every legacy list this task owns; drop every `contrastPending`.
- [ ] **Step 6: Run** `npm run lint && npm run typecheck && npm test && npm run build`, then the phases' specs plus `e2e/layout.spec.ts e2e/a11y.spec.ts`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(design): cook mode, plan my week, reminders and the other new screens in the new look` (+ trailers). One commit per phase is fine if the diff is large.

---

### Task C2: Clean-up and the full proof for the owner

**Review: full.**

**Files:**
- Modify: `app/globals.css` (delete the legacy alias block and the `body:not(:has([data-bk-header]))` rule once every screen has a header; keep the rule if any screen still relies on it and say which), `lib/ui.ts` (delete the legacy names and any export nothing imports), `lib/domain/money-input.ts` and `lib/list/prices.ts` (delete `formatDollars` / `formatPrice` if unused), `e2e/screens/*.ts` (delete the `contrastPending` field), `e2e/a11y.spec.ts` (remove the `fixme`), `tests/unit/design-guard.test.ts`
- Delete: `tests/unit/design-legacy/*.txt`

- [ ] **Step 1: Tighten the tests.** The guard reads no list and checks every file; add a check that `app/globals.css` has no `LEGACY ALIASES` block and `lib/ui.ts` no `LEGACY NAMES`. `grep -rn "MealThumb\|BudgetMeter\|DayRow\|DraftPreview\|text-green\|text-muted\|bg-green\|primaryButton\|pillButton\|bigGreenLink\|focusRing" app components lib` must print nothing.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL until the leftovers are gone.
- [ ] **Step 3: Remove the leftovers** listed under Files.
- [ ] **Step 4: Run everything:** `npm run lint && npm run typecheck && npm test && npm run build`, then `scripts/e2e-local.sh`. Expected: PASS on `iphone-17`, `pixel-7`, `android-small`.
- [ ] **Step 5: Run `npm run proof`** for every screen and clip. `measure.spec.ts` must pass (spacing, sizes, contrast).
- [ ] **Step 6: Review every 200% crop** in `proof-out/zoom/`, both looks, both phones. Fix what is off; re-run.
- [ ] **Step 7: Remove one decorative thing per screen** that does not carry meaning, and note each in the commit message. Never an allergy mark, a warning, a price word or a status line.
- [ ] **Step 8: Check the audit, item by item**, against `proof-out/index.html` and write `audit-check.md` (handed to the controller, not committed; `proof-out/` is ignored): for each of the ten rows in `docs/design/audit.md`, the screens checked and the screenshot that shows it fixed. Record the audit's two "also seen" notes (tab order matches the mockups; the last row scrolls clear of the bottom bar, covered by `layout.spec.ts`). **Write down honestly, not as ticks:** audit 4's own examples ("11.2 oz", "3.8 servings") stay as decimals by design; the favorite bookmark is `ink`, not accent; "See what costs most" was dropped by ruling; `Swap` moved from the list row into the item sheet; the budget field's spoken name is still `Target`; "Big sites" and "Spoonacular" keep their names; the Android launch screen is Butter in both looks; the items under "Needs the owner".
- [ ] **Step 9: Commit** `chore(design): remove the old style aliases; full before/after proof` (+ trailers), then hand `proof-out/index.html` and `audit-check.md` to the controller. **Controller:** try both looks, the sheet drag and cook mode on one real iPhone and one real Android phone before the owner sees it; release only after that.

---

## Needs the owner

Short, and none blocks Task S1.

1. **Invites and members (audit SEC-4, SEC-5).** The triage parked a "Join" button and owner-only revoke and remove on "the redesign". They need two database functions and change behaviour, so they are not in this craft pass. Say whether they should be a small task of their own before or after it.
2. **`Swap` moves from the list row into the item sheet** (B1, B3): one more tap to swap, a much calmer row. Shown at the Stream B proof; one line to undo.
3. **The dinner sheet lists scaled ingredients** (A3). New on that sheet; shown at the checkpoint.
4. **Old Spoonacular photos (F28c).** A one-off rewrite of stored photo links to the 636 px size lets them be the hero. Controller step, offered at the checkpoint.
5. **Parallel helpers.** This plan runs two Sonnet implementers side by side after the checkpoint (three if C1 splits), as asked. The owner's standing preference is one Sonnet helper at a time; the streams also run correctly one after the other, in the order S, A, B, C.

## Self-review notes (done)

- **Spec coverage.** Brief: type (S1), spacing (S1, S10), color (S1, S2), depth (S1, S8), photos (S6, S7), icons and corners (S1, S4), every state (S4 and every screen task), edges (S5, S11), motion language (S3), press (S1, S4), continuity (S8, A3, A6, B2), three signature moments (A3, B2, S9), week reveal (A3), reduced motion and haptics (S3 and each motion task), proof steps 3–5 (S10, A4, C2). Audit items: 1 (A2, A5, A7), 2 (S9, A2, B1), 3 (guard in S1, every screen task), 4 (S1 and every screen task), 5 (S1 and guard), 6 (S2, S11), 7 (S6, S7, B1, B3), 8 (A5, B5, B7), 9 (S4, S5 and guard), 10 (S3, S4 and every screen task).
- **Screens that exist or are planned, and where each is restyled.** This week, verdict card (A1, A2); dinner sheet, verdict sheet, facts sheet, ingredient swap sheet (A1, A3); Add a meal with sort, source, Find my dish, paste, Type it myself (A5); recipe page with allergy gate and dislike choices (A6); Favorites and its tab (A7); shopping list with products, stale banner, Check off all, store links (B1, B2); item and Swap sheets (B3); cart review (B4); Household with person editor, chips, stores, Fred Meyer account, staples, always have, Look (B5); login with code, invite (B6); onboarding (B7); loading shell, tab bar (S5); everything phases b–h added (owner tasks by Kinds, then C1).
- **No file is owned twice.** Checked against the table under Streams; the three exceptions are stated there and happen when only one stream is running.
- **Known limits, stated rather than hidden.** Spoonacular's largest photo is 636 × 393. iOS Safari has no web haptics. The Android launch screen is Butter in both looks, and an iPhone launch image follows the phone's setting, not the chosen Look. Safe-area insets are exercised in tests by overriding the `--bk-safe-*` variables; a real iPhone and a real Android phone are checked by the controller (S8, C2). Phase b–h design files did not all exist when this revision was written; C1 and the Kinds table are written against their kind, and each task's inventory step is what catches a surprise.
