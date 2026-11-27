# Basket Premium Visual and Motion Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every Basket screen from one set of design values (Butter in light, Cast Iron in dark), add the motion language and its three signature moments, and fix all ten audit items, with every feature, all data and every test still working.

**Architecture:** Design values live as CSS variables in `app/globals.css` (`--bk-*`, exposed to Tailwind v4 through `@theme inline`); components use only the utilities. Motion is CSS (`linear()` springs, transitions, keyframes) plus small pure helpers in `lib/motion/` and the browser's View Transitions API with a plain fallback; no animation library. Shared primitives in `components/ui/` are built first, then each screen is rebuilt on them, one screen per task, and a guard test with a shrinking list of not-yet-restyled files keeps old styling from coming back.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase, Vitest (node; jsdom per file with `// @vitest-environment jsdom`), Playwright (projects `iphone-17`, `pixel-7`, `android-small`). New packages: `lucide-react` (dependency), `ffmpeg-static` (devDependency, proof recordings only). `sharp` is already installed with Next.

**Spec:** `docs/superpowers/specs/2026-11-26-premium-pass-brief.md` (the brief), `docs/design/audit.md` (ten items, all must be fixed), `docs/design/design-values.md` and `docs/design/tokens.css` (the values), and the approved week mockups `/home/claude/basket-redesign/root/project/Week-Light.dc.html`, `Week-Dark.dc.html` (picture: `/home/claude/basket-redesign/round2/before-after.png`). Read the design-values section named in your task before you start it.

## Global Constraints

Decided; do not reopen.

- **One system, two looks.** `<html data-look="light | dark | auto">`. Light is Butter, dark is Cast Iron, `auto` follows the phone. Nothing but color, shadow and photo filter differs between looks.
- **Color, only through tokens** (utilities such as `bg-ground`, `text-ink-soft`). Butter / Cast Iron values: ground `#F5E6A6` / `#191614`; surface `#FFFBEC` / `#231F1B`; raised `#FFFDF6` / `#2E2923`; sunk `#EBD88F` / `#110F0E`; ink `#2B1422` / `#F3EDE0`; ink-soft `#62414F` / `#B9AE9C`; line `#DCC98A` / `#3A332E`; line-strong `#8C6E6A` / `#80766B`; accent `#4C1D3A` / `#E9B030`; on-accent `#F5E6A6` / `#191614`; accent-press `#3A152C` / `#CF9A22`; sale `#9A3412` / `#FF9070`; error `#A8123A` / `#FF9DAE`; price `#275E36` / `#A6C97C`; packshot `#FFFBEC` / `#EDE5D3`; scrim `25 12 20` / `17 15 14`. No hex value, `white`, `black` or grey utility in `app/` or `components/`.
- **Accent in three places only:** the screen's one main action (filled), the active tab, the "Tonight" label. Links in text are `ink`, semibold, with a chevron or underline. Sale, error and price colors are for text and small icons, always next to the word.
- **Type:** Gloock 400 (`font-display`) and Figtree 400/600/700 (`font-sans`) through `next/font/google`. Six sizes only: `text-display` 34/38, `text-title` 24/28, `text-heading` 18/24 (700), `text-body` 16/24, `text-small` 14/20, `text-label` 12/16. 12 px is the floor. Gloock never below 24 px, never bold. One `text-display` title per screen. Inputs are `text-body`. Caps only for day stamps and "Tonight" (`.bk-caps`).
- **Copy:** curly quotes and apostrophes (’ “ ”), en dash in ranges, `…` as one character. Prices in a column use `.bk-price`, right-aligned, and never wrap or shrink. Quantities go through `<Qty>` (Task 1).
- **Spacing:** 2, 4, 8, 12, 16, 24, 32, 48, 64 px only (Tailwind `0.5 1 2 3 4 6 8 12 16`). Exceptions, both on the photo tile: caption padding 8 top/bottom and 10 sides, and the day stamp 6 px in from the tile's corner (so stamp text and caption text share a left edge). Gutter 16, tile gap 8. Touch targets at least 44 px, main action 52 px, 8 px between neighbors.
- **Corners:** `rounded-xs` 2 (under 28 px), `rounded-sm` 4 (28–56), `rounded-md` 6 (56–200), `rounded-lg` 10 (over 200, and sheet top corners). Full-bleed photos have none. `rounded-full` only for avatars and the switch thumb. No pills.
- **Depth:** shadows only on things that float: `shadow-1` lifted tile and toast, `shadow-2` sheets and menus, `shadow-3` a dragged tile. Nothing on the page has a shadow or a card border; groups separate by `surface` on `ground` or a `line` hairline.
- **Photos:** crops hero 2:1, tile 8:5, thumb 1:1, nothing else. Every recipe photo goes through `<Photo>` (Task 6); every store product shot through `<Packshot>`. Recipe photos stay plain `<img>` with `referrerPolicy="no-referrer"`; never proxy them. No illustrated or generated food.
- **Icons:** `lucide-react` only, through `<Icon>` (stroke 1.75, `currentColor`), sizes 18 (in buttons and rows), 22 (tab bar), 24 (standalone). No inline `<svg>`, no filled icons, no emoji.
- **Motion:** durations fast 120 ms, base 240 ms, slow 400 ms; springs `ease-snap` (370 ms, no overshoot) and `ease-settle` (560 ms, 3.6% overshoot, signature moments only); `ease-out` for opacity and color. Animate only `transform`, `opacity` and `clip-path`. Nothing blocks a tap. Nothing over 400 ms except the three signature moments. Under `prefers-reduced-motion: reduce` every move is a 120 ms fade (the tokens already switch; multiply every travel distance by `var(--bk-move)`). Haptic: `navigator.vibrate(8)` where it exists.
- **Keep working:** every route, feature and stored value stays. Keep every role, accessible name, `data-testid` and visible string exactly as it is unless your task lists the change. When a task changes a string or structure that an e2e test selects, update that test in the same task. The blanket change is straight to curly quotes: grep `e2e/` for each string you touch.
- **Guard list:** `tests/unit/design-guard.test.ts` (Task 1) holds `LEGACY_FILES`. A task that restyles a file removes it from that list in the same commit; the guard must then pass for it.
- **Every task ends green:** `npm run lint && npm run typecheck && npm test`, plus the Playwright specs the task names, run with the env block from `.github/workflows/ci.yml` (`E2E=1`, `AI_FAKE=1`, `RECIPE_SEARCH_FAKE=1`, `KROGER_FAKE=1`). Never open `.env.local`.

## Review Focus

Conditions the spec implies and that would bite a person; each has a test in the task named.

1. **Storage is blocked or holds junk** (private mode, a hand-edited value): the look falls back to Match my phone, nothing throws, no flash. Task 2.
2. **The browser has no View Transitions API or no `linear()`** (older Android WebView, Firefox): a tile still opens its recipe, sheets still move, with ordinary easing. Tasks 1, 3, 10.
3. **A second tap lands mid-animation** (ticking and unticking a list item inside 300 ms, tapping a tile while the week is still revealing): the end state matches the last tap and no tap is lost. Tasks 10, 16.
4. **A photo is missing, 404s after its preview showed, never finishes, or is too small**: the designed fallback or the held preview shows, the layout does not jump, and a small photo is never the hero. Tasks 6, 9.
5. **Very long or very large values at 360 px wide** (an 80-character dish name with no spaces, a $1,234 total against a $10,000 budget, a total that gains a digit): no sideways scroll, prices on one line, the rolling total keeps its place. Tasks 3, 9, 15.

---

## File structure

New: `lib/design/contrast.ts`, `lib/text/typography.ts`, `lib/look.ts`, `lib/motion/{motion,haptics,sheet-gesture,roll,view-transition,flip,settle}.ts`, `lib/photos/{verdict,best-url,preview,ensure-previews}.ts`, `components/ClientBoot.tsx`, `components/LookPicker.tsx`, `components/ui/{Icon,Button,Field,Tabs,Check,Switch,states,Qty,Photo,Packshot,ScreenHeader,Toast}.tsx`, `components/MealTile.tsx`, `components/week/{TonightHero,OpenDay}.tsx`, `components/BudgetSentence.tsx`, `components/RollingNumber.tsx`, `components/add-meal/RecipePage.tsx`, `app/api/meals/preview/route.ts`, `supabase/migrations/0005_photo_preview.sql`, `scripts/proof/*.mjs`, `scripts/icons/splash.mjs`, `e2e/{look,sheet,motion,a11y}.spec.ts`.

Replaced and deleted by the task that replaces them: `components/DayRow.tsx` (Task 9), `components/BudgetMeter.tsx` (Task 15), `components/MealThumb.tsx` (Task 20), `components/add-meal/DraftPreview.tsx` becomes `RecipePage.tsx` (Task 13).

---

### Task 1: Design values, fonts and type helpers

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`
- Create: `lib/design/contrast.ts`, `lib/text/typography.ts`, `components/ui/Qty.tsx`
- Test: `tests/unit/tokens.test.ts`, `tests/unit/typography.test.ts`, `tests/unit/design-guard.test.ts`

**Interfaces:**
- Produces: every `--bk-*` variable and Tailwind utility named in Global Constraints; classes `.bk-price`, `.bk-qty`, `.bk-photo`, `.bk-packshot`, `.bk-press`, `.bk-press-icon`, `.bk-caps`, `.bk-gutter`, `.bk-fallback-letter`; `--bk-nav-h`.
- `contrastRatio(a: string, b: string): number` (two `#RRGGBB`), `parseTokens(css: string): { light: Record<string,string>; dark: Record<string,string> }` in `lib/design/contrast.ts`.
- `curly(text: string): string` and `qtyParts(text: string): { lead: string; built: string | null; rest: string }` in `lib/text/typography.ts`; `<Qty text={string} />`.
- `LEGACY_FILES: string[]` exported from the guard test.

- [ ] **Step 1: Write the failing tests**

`tests/unit/tokens.test.ts` reads `app/globals.css`:
```ts
const PAIRS = [['ink','ground'],['ink','surface'],['ink','raised'],['ink','sunk'],['ink-soft','ground'],['ink-soft','surface'],['ink-soft','raised'],['ink-soft','sunk'],['on-accent','accent'],['on-accent','accent-press'],['accent','ground'],['accent','surface'],['sale','ground'],['sale','surface'],['sale','sale-tint'],['error','ground'],['error','surface'],['error','error-tint'],['price','ground'],['price','surface'],['estimate','ground'],['estimate','surface']];
for (const look of ['light','dark'] as const) for (const [fg,bg] of PAIRS)
  it(`${look}: ${fg} on ${bg} is at least 4.5`, () => expect(contrastRatio(t[look][fg], t[look][bg])).toBeGreaterThanOrEqual(4.5));
it('line-strong is at least 3 on ground and surface in both looks', ...);
it('ink on ground is 13.67 in Butter and 15.44 in Cast Iron', () => { /* toBeCloseTo(…, 1) */ });
it('[data-look="dark"] and the auto media block hold the same values', ...);
it('there is a fallback for browsers without linear()', () => expect(css).toMatch(/@supports not \(transition-timing-function: linear\(0, 1\)\)/));
```
`tests/unit/typography.test.ts`:
```ts
expect(curly(`Who's eating`)).toBe('Who’s eating');
expect(curly(`"Mom's pick"`)).toBe('“Mom’s pick”');
expect(qtyParts('1.5 cups')).toEqual({ lead: '1½', built: null, rest: ' cups' });
expect(qtyParts('0.25 tsp')).toEqual({ lead: '¼', built: null, rest: ' tsp' });
expect(qtyParts('0.33 cup').lead).toBe('⅓');
expect(qtyParts('2.125 lb')).toEqual({ lead: '2 ', built: '1/8', rest: ' lb' });
expect(qtyParts('11.2 oz')).toEqual({ lead: '11.2', built: null, rest: ' oz' });
expect(qtyParts('3 each')).toEqual({ lead: '3', built: null, rest: ' each' });
expect(qtyParts('a pinch')).toEqual({ lead: '', built: null, rest: 'a pinch' });
```
`tests/unit/design-guard.test.ts`: walk every `.tsx` and `.ts` under `app/` and `components/` plus `lib/ui.ts`; for each file not in `LEGACY_FILES`, fail on any match of: `#[0-9a-fA-F]{3,8}\b` inside a string or class, `\b(bg|text|border|outline|accent|decoration|fill|stroke)-(white|black|gray-|slate-|zinc-|neutral-|stone-)`, `\btext-\[\d`, `\brounded-\[`, `\brounded-(xl|2xl|3xl)\b`, `\brounded-full\b` (allowed only in files listed in `ROUND_OK = ['components/ui/Switch.tsx']`), `<svg`, `\bshadow-(sm|md|lg|xl)\b`, `\b(text|bg|border|outline|accent)-(green|green-tint|muted)\b`, `env\(safe-area-inset`, `&apos;|&quot;`, and straight `'` or `"` inside JSX text (`>[^<{]*['"][^<{]*<`). Seed `LEGACY_FILES` with every current file under `app/` and `components/` that fails. A second test fails if a `LEGACY_FILES` entry no longer exists or no longer fails (so the list can only shrink).

- [ ] **Step 2: Run** `npx vitest run tests/unit/tokens.test.ts tests/unit/typography.test.ts tests/unit/design-guard.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 3: Replace the `:root` and `@theme inline` blocks of `app/globals.css` with the contents of `docs/design/tokens.css`, verbatim, after `@import "tailwindcss"`.** Then make these edits in `globals.css`:
  - `--bk-font-display: var(--font-gloock), "Iowan Old Style", Georgia, serif;` and `--bk-font-sans: var(--font-figtree), system-ui, sans-serif;`.
  - `--bk-nav-h: calc(3rem + var(--bk-safe-bottom));` in `:root`.
  - Keep the `body` safe-area padding for now (Task 5 moves it). Delete the `h1, h2, h3` font rule.
  - `.bk-press { transition: transform var(--bk-dur-snap) var(--bk-spring-snap); } .bk-press:active:not(:disabled) { transform: scale(var(--bk-press-scale)); transition: transform var(--bk-dur-fast) var(--bk-ease-out); }` and `.bk-press-icon:active:not(:disabled) { transform: scale(calc(1 - (1 - var(--bk-press-scale)) * 2)); }` (0.94; 1 under reduced motion).
  - `.bk-caps { text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }`, `.bk-gutter { padding-left: var(--bk-safe-left); padding-right: var(--bk-safe-right); }`, `.bk-fallback-letter { font-family: var(--bk-font-display); font-size: 54px; line-height: 1; color: var(--bk-ink-soft); }`.
  - `:focus-visible { outline: 2px solid var(--bk-accent); outline-offset: 2px; }`, `:disabled, [aria-disabled="true"] { opacity: 0.45; }`.
  - `@supports not (transition-timing-function: linear(0, 1)) { :root { --bk-spring-snap: cubic-bezier(0.2, 0.8, 0.2, 1); --bk-spring-settle: cubic-bezier(0.2, 0.8, 0.2, 1); } }` placed before the reduced-motion block.
  - A block marked `/* LEGACY ALIASES: deleted in Task 20 */` inside `@theme inline`: `--color-green: var(--bk-accent); --color-green-tint: var(--bk-sunk); --color-muted: var(--bk-ink-soft);` so screens not yet restyled stay readable in both looks.

- [ ] **Step 4: Fonts in `app/layout.tsx`.** `Gloock({ weight: '400', subsets: ['latin'], variable: '--font-gloock', display: 'swap' })` and `Figtree({ weight: ['400','600','700'], subsets: ['latin'], variable: '--font-figtree', display: 'swap' })`; remove Bricolage Grotesque and DM Sans.

- [ ] **Step 5: Implement `contrast.ts`, `typography.ts`, `Qty.tsx`.** `qtyParts` reads a leading number; a fractional part within 0.02 of .25 .5 .75 .33 .67 becomes ¼ ½ ¾ ⅓ ⅔ joined to the whole number (no whole number when it is 0); within 0.01 of an odd eighth becomes `built` (`'1/8'`, `'3/8'`, `'5/8'`, `'7/8'`); anything else is left as written. `<Qty>` renders `lead`, then `built` inside `<span className="bk-qty">`, then `rest`.

- [ ] **Step 6: Run** the three test files and `npm run lint && npm run typecheck && npm test`. Expected: PASS.

- [ ] **Step 7: Commit** `feat(design): Butter and Cast Iron tokens, Gloock and Figtree, type helpers, style guard`.

---

### Task 2: Light, Dark or Match my phone

Stored per device in `localStorage` under `basket:look` (`'light' | 'dark' | 'auto'`, default `'auto'`). Not stored on the account, and it survives sign-out (it describes the phone, not the person's data).

**Files:**
- Create: `lib/look.ts`, `components/ClientBoot.tsx`, `components/LookPicker.tsx`, `e2e/look.spec.ts`
- Modify: `app/layout.tsx`, `app/(app)/household/HouseholdScreen.tsx`, `tests/unit/signout.test.ts`
- Test: `tests/unit/look.test.ts`

**Interfaces:**
- Produces, in `lib/look.ts`:
  - `type Look = 'light' | 'dark' | 'auto'`; `LOOK_KEY = 'basket:look'`; `THEME_COLOR = { light: '#F5E6A6', dark: '#191614' } as const`
  - `parseLook(v: unknown): Look` (anything unknown is `'auto'`)
  - `readLook(storage?: Pick<Storage, 'getItem'> | null): Look` and `saveLook(look: Look, storage?: Pick<Storage, 'setItem'> | null): void`; neither ever throws
  - `applyLook(look: Look, doc?: Document): void` sets `documentElement.dataset.look` and, on every `meta[name="theme-color"]`: for `light` or `dark` set `content` to that look's color; for `auto` set each tag's `content` by its own `media` attribute
  - `LOOK_BOOT_SCRIPT: string`, a self-contained script doing `applyLook(readLook())` inside `try/catch`
- `<ClientBoot />` (client, renders nothing): on mount `applyLook(readLook())`; on a `storage` event for `LOOK_KEY` apply the new value.
- `<LookPicker />`: `role="radiogroup"` `aria-label="Look"`, radios named `Light`, `Dark`, `Match my phone`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/look.test.ts` (`// @vitest-environment jsdom`):
```ts
it('parseLook keeps the three values and turns anything else into auto', () => { for (const v of ['light','dark','auto']) expect(parseLook(v)).toBe(v); for (const v of [null, 'DARK', 7, '']) expect(parseLook(v)).toBe('auto'); });
it('readLook returns auto when storage throws or is missing', () => { expect(readLook({ getItem() { throw new Error('blocked'); } })).toBe('auto'); expect(readLook(null)).toBe('auto'); });
it('saveLook swallows a full or blocked storage', () => expect(() => saveLook('dark', { setItem() { throw new Error('full'); } })).not.toThrow());
it('applyLook("dark") sets data-look and both theme-color tags to #191614', ...);
it('applyLook("auto") gives the light tag #F5E6A6 and the dark tag #191614', ...);
it('the boot script sets data-look from storage and survives a throwing localStorage', () => { /* run LOOK_BOOT_SCRIPT with new Function against jsdom */ });
```
Add to `tests/unit/signout.test.ts`: `clearDeviceData` leaves the key `basket:look` in place.

`e2e/look.spec.ts`:
```ts
test('auto follows the phone', async ({ browser }) => { /* context colorScheme: 'dark' → html background rgb(25, 22, 20); colorScheme: 'light' → rgb(245, 230, 166) */ });
test('choosing Dark sticks, sets the status bar color, and does not flash on reload', async ({ page }) => {
  // createHousehold, goto /household, check radio "Dark"
  // expect html[data-look="dark"], localStorage basket:look === 'dark', every meta[name=theme-color] content '#191614'
  // addInitScript: a MutationObserver that records documentElement.dataset.look into window.__lookAtBody when <body> first appears
  // reload → window.__lookAtBody === 'dark'
});
test('a junk stored value behaves as Match my phone', ...); // localStorage basket:look = 'purple'
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/look.test.ts tests/unit/signout.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `lib/look.ts`, `ClientBoot`, `LookPicker`.**

- [ ] **Step 4: Wire `app/layout.tsx`.** `<html lang="en" data-look="auto" suppressHydrationWarning>`; first child of `<head>`: `<script data-look-boot dangerouslySetInnerHTML={{ __html: LOOK_BOOT_SCRIPT }} />`; `viewport.themeColor = [{ media: '(prefers-color-scheme: light)', color: '#F5E6A6' }, { media: '(prefers-color-scheme: dark)', color: '#191614' }]`; render `<ClientBoot />` in `<body>`.

- [ ] **Step 5: Mount the picker** in `HouseholdScreen.tsx` as `<section aria-label="Look">` with heading `Look`, directly above the Account section (styled properly in Task 17).

- [ ] **Step 6: Run** unit tests, then `npx playwright test e2e/look.spec.ts`. Expected: PASS on `iphone-17` and `pixel-7`.

- [ ] **Step 7: Commit** `feat(look): Light, Dark or Match my phone, stored on the device, no flash on load`.

---

### Task 3: Motion language and helpers

**Files:**
- Create: `lib/motion/motion.ts`, `haptics.ts`, `sheet-gesture.ts`, `roll.ts`, `view-transition.ts`, `flip.ts`, `settle.ts`
- Modify: `app/globals.css`
- Test: `tests/unit/motion.test.ts`

**Interfaces (all produced here):**
- `motion.ts`: `DUR = { fast: 120, base: 240, slow: 400, snap: 370, settle: 560 } as const`; `prefersReducedMotion(win?: Pick<Window, 'matchMedia'>): boolean`; `staggerDelay(index: number, reduced: boolean): number` (`min(index, 7) * 40`, or 0)
- `haptics.ts`: `tick(nav?: { vibrate?: (ms: number) => boolean }): boolean` calls `vibrate(8)`; false when absent; never throws
- `sheet-gesture.ts`: `velocity(samples: { t: number; y: number }[]): number` (px/ms over the last 100 ms; positive is downward); `shouldDismiss(dragPx: number, sheetHeightPx: number, velocityPxPerMs: number): boolean` (true when velocity > 0.5, or dragPx / height > 0.3)
- `roll.ts`: `rollDigits(prev: string, next: string): { char: string; from: string | null; delayMs: number }[]` (one entry per character of `next`, compared from the right; `from` is the old digit when a digit changed or is new, else null; `delayMs` is 30 × the changed digit's rank from the right); `rollDirection(prevCents: number, nextCents: number): 'up' | 'down'`
- `view-transition.ts`: `supportsViewTransitions(doc?: Document): boolean`; `morph(opts: { from: HTMLElement | null; to: () => HTMLElement | null; update: () => void; name?: string; doc?: Document; reduced?: boolean }): Promise<void>`
- `flip.ts`: `invert(first: { left: number; top: number }, last: { left: number; top: number }): { dx: number; dy: number }`; `useFlipList(ref: React.RefObject<HTMLElement | null>, signature: string): void` (children carry `data-flip-key`; when `signature` changes, each child that moved animates from its old place with the Web Animations API, 370 ms, the computed value of `--bk-spring-snap`; under reduced motion a 120 ms opacity fade instead)
- `settle.ts`: `SETTLE_KEY = 'basket:settle'`; `markSettle(day: Day, storage?: Storage | null, now?: number): void`; `takeSettle(storage?: Storage | null, now?: number): Day | null` (returns and removes the day when marked under 10 s ago); `newlyFilled(prev: Day[] | null, next: Day[]): Day[]`
- CSS classes: `.bk-reveal` (reads `--i`), `.bk-settle`, `.bk-skeleton`, `.bk-fade-in`, and the `meal-photo` view-transition rules.

- [ ] **Step 1: Write the failing tests** in `tests/unit/motion.test.ts`:
```ts
expect(staggerDelay(0, false)).toBe(0); expect(staggerDelay(3, false)).toBe(120); expect(staggerDelay(20, false)).toBe(280); expect(staggerDelay(3, true)).toBe(0);
expect(tick(undefined)).toBe(false); expect(tick({})).toBe(false); const v = vi.fn(() => true); expect(tick({ vibrate: v })).toBe(true); expect(v).toHaveBeenCalledWith(8);
expect(tick({ vibrate() { throw new Error('no'); } })).toBe(false);
expect(shouldDismiss(100, 600, 0.1)).toBe(false); expect(shouldDismiss(181, 600, 0)).toBe(true); expect(shouldDismiss(20, 600, 0.51)).toBe(true); expect(shouldDismiss(20, 600, -0.9)).toBe(false);
expect(velocity([{ t: 0, y: 0 }, { t: 50, y: 40 }, { t: 100, y: 80 }])).toBeCloseTo(0.8);
expect(rollDigits('$168', '$172')).toEqual([{ char: '$', from: null, delayMs: 0 }, { char: '1', from: null, delayMs: 0 }, { char: '7', from: '6', delayMs: 30 }, { char: '2', from: '8', delayMs: 0 }]);
expect(rollDigits('$98', '$104').map((d) => d.from)).toEqual([null, ' ', '9', '8']); // a new leading digit rolls in from blank
expect(rollDigits('$1,234', '$1,234').every((d) => d.from === null)).toBe(true);
expect(rollDirection(16800, 17200)).toBe('up'); expect(rollDirection(17200, 16800)).toBe('down');
expect(invert({ left: 10, top: 100 }, { left: 10, top: 160 })).toEqual({ dx: 0, dy: -60 });
// settle
markSettle('thu', s, 1000); expect(takeSettle(s, 5000)).toBe('thu'); expect(takeSettle(s, 5000)).toBeNull();
markSettle('thu', s, 1000); expect(takeSettle(s, 12000)).toBeNull();
expect(newlyFilled(null, ['mon'])).toEqual([]); expect(newlyFilled(['mon'], ['mon', 'thu'])).toEqual(['thu']);
// morph (jsdom)
it('without the API, morph calls update once and names nothing', ...);
it('with reduced: true, morph calls update once and never calls startViewTransition', ...);
it('with the API, the name is on `from` before the transition, on `to()` inside it, and on neither after `finished`', ...); // fake doc.startViewTransition = (cb) => { cb(); return { finished: Promise.resolve() } }
it('morph with from: null just calls update', ...);
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
::view-transition-group(meal-photo) { animation-duration: var(--bk-dur-slow); animation-timing-function: var(--bk-spring-snap); }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: var(--bk-dur-base); animation-timing-function: var(--bk-ease-out); }
@media (prefers-reduced-motion: reduce) { .bk-skeleton { animation: none; } }
```

- [ ] **Step 5: Run** the test file and the full unit suite. Expected: PASS.

- [ ] **Step 6: Commit** `feat(motion): durations, two springs, reduced-motion path, haptic tick and helpers`.

---

### Task 4: Shared controls, icons and states

**Files:**
- Create: `components/ui/Icon.tsx`, `Button.tsx`, `Field.tsx`, `Tabs.tsx`, `Check.tsx`, `Switch.tsx`, `states.tsx`, `Toast.tsx`
- Modify: `lib/ui.ts` and every file importing from it (rename only), `components/ClientBoot.tsx`, `package.json`
- Test: `e2e/a11y.spec.ts` (created here, extended in Task 5)

**Interfaces:**
- `<Icon icon={LucideIcon} size={18 | 22 | 24} label?: string />`: `strokeWidth={1.75}`; `aria-hidden` unless `label`, then `role="img"` and `aria-label`.
- `lib/ui.ts` exports, replacing the old ones by rename across the repo: `mainAction` (was `primaryButton` and `bigGreenLink`: `h-13 w-full rounded-md bg-accent text-on-accent active:bg-accent-press text-body font-bold bk-press`, flex centered, `no-underline`), `ghostButton` (was `pillButton`: `h-11 rounded-md border border-line-strong bg-transparent px-3 text-small font-semibold text-ink bk-press`, `whitespace-nowrap`, flex centered with `gap-2`), `quietLink` (new: `inline-flex min-h-11 items-center gap-0.5 text-small font-semibold text-ink no-underline`), `textInput` (`h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-body text-ink`), `barAboveNav` (was `stickyAboveNav`: `sticky bottom-[var(--bk-nav-h)] z-10 border-t border-line bg-ground bk-gutter pt-2 pb-2`), `barBottom` (was `stickyBottom`: the same with `bottom-0` and `pb-[var(--bk-safe-bottom)]`). `focusRing` becomes `''` and is removed from call sites (the global `:focus-visible` rule replaces it).
- `<Button variant="main" | "ghost" busy?: boolean busyLabel?: string {...buttonProps} />` (when `busy`: disabled, shows `busyLabel`, keeps its width); `<ButtonLink variant href {...} />` (a `next/link`); `<IconButton icon label onClick? href? />` (44 × 44, `rounded-md`, `bk-press bk-press-icon`, `aria-label={label}`).
- `<TextField label error? {...inputProps} />` (label in `text-small` `ink-soft` above; error under the field in `text-small text-error`, `role="alert"`).
- `<Tabs label items={{ id: T; label: string; detail?: string }[]} active onChange />`: `role="tablist"` `aria-label={label}`; each `role="tab"` `aria-selected`, 48 px tall, label `text-small`, detail `text-label` under it; active is `text-accent font-bold` with a 2 px `accent` bottom edge; inactive `text-ink-soft`; one `line` hairline under the row. The accessible name of a tab is its label then its detail.
- `<Check checked onChange label />`: a 44 × 44 `<label>` around a real `<input type="checkbox" aria-label={label}>` shown as a 20 px `rounded-xs` box with a 1.5 px `line-strong` edge; checked fills `ink` with the check stroke in `ground`, drawn by `stroke-dashoffset` over `--bk-dur-fast` (a transition, so it reverses).
- `<Switch checked onChange label />`: real `<input type="checkbox" role="switch" aria-label={label}>` in a 48 px label; track 44 × 24 `rounded-full`, `sunk` off and `ink` on; thumb 20 px `rounded-full` `surface`, slides with `ease-snap`.
- `states.tsx`: `<SkeletonLines lines size="body" | "small" />`, `<SkeletonTile crop="hero" | "tile" />`, `<EmptyState sentence action? />` (one sentence in `text-body`, one ghost action, on the ground), `<ErrorBanner message actionLabel? onAction? />` (`role="alert"`, `bg-error-tint`, `triangle-alert` icon and text in `text-error`, `rounded-md`, padding 12), `<OfflineStrip state="offline" | "back" />` (`role="status"`, `bg-sunk`, `wifi-off` icon; texts `Offline. Showing your last list.` and `Back online. Saved.`).
- `<Toast message tone="ok" | "bad" onDone />`: `role="status"`, fixed above the nav, `bg-raised shadow-1 rounded-md`, `text-small`; leaves after 4 s.

- [ ] **Step 1: Write the failing test** `e2e/a11y.spec.ts`: after `createHousehold`, on `/household`, every `button, a, input` (using the label's box for a wrapped input, as `e2e/layout.spec.ts` does) is at least 44 × 44, and `document.querySelectorAll('nav[aria-label="Main"] svg:not(.lucide)').length` is 0. Expected now: FAIL on the nav's hand-drawn icons (fixed in Task 5; mark this one assertion `test.fixme` until then and remove the mark there).

- [ ] **Step 2: Install** `npm i lucide-react`.

- [ ] **Step 3: Build the components** to the interfaces above. All use utilities only; none is added to `LEGACY_FILES`.

- [ ] **Step 4: Rename the `lib/ui.ts` exports across the repo** (`grep -rl "@/lib/ui"`), changing names only. Old screens now pick up the new buttons and inputs.

- [ ] **Step 5: Press on iOS.** In `ClientBoot`, add `document.addEventListener('touchstart', () => {}, { passive: true })` on mount (Safari only applies `:active` to non-links when a touch listener exists).

- [ ] **Step 6: Run** `npm run lint && npm run typecheck && npm test && npx playwright test`. Expected: PASS (a few screens look mixed; that is expected until their task).

- [ ] **Step 7: Commit** `feat(ui): Lucide icons, buttons with a press state, fields, tabs, check, switch and designed states`.

---

### Task 5: App shell: tab bar, screen header, safe areas

**Files:**
- Create: `components/ui/ScreenHeader.tsx`, `components/LegacyInset.tsx`, `e2e/helpers/look.ts`
- Modify: `components/BottomNav.tsx`, `app/(app)/layout.tsx`, `app/globals.css` (remove the `body` safe-area padding), `e2e/layout.spec.ts`, `e2e/a11y.spec.ts`, `e2e/list.spec.ts`

**Interfaces:**
- `<ScreenHeader title action? below? />`: `<header className="bk-gutter pt-[var(--bk-safe-top)] pb-2">`, a row with `<h1 className="font-display text-display">` and `action` on the right, then `below`.
- Tab bar: order **This week, Favorites, List, Household** (hrefs `/week`, `/favorites`, `/list`, `/household`); icons `Calendar`, `Bookmark`, `ListChecks`, `Users` at 22; labels `text-label`; active `text-accent font-bold`, others `text-ink-soft font-semibold`; `bg-surface border-t border-line`; padding `4px 8px var(--bk-safe-bottom)`; each link `min-h-11 flex-1 bk-press`. Height equals `--bk-nav-h`.
- e2e helper `setLook(page, look: 'light' | 'dark')` and `setInsets(page, top: number, bottom: number)` exported from `e2e/helpers/look.ts` (`setInsets` uses `page.addStyleTag(':root{--bk-safe-top:…px;--bk-safe-bottom:…px}')`).

- [ ] **Step 1: Update the tests first.**
  - `e2e/list.spec.ts`: nav link `"Week"` becomes `"This week"` (two places).
  - `e2e/layout.spec.ts`: run the screen loop for `look of ['light', 'dark']` (`setLook` before each `goto`), and again in light with `setInsets(page, 62, 34)` (iPhone 17) and `setInsets(page, 28, 24)` (Pixel 7 gestures). Add to `audit()`: (a) for every visible text node, the contrast of its computed `color` against the nearest ancestor's opaque `background-color` is at least 4.5 (skip nodes inside `[data-on-photo]`); copy the ratio formula from `lib/design/contrast.ts` into the page function; (b) the nav's bottom padding is at least the inset and the header's top padding is at least the inset; (c) `getComputedStyle(nav).backgroundColor` reaches the bottom of the viewport (nav bottom equals `innerHeight`).
  - `e2e/a11y.spec.ts`: remove the `fixme`; add the same tap-size check for `/week`, `/favorites`, `/list`, `/household` in both looks.
- [ ] **Step 2: Run** `npx playwright test e2e/layout.spec.ts e2e/a11y.spec.ts`. Expected: FAIL (nav label, insets on body, contrast on old greens in dark).
- [ ] **Step 3: Implement** `ScreenHeader`, the new `BottomNav`, and remove the `body` padding. In `app/(app)/layout.tsx` keep the `max-w-md` column. Old screens still need the top inset until their own task: create `components/LegacyInset.tsx`, a client component that wraps `children` in `<div className="pt-[var(--bk-safe-top)]">` unless `usePathname()` starts with an entry of its exported `HEADER_DONE: string[]` (empty now). Use it around `children` in `app/(app)/layout.tsx`. Each screen task adds its route to `HEADER_DONE`; Task 20 deletes the component. Onboarding, login and invite get `pt-[var(--bk-safe-top)]` on their outer element here.
- [ ] **Step 4: Run** the two specs on all three projects, then the whole e2e suite. Contrast failures on screens not yet restyled: add those routes to a `CONTRAST_PENDING` array in `layout.spec.ts`, and have each screen task remove its route. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shell): tab bar in the new order, screen header, safe areas inside the bar and header`.

---

### Task 6: Photo, fallback and packshot components

**Files:**
- Create: `lib/photos/verdict.ts`, `components/ui/Photo.tsx`, `components/ui/Packshot.tsx`
- Test: `tests/unit/photo-verdict.test.ts`, `e2e/photo.spec.ts`

**Interfaces:**
- `type Crop = 'hero' | 'tile' | 'thumb'`; `photoVerdict(crop: Crop, sourceWidth: number | null): 'ok' | 'fallback' | 'demote'`: null is `'ok'`; `thumb` is always `'ok'`; under 300 is `'fallback'`; `hero` under 600 is `'demote'`.
- `<Photo src: string | null name: string crop: Crop preview?: string | null width?: number | null priority?: boolean className?: string onDemote?: () => void imgRef?: React.Ref<HTMLImageElement> />`
  - Wrapper: `bg-sunk overflow-hidden` with `aspect-hero | aspect-tile | aspect-thumb`, `data-photo-state="loading" | "ready" | "fallback"`.
  - While loading, `preview` (a data URI) is the wrapper's CSS `background-image` (`cover`), blurred by a `::before` layer with `filter: blur(var(--bk-photo-blur))` scaled 1.1. It is **not** an `<img>`: tests rely on one `<img>` per photo.
  - The real photo is one `<img className="bk-photo" alt="" decoding="async" referrerPolicy="no-referrer">`, `loading="lazy"` unless `priority` (then `fetchPriority="high"`), opacity 0 to 1 over `--bk-dur-base` on load (check `img.complete` on mount for cached photos).
  - On load, run `photoVerdict(crop, width ?? img.naturalWidth)`: `'fallback'` shows the fallback; `'demote'` calls `onDemote`. On error, or `src` null: fallback, and no `<img>` in the DOM.
  - Fallback, `tile` and `hero`: `sunk`, the name's first letter upper-cased in `.bk-fallback-letter`, and `Add a photo` in `text-small font-semibold text-ink-soft` under it. `thumb`: the letter alone in Gloock at 24 px.
- `<Packshot src: string | null alt: string />`: 44 × 44, `.bk-packshot`, the image inside it; renders nothing when `src` is null or the image fails.

- [ ] **Step 1: Write the failing tests.**
```ts
// tests/unit/photo-verdict.test.ts
expect(photoVerdict('tile', null)).toBe('ok'); expect(photoVerdict('tile', 299)).toBe('fallback'); expect(photoVerdict('tile', 300)).toBe('ok');
expect(photoVerdict('hero', 599)).toBe('demote'); expect(photoVerdict('hero', 600)).toBe('ok'); expect(photoVerdict('hero', 250)).toBe('fallback'); expect(photoVerdict('thumb', 120)).toBe('ok');
```
`e2e/photo.spec.ts`: no screen uses `<Photo>` yet, so write the spec now against a planned dinner's tile on `/week` and mark each test `test.fixme` with the note `enabled in Task 9`: (1) a photo that 404s shows `Add a photo` and no `img` in that tile; (2) a photo held open by `page.route` (never fulfilled) keeps `data-photo-state="loading"` and the tile's box height equals the loaded tile's height; (3) fulfilling it flips to `ready` and the `img` opacity reaches 1.
- [ ] **Step 2: Run** `npx vitest run tests/unit/photo-verdict.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** unit tests, lint, typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `feat(photo): shared crop and treatment, blurred preview, designed fallback, packshot tile`.

---

### Task 7: Photo data: stored preview, source width, best resolution

Adds two nullable columns; no existing value changes. The app works whether or not the migration has been applied (missing columns read as null and the preview call fails quietly).

**Files:**
- Create: `supabase/migrations/0005_photo_preview.sql`, `lib/photos/preview.ts`, `lib/photos/best-url.ts`, `lib/photos/ensure-previews.ts`, `app/api/meals/preview/route.ts`
- Modify: `lib/db/types.ts` (meals Row/Insert/Update: `photo_preview: string | null`, `photo_width: number | null`), `lib/db/queries/meals.ts` (`setMealPhoto`), `lib/recipes/import-url.ts`, `lib/recipes/jsonld.ts`, `lib/recipes/search/spoonacular.ts`, `components/useWeekData.ts`, `components/FavoritesBrowser.tsx`
- Test: `tests/unit/photo-preview.test.ts`, `tests/unit/best-url.test.ts`, additions to `tests/unit/import-url.test.ts`, `tests/unit/jsonld.test.ts`

**Interfaces:**
- SQL: `alter table public.meals add column if not exists photo_preview text, add column if not exists photo_width integer;`
- `makePreview(bytes: Uint8Array): Promise<{ preview: string; width: number }>` (server-only; `sharp(bytes).rotate()`; `width` is the rotated source width; preview is 16 px wide WebP quality 40 as `data:image/webp;base64,…`; throw if it exceeds 2,000 characters)
- `fetchPublicBytes(url: string, opts?: { timeoutMs?: number; maxBytes?: number }): Promise<Uint8Array>` in `import-url.ts`: the same guarded lookup, redirect loop and `ImportError` codes as `fetchRecipePage`; defaults 5,000 ms and 8 MB; requires a `content-type` starting `image/` (else `ImportError('not_html')` is wrong here: add the code `'not_image'` to `ImportErrorCode`)
- `POST /api/meals/preview` body `{ mealId: string }`: `requireHousehold()`; load the meal through the caller's client (row-level security applies); source is a signed URL for `photo_path`, else `photo_url`; `fetchPublicBytes` then `makePreview`; `updateMeal(sb, id, { photo_preview, photo_width })`; responds `200 { preview, width }`, `404` no meal or no photo, `422 { error }` on `ImportError` or a decode failure, `400` on a bad body
- `ensurePreviews(meals: Pick<MealRow, 'id' | 'photo_path' | 'photo_url' | 'photo_preview'>[]): void` (browser): for each meal with a photo and no preview, POST once per meal id per page session, at most 3 at a time, swallowing every failure
- `bestPhotoUrl(url: string): string`: on hosts `img.spoonacular.com` and `spoonacular.com`, a size suffix `-90x90 | -240x150 | -312x150 | -312x231 | -480x360 | -556x370` before `.jpg | .jpeg | .png | .webp` becomes `-636x393`; every other URL is returned unchanged
- `setMealPhoto` also writes `photo_preview: null, photo_width: null` (a new photo needs a new preview)

- [ ] **Step 1: Write the failing tests.**
```ts
// best-url
expect(bestPhotoUrl('https://img.spoonacular.com/recipes/716429-312x231.jpg')).toBe('https://img.spoonacular.com/recipes/716429-636x393.jpg');
expect(bestPhotoUrl('https://img.spoonacular.com/recipes/716429-636x393.jpg')).toBe('https://img.spoonacular.com/recipes/716429-636x393.jpg');
expect(bestPhotoUrl('https://example.com/a-312x231.jpg')).toBe('https://example.com/a-312x231.jpg');
// photo-preview: build a 800×400 JPEG with sharp in the test
const out = await makePreview(jpeg); expect(out.width).toBe(800); expect(out.preview).toMatch(/^data:image\/webp;base64,/); expect(out.preview.length).toBeLessThan(2000);
await expect(makePreview(new Uint8Array([1, 2, 3]))).rejects.toThrow();
// import-url additions: fetchPublicBytes rejects a private address with 'blocked_host', a text/html reply with 'not_image', a body over maxBytes with 'too_large'
// jsonld addition: image: [{ '@type': 'ImageObject', url: 'a.jpg', width: 400 }, { '@type': 'ImageObject', url: 'b.jpg', width: 1600 }] → image ends 'b.jpg'; a list of plain strings still returns the first
```
Route test in `tests/unit/photo-preview.test.ts`, following the mocking style of `tests/unit/draft-route.test.ts`: 400 on `{}`; 404 when the meal has no photo; 422 when `fetchPublicBytes` throws `ImportError('blocked_host')`; 200 and one `updateMeal` call with `{ photo_preview, photo_width: 800 }` on success.
- [ ] **Step 2: Run** the four files. Expected: FAIL.
- [ ] **Step 3: Implement** the migration, modules and route; use `bestPhotoUrl` in `spoonacular.ts`'s `toOption`; in `jsonld.ts` prefer the widest `ImageObject` that states a numeric `width`.
- [ ] **Step 4: Call `ensurePreviews`** after a successful load in `useWeekData` and `FavoritesBrowser` (the existing realtime `meals` subscription then delivers the preview).
- [ ] **Step 5: Run** `npm run lint && npm run typecheck && npm test && npx playwright test e2e/week.spec.ts`. Expected: PASS; all existing `import-url` and `jsonld` tests unchanged and green.
- [ ] **Step 6: Commit** `feat(photo): store a tiny preview and the source width per meal, pick the largest photo a source offers`.

---

### Task 8: Sheet that follows the finger

**Files:**
- Modify: `components/Sheet.tsx`, `app/globals.css`
- Test: `e2e/sheet.spec.ts`

**Interfaces:**
- `<Sheet label onClose enter?: 'slide' | 'none'>` (props otherwise unchanged; still a modal `<dialog aria-label={label}>`, opened in `useLayoutEffect`).
- `useSheetClose(): () => void` (context): children call it so every close path plays the exit.
- Consumes: `velocity`, `shouldDismiss`, `prefersReducedMotion`.

Design: `bg-raised text-ink shadow-2 rounded-t-lg`, `max-h-[90dvh]`, `pb-[var(--bk-safe-bottom)]`, `overscroll-behavior: contain`; backdrop `rgb(var(--bk-scrim) / 0.5)`. A 44 px tall drag zone on top holds a 36 × 4 px `line-strong` bar (`aria-hidden`), `touch-action: none`. Enter: `translateY(100%)` to 0, `--bk-dur-slow`, `ease-snap`; backdrop fades over `--bk-dur-base`. Dragging (pointer events on the drag zone, and on the content when its `scrollTop` is 0 and the move is downward): the sheet's `transform` equals the finger's travel, 1:1, never above its resting place, no transition while held. Release: `shouldDismiss(drag, height, velocity)` plays the exit from where it is (`ease-snap`) then calls `onClose`; otherwise it returns with `ease-snap`. Escape, a backdrop tap and `useSheetClose()` play the same exit. The sheet takes taps from its first frame. Reduced motion: enter and exit are 120 ms opacity fades; dragging still works.

- [ ] **Step 1: Write the failing test** `e2e/sheet.spec.ts` (list item sheet, both phone projects; drive with `page.mouse`):
```ts
test('a short slow drag springs back', ...);      // down 60 px over 400 ms → dialog still visible, transform back to none
test('a drag past 30% dismisses', ...);           // down 40% of the sheet height, slowly → dialog count 0
test('a quick flick dismisses', ...);             // 80 px in 60 ms → dialog count 0
test('Escape and the backdrop still close it', ...);
test('with reduced motion the sheet fades and never translates', ...); // context reducedMotion: 'reduce'
test('a button inside the sheet works during the enter animation', ...); // click "Set price" immediately after opening
```
- [ ] **Step 2: Run** `npx playwright test e2e/sheet.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx playwright test e2e/sheet.spec.ts e2e/list.spec.ts e2e/week.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sheet): follows the finger, flicks away, same exit on every close`.

---

### Task 9: This week: tonight's hero, pinboard, budget sentence, every state

Read the mockup HTML first; its sizes are the spec. Motion comes in Task 10.

**Files:**
- Create: `components/MealTile.tsx`, `components/week/TonightHero.tsx`, `components/week/OpenDay.tsx`, `components/BudgetSentence.tsx`, `e2e/fixtures/food-wide.jpg` (800 × 400, made once with `sharp` from `e2e/fixtures/food.jpg`)
- Modify: `components/WeekScreen.tsx`, `lib/domain/weeks.ts`, `lib/domain/budget.ts`, `e2e/week.spec.ts`, `e2e/list.spec.ts`, `e2e/photo.spec.ts`, `e2e/helpers/fixtures.ts`
- Delete: `components/DayRow.tsx`
- Test: `tests/unit/weeks.test.ts`, `tests/unit/budget.test.ts`

**Interfaces:**
- `todayIn(timeZone: string, now?: Date): Day` in `lib/domain/weeks.ts`.
- `budgetSentence(totalCents: number, targetCents: number, cushionCents: number): { state: 'under' | 'wiggle' | 'past'; lead: string; amount: string; note: string; noteAmount: string | null }` in `lib/domain/budget.ts` (`budgetState` stays).
- `<BudgetSentence totalCents targetCents cushionCents costLink?: React.ReactNode totalTestId?: string />`: `<section aria-label="Budget">`, `text-small`, `.bk-price`; `amount` in bold; `note` in `ink-soft` on its own line; in `past` the `noteAmount` is `text-sale` and `costLink` follows.
- `<MealTile name photo preview? width? stamp?: string stampTone?: 'day' | 'tonight' note?: string favorite?: boolean onOpen?: () => void trailing?: React.ReactNode imgRef? flipKey?: string />`: `surface`, `rounded-md`; `<Photo crop="tile">` with the top corners rounded; stamp at 6 px from the top-left (`bg-surface text-ink text-label bk-caps px-1 py-0.5 rounded-xs`; `tonight` tone is `text-accent`); caption padding 8 / 10: name `text-small font-semibold line-clamp-2 break-words`, `note` in `text-label text-ink-soft line-clamp-1`, a `Bookmark` `<Icon size={18} label="Favorite">` in `text-accent` when `favorite`, then `trailing`. With `onOpen` the whole tile is one `<button className="bk-press">` whose accessible name is the name (and note).
- `<TonightHero day meal photo … onOpen onDemote imgRef />` and `<OpenDay day slot tonight?: boolean wide?: boolean />`.

Layout rules (decisions):
- Header: `ScreenHeader title="This week"`; action is a ghost button, `History` icon, `aria-label="Repeat a past week"`, visible text `Repeat a past week` from 380 px wide and `Repeat` below that.
- Tonight is `todayIn(household.time_zone)`. If tonight has a dinner with a photo and `photoVerdict('hero', photo_width)` is `'ok'`: the hero, full-bleed, directly under the header. It is a `<button>` inside `<div data-testid="day-row-{day}" data-tonight>`: `<Photo crop="hero" priority>`; over it (`data-on-photo`) a scrim `linear-gradient(rgb(var(--bk-scrim) / 0), rgb(var(--bk-scrim) / 0.8) 42%, rgb(var(--bk-scrim) / 0.92))` with padding 48 16 12; `Tonight · {dayName}` in `text-label bk-caps text-on-photo-accent`; the name in `font-display text-title text-on-photo line-clamp-2`; then one row in `text-label text-on-photo`: the day note left, `Photo: {credit}` right. Favorite bookmark top-right in `text-on-photo-accent`.
- If the photo demotes on load (`onDemote`), is a fallback, or is missing: tonight is an ordinary `MealTile` placed first in the pinboard with stamp `Tonight`, tone `tonight`.
- If tonight has no dinner: `<OpenDay tonight wide>` first, spanning both columns, 52 px, stamp `Tonight · {Sun}` in `text-accent`.
- Under the hero: one row, `text-small`: `<span data-testid="week-range">` (text exactly `formatWeekRange(…)`), then ` · {servings} servings each` in `ink-soft`; right, a `quietLink` to `/household`, `Who’s eating` with `ChevronRight` 18 hanging 4 px into the gutter (`-mr-1`).
- Pinboard: `<section aria-label="Dinners">`, two flex columns, gap 8, the other days in week order dealt left, right, left… Each is `<div data-testid="day-row-{day}" data-flip-key={day}>` holding a `MealTile` (stamp `Mon`…) or an `OpenDay`.
- `OpenDay`: a `Link` to `/week/add?day=&slot=`, 48 px, `rounded-md`, `border-[1.5px] border-dashed border-line-strong`, stamp left in `ink-soft`, `Plus` 18 and `Add dinner` right in `text-small font-semibold`.
- Bottom bar (`barAboveNav`): `BudgetSentence`, then `Build shopping list` as `mainAction` link to `/list`.
- Budget copy, exact: under: `In the basket so far: ` + **`$168 of $200`**, note `$32 left, plus $25 wiggle room if you need it.` (note is `$32 left.` when the cushion is 0). Wiggle: **`$212 of $200.`** note `$12 into the wiggle room.` Past: **`$236 of $200.`** note `$11 past the wiggle room.` with `$11` as `noteAmount`, and `costLink` = quiet link `See what costs most` to `/list?sort=cost`. No bar, pill, card, meter or red.
- Loading: `SkeletonTile crop="hero"` and four `SkeletonTile crop="tile"` in the two columns. Error: `ErrorBanner message="Couldn’t load this week." actionLabel="Try again"`. Repeat-week sheet: restyled with `Button`; strings curly.

- [ ] **Step 1: Write the failing unit tests.**
```ts
expect(todayIn('America/Los_Angeles', new Date('2026-11-27T07:30:00Z'))).toBe('thu'); // 11:30 pm Thursday in Tacoma
expect(todayIn('America/Los_Angeles', new Date('2026-11-27T08:30:00Z'))).toBe('fri');
expect(budgetSentence(16800, 20000, 2500)).toEqual({ state: 'under', lead: 'In the basket so far: ', amount: '$168 of $200', note: '$32 left, plus $25 wiggle room if you need it.', noteAmount: null });
expect(budgetSentence(16800, 20000, 0).note).toBe('$32 left.');
expect(budgetSentence(21200, 20000, 2500)).toMatchObject({ state: 'wiggle', lead: '', amount: '$212 of $200.', note: '$12 into the wiggle room.' });
expect(budgetSentence(23600, 20000, 2500)).toMatchObject({ state: 'past', amount: '$236 of $200.', note: '$11 past the wiggle room.', noteAmount: '$11' });
expect(budgetSentence(20000, 20000, 2500).state).toBe('under'); expect(budgetSentence(22500, 20000, 2500).state).toBe('wiggle');
```
- [ ] **Step 2: Update and add e2e.** In `e2e/week.spec.ts`: replace the `On budget` and `meter` assertions with `region "Budget"` containing `$0 of $200` and `$200 left`; curly apostrophes where selected. In `e2e/list.spec.ts` budget test, the week-side assertions become `into the wiggle room` and `past the wiggle room`. `routeFoodImages` gains `opts.wide?: RegExp` serving `food-wide.jpg`. New tests in `week.spec.ts`:
```ts
test('tonight with a wide photo leads as the hero', ...);   // add a dinner on today's day with a wide photo → [data-tonight] contains "Tonight", its box is full width and width / height is 2 (±0.02)
test('tonight with a small photo is a tile marked Tonight, never a hero', ...);
test('no dinner tonight shows the wide Add dinner row first', ...);
test('long names and big numbers fit at 360 px', ...);       // rename a meal through clientFor() to an 80-character word; set budget $10,000 and a $1,234 total; expect no horizontal scroll, the tile name at most 2 lines (height ≤ 40), the budget amount on one line
```
Enable the three `e2e/photo.spec.ts` tests.
- [ ] **Step 3: Run** unit and e2e. Expected: FAIL.
- [ ] **Step 4: Implement** the helpers, components and `WeekScreen`. Remove `components/WeekScreen.tsx` and the new files from `LEGACY_FILES`; add `/week` to `HEADER_DONE`; remove it from `CONTRAST_PENDING`.
- [ ] **Step 5: Run** `npm test && npx playwright test e2e/week.spec.ts e2e/photo.spec.ts e2e/layout.spec.ts e2e/a11y.spec.ts e2e/find-my-dish.spec.ts e2e/list.spec.ts`. Expected: PASS on all projects.
- [ ] **Step 6: Commit** `feat(week): tonight's dinner as the hero, two-column pinboard, budget as a sentence`.

---

### Task 10: This week in motion, and the dinner sheet as a recipe page

**Files:**
- Modify: `components/WeekScreen.tsx`, `components/MealSheet.tsx`, `components/add-meal/AddMealScreen.tsx` (one line: `markSettle(day)` before `router.push('/week')`), `components/FavoritesScreen.tsx` (same after a successful add)
- Test: `e2e/motion.spec.ts`

**Interfaces:**
- Consumes: `.bk-reveal`, `.bk-settle`, `staggerDelay`, `takeSettle`, `markSettle`, `newlyFilled`, `tick`, `useFlipList`, `morph`, `Sheet enter`, `Photo imgRef`, `Qty`.

Behavior (decisions):
- **Open reveal.** The first time week data arrives in a page session (a module-level flag), the hero gets `bk-reveal` with `--i: 0` and each pinboard item `--i: 1…` in week order. Never again in that session: not on realtime reloads, not on returning from Add a meal or a sheet, not on scroll.
- **A meal settles.** When data arrives and `takeSettle()` names a day that is now filled, or `newlyFilled(prev, next)` reports one (the other phone added it), that tile gets `bk-settle` for 560 ms. For the local add only, `tick()` fires 150 ms in. Other tiles move to their new places through `useFlipList(boardRef, signature)` where `signature` joins `day:mealId` pairs. Reduced motion: the tile fades in place (the tokens do this).
- **Dinner sheet reads like a recipe page.** `MealSheet` inside `Sheet`: `<Photo crop="hero">` edge to edge at the top (top corners `rounded-lg`), an `IconButton` `X` labelled `Close` over its top-right on `rgb(var(--bk-scrim) / 0.6)` in `text-on-photo`; then, in the gutter: the full name in `font-display text-title` (no clamp), `Photo: {credit}` in `text-label text-ink-soft`, the day note in `text-small`; `Open the full recipe` as a `quietLink` with a chevron; heading `Ingredients` (`text-heading`) with `Scaled to {n} servings` in `text-small text-ink-soft`, and the scaled lines (`scaleMeal`), name left and `<Qty>` right in `.bk-price`, separated by `line` hairlines; the leftovers row between hairlines with `Minus` and `Plus` `IconButton`s (labels `Fewer leftovers`, `More leftovers`); ghost buttons `Change photo`, `Save as a favorite` / `Remove from favorites` (with `Bookmark`), and `Take off {day}` in `text-error`; errors as `ErrorBanner`. All existing labels stay.
- **Photo grows into the sheet and back.** Opening: `morph({ from: tileImg, to: () => sheetImg, update: () => flushSync(() => setOpenDay(day)) })` and the sheet renders with `enter="none"` when `supportsViewTransitions()` and motion is not reduced; otherwise the sheet slides as in Task 8. Closing reverses it. The tile and the hero are live the moment they appear.

- [ ] **Step 1: Write the failing test** `e2e/motion.spec.ts`:
```ts
test('the week reveals once on open and not again after a sheet', ...);       // items carry bk-reveal with --i 0,1,2…; open and close a sheet; no element gains a new animation named bk-reveal (document.getAnimations())
test('a tap during the reveal opens the dinner', ...);                         // click a tile immediately after it appears → dialog visible
test('adding a dinner settles its tile', ...);                                 // after "Add to Friday", day-row-fri's tile has class bk-settle, and loses it within 1 s
test('reduced motion: 120 ms fades, no travel', ...);                          // reducedMotion: 'reduce' → computed animation-duration 0.12s; getComputedStyle --bk-move is 0
test('without view transitions a tile still opens and closes', ...);           // addInitScript(() => { delete (Document.prototype as any).startViewTransition }) → dialog opens, Close closes
test('the dinner sheet lists ingredients scaled for the household', ...);      // "Scaled to 3.8 servings" and at least one ingredient row
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Remove `components/MealSheet.tsx` from `LEGACY_FILES`.
- [ ] **Step 4: Run** `npx playwright test e2e/motion.spec.ts e2e/week.spec.ts e2e/sheet.spec.ts e2e/find-my-dish.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(week): staggered open, a meal settles into its day, photo grows into the dinner sheet`.

---

### Task 11: Proof tooling, and the week shown to the owner (checkpoint)

**Files:**
- Create: `scripts/proof/shoot.mjs`, `scripts/proof/record.mjs`, `scripts/proof/measure.mjs`, `scripts/proof/page.mjs`, `scripts/proof/README.md`, `docs/design/before/{iphone-17,pixel-7}/*.png` (copied from `/home/claude/basket-redesign/current/`)
- Modify: `package.json` (`"proof": "node scripts/proof/shoot.mjs && node scripts/proof/record.mjs && node scripts/proof/measure.mjs && node scripts/proof/page.mjs"`, devDependency `ffmpeg-static`), `.gitignore` (`/proof-out/`)

**What each script does (run against `http://localhost:3000`, signing in through `/api/test/login` and seeding one planned week the way `e2e/layout.spec.ts` does):**
- `shoot.mjs [screens…]`: launches **WebKit (iPhone 17: 402 × 874, scale 3) and Chromium (Pixel 7) at the same time**, one worker each. For each screen and each look (`localStorage['basket:look']`), injects that phone's insets (`--bk-safe-top/-bottom`: 62 / 34 for iPhone 17, 28 / 24 for Pixel 7) and saves `proof-out/after/{screen}-{device}-{look}.png` (viewport shot, plus a full-page shot). Screens and states: `week`, `week-empty`, `week-over-budget`, `week-long-names`, `week-loading`, `week-error`, `add-meal`, `search`, `recipe`, `favorites`, `favorites-empty`, `list`, `list-offline`, `list-empty`, `fred-meyer-prices`, `household`, `household-stores`, `onboarding`, `login`, `invite`. Screens not built yet are skipped with a printed note.
- `record.mjs`: with `recordVideo` at the device size, records one clip each for: week open reveal, a meal settling, photo into the dinner sheet and back, sheet drag and flick, a list item's strike and move, the budget total rolling, and the same six under reduced motion. Converts each `.webm` with `ffmpeg-static` to `proof-out/motion/{name}.mp4` and a quarter-speed `{name}-slow.mp4`.
- `measure.mjs`: for every screen in both looks: (1) every visible element's computed margin, padding and gap is in {0, 2, 4, 8, 12, 16, 24, 32, 48, 64} or one of the two tile exceptions (10, 6), else it is listed; (2) the left edge of every direct child of a `.bk-gutter` block equals the gutter; (3) font sizes are only 12, 14, 16, 18, 24, 34 (and 54 on `.bk-fallback-letter`); (4) text contrast as in `e2e/layout.spec.ts`; (5) saves 200% crops (`deviceScaleFactor` doubled, the screen cut into four) to `proof-out/zoom/`. Exits non-zero when 1–4 find anything.
- `page.mjs`: writes `proof-out/index.html`, one section per screen: before (from `docs/design/before/`, light only, because the old app had no dark mode) beside after in light and dark, iPhone 17 above Pixel 7, then the clips. Styled with the tokens.

- [ ] **Step 1: Write the four scripts and the README** (how to start the app with the CI env block, then `npm run proof`).
- [ ] **Step 2: Run** `npm run proof -- week week-empty week-over-budget week-long-names week-loading week-error`. Expected: files under `proof-out/`, `measure.mjs` exits 0.
- [ ] **Step 3: Look at every 200% crop** in `proof-out/zoom/` for the week. Fix any misalignment or uneven gap you find, re-run, and list what you fixed in the commit message.
- [ ] **Step 4: Remove one decorative thing** from the week screen and name it in the commit message (candidates: the hairline above the budget sentence, the favorite bookmark on the hero).
- [ ] **Step 5: Commit** `chore(proof): before/after shots in two browsers at once, motion clips, spacing and contrast measurements`.
- [ ] **Step 6: STOP. Hand `proof-out/index.html` to the controller for the owner.** The brief says the rollout to other screens starts after the owner approves the week. Do not begin Task 12 until told.

---

### Task 12: Add a meal: search, Find my dish, paste, favorites tab

**Files:**
- Modify: `components/add-meal/AddMealScreen.tsx`, `SearchTab.tsx`, `FindMyDish.tsx`, `PasteTab.tsx`, `e2e/week.spec.ts`, `e2e/find-my-dish.spec.ts`, `e2e/layout.spec.ts`

**Decisions:**
- Header: `IconButton` `X` labelled `Close` (link to `/week`), `<h1 className="font-display text-display">{Thursday} dinner</h1>`, top inset from `--bk-safe-top`.
- One level of tabs: `<Tabs label="How to add">` with `Search`, `Paste`, `Favorites`.
- The second segmented control goes. Under the search field, a `quietLink` button reads `Looking on: Big sites` (or `Spoonacular`) with a chevron and opens a `Sheet label="Where to look"` holding the existing `role="radiogroup" aria-label="Where to look"` as two rows (radio `Big sites`: `Recipe sites we trust`; radio `Spoonacular`: `A recipe database`); choosing closes the sheet. e2e: every test that picks a source first clicks `getByRole('button', { name: /Looking on/ })`.
- Search field: label `What’s for dinner?` (`TextField`, `Search` icon inside). Buttons: `Search` (`ghostButton`; the screen's filled main action is `Add to {day}`, which appears with a recipe) and `Find my dish` (`ghostButton`, `Camera` icon, at least 44 px).
- Results: a two-column grid, gap 8, of `button[data-testid="result-card"]` with the same `aria-label`; each is a `MealTile`-shaped tile: `<Photo crop="tile">`, `result-title` (`text-small font-semibold line-clamp-2`), `result-site` (`text-label text-ink-soft`), the time and rating line in `text-label`. Searching: the `ul[aria-label="Searching"]` holds six `SkeletonTile`s. Notes (`Nothing on the big sites…`) are `text-small text-ink-soft`. Errors are `ErrorBanner`. The Spoonacular credit link is a `quietLink`.
- `DishCard`: a 1:1 `rounded-sm` thumb of the person's photo, text beside it; its states keep their strings (curly).
- Paste: `TextField`-styled `<textarea>` (`text-body`, min height 128), button unchanged in name.
- Favorites tab: `FavoritesBrowser` as it stands (restyled in Task 14).
- Empty search (nothing typed yet): one sentence, `Search for a dinner, paste a recipe, or pick a favorite.`

- [ ] **Step 1: Update e2e selectors** for the curly label (`What’s for dinner?`), the source sheet, and any curly message this task touches (`grep -n "'" e2e/*.ts` for each). Add: `test('results are photo tiles in two columns', …)` (two `result-card`s share a top edge; each photo box is 8:5 ±0.02) and `test('one tab row only', …)` (`getByRole('tablist')` count is 1 and no `radiogroup` is visible until the source sheet opens).
- [ ] **Step 2: Run** `npx playwright test e2e/week.spec.ts e2e/find-my-dish.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the four files from `LEGACY_FILES`; add `/week/add` to `HEADER_DONE`; remove it from `CONTRAST_PENDING`.
- [ ] **Step 4: Run** those specs plus `e2e/layout.spec.ts e2e/a11y.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(add-meal): photo-led results, one row of tabs, source choice in a sheet`.

---

### Task 13: The recipe page (draft preview), and the photo growing into it

**Files:**
- Create: `components/add-meal/RecipePage.tsx` (replaces `DraftPreview.tsx`; keep the export `draftAsMeal`)
- Modify: `components/add-meal/AddMealScreen.tsx`, `IngredientEditor.tsx`, `SearchTab.tsx` (expose the tapped card's `<img>`), `e2e/week.spec.ts`, `e2e/find-my-dish.spec.ts`, `e2e/motion.spec.ts`
- Delete: `components/add-meal/DraftPreview.tsx`

**Interfaces:**
- `<RecipePage draft: RecipeDraft | null pending: RecipeOption | null people photoSrc onPhoto dishPhoto onDismiss onIngredients heroRef />` (same callbacks `DraftPreview` had).
- `SearchTab`'s `onPick(option: RecipeOption, img: HTMLImageElement | null)`.

**Decisions:**
- Tapping a result opens the recipe page at once: `AddMealScreen` sets `pending` to the option and calls `morph({ from: cardImg, to: () => heroRef.current, update: () => flushSync(() => setPending(option)) })`, then loads the draft. While it loads the page shows the option's photo and title, `SkeletonLines` where the ingredients go, and `Reading the recipe…` (`role="status"`). `Add to {day}` is disabled until the draft arrives. A failure shows `ErrorBanner` with the existing message and returns to the results.
- The page, top to bottom, inside `<section aria-label="Draft recipe">`: `<Photo crop="hero" priority>` full-bleed (when the photo demotes: `crop="tile"` inside the gutter with `rounded-lg`); name in `font-display text-title`; one row with `Your photo` or `Photo: {credit}` (`text-label text-ink-soft`) and ghost `Change photo`; `Check` `Use my photo for this meal` when offered; `quietLink` `Open the full recipe`; `Ingredients` (`text-heading`) with `Scaled to {n} servings`; lines with `line` hairlines, name left, `<Qty>` right in `.bk-price`; `quietLink` button `Edit ingredients`; the vegetarian swap as a sentence between hairlines with a `Leaf` icon (`Mom’s portion: black beans`, then `Chicken cut to 4 people` in `text-small text-ink-soft`), no tinted box; `Check` `Save as a favorite`. Ghost `Not this one` sits in the header row and runs the reverse `morph` back to the card.
- `barBottom`: `Add to {day}` as `mainAction`; while saving it keeps its width and reads `Adding…`.
- `IngredientEditor`: `TextField`s (`Name`, `Amount`, `Unit`, `Type` keep their labels), remove as `IconButton` `X`, rows split by hairlines, field errors under the fields.
- Paste and Find-my-dish drafts arrive with `.bk-fade-in` (no source photo to grow from).

- [ ] **Step 1: Update e2e** for curly strings (`Mom’s portion: black beans`), and add to `e2e/motion.spec.ts`: `test('a picked result shows its photo and title before the draft arrives', …)` (delay `/api/meals/draft` by 1.5 s with `page.route`; within 300 ms the `Draft recipe` region shows the option's `img` src and title and `Add to Thursday` is disabled; after, enabled) and `test('Not this one returns to the results', …)`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `LEGACY_FILES`.
- [ ] **Step 4: Run** `npx playwright test e2e/week.spec.ts e2e/find-my-dish.spec.ts e2e/motion.spec.ts e2e/layout.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(recipe): the draft reads like a recipe page; its photo grows from the card and back`.

---

### Task 14: Favorites

**Files:**
- Modify: `components/FavoritesScreen.tsx`, `components/FavoritesBrowser.tsx`, `e2e/week.spec.ts` (favorites tests), `e2e/layout.spec.ts`

**Decisions:**
- `ScreenHeader title="Favorites"`. The add message becomes a `Toast` (same strings, curly; `tone="bad"` uses `text-error`).
- Search: `TextField` with `Search` icon; label `Search favorites` stays (visually hidden), placeholder `Search meals or ingredients`.
- Filters (`role="group" aria-label="Filter"`): four `aria-pressed` buttons, 44 px, `rounded-md`, `text-small`; pressed is `bg-ink text-ground font-semibold`; others `ghostButton`. They scroll sideways in one row if they do not fit (no wrap, no scrollbar).
- List: two-column grid, gap 8; each `li[data-testid="favorite-row"]` is a `MealTile` (not a button) with `photo`, `preview`, `width`; `note` is `Made 3 times` joined to the tag as words (`Made 3 times · Vegetarian`, `· Veg swap`); `trailing` is `IconButton` `Plus` with the existing `addLabel`.
- States: loading is six `SkeletonTile`s (`aria-hidden`) with visually hidden `Loading favorites…`; error `ErrorBanner message="Couldn’t load your favorites." actionLabel="Try again"` (retry reloads); none saved: `EmptyState sentence="Nothing saved yet. Meals you keep will wait here."` with `ButtonLink` `Find a dinner` to `/week`; no match: `No favorites match that.`

- [ ] **Step 1: Update e2e** strings, and add `test('favorites are photo tiles; an empty list offers Find a dinner', …)`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Remove both files from `LEGACY_FILES`; `/favorites` into `HEADER_DONE`, out of `CONTRAST_PENDING`.
- [ ] **Step 4: Run** `npx playwright test e2e/week.spec.ts e2e/layout.spec.ts e2e/a11y.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(favorites): photo tiles, quiet filters, designed empty and error states`.

---

### Task 15: Shopping list: rows, store tabs, packshots, states, budget bar

**Files:**
- Modify: `components/ListScreen.tsx`, `ListRow.tsx`, `ListSheet.tsx`, `StoreTabs.tsx`, `app/(app)/list/page.tsx` (read `sort`), `e2e/list.spec.ts`, `e2e/fred-meyer-prices.spec.ts`, `e2e/layout.spec.ts`
- Delete: `components/BudgetMeter.tsx`

**Decisions:**
- `ScreenHeader title="Shopping list"`, the item count as `action` in `text-small text-ink-soft`.
- `StoreTabs` renders `<Tabs label="Stores">`: label is the store name, detail `{$42} · {4}` (so the accessible name still matches `/^Fred Meyer.*· 4$/`).
- Offline: `<OfflineStrip state="offline">` under the tabs while `list.offline`; when it turns false, `state="back"` for 2 s, then gone. e2e string becomes `Offline. Showing your last list.`
- Row (`li[data-testid="list-row"]`, `data-checked`, `data-flip-key={item.key}`, min height 52, a `line` hairline under it): `<Check label={"Got " + name}>`; then the button: `<Packshot>` for a Fred Meyer shelf price; name `text-small font-semibold line-clamp-2`; a line in `text-label text-ink-soft` with `<Qty>` and the ` · always have` / ` · outside budget` words; the product name `text-label text-ink-soft line-clamp-1`; right column, `shrink-0 text-right whitespace-nowrap`: the price in `.bk-price text-small font-semibold`, under it the source word in `text-label`: `Fred Meyer price` in `text-price`, `estimate` in `text-estimate`, `your price` and `no price yet` in `text-ink-soft`; on sale: `Tag` icon and `on sale` in `text-sale text-label` (no pill).
- Groups: aisle headings in `text-heading`, 24 above, 8 below. Ticked rows live in a last group headed `Got it · {n}` (`text-heading`), below the aisles and above `Skipped, you have them · {n}` (the `<details data-testid="skipped">` stays). The move itself is animated in Task 16; here it is immediate.
- `?sort=cost` (or tapping `See what costs most`): the store's rows as one list, dearest first, with a `quietLink` button `Back to aisles`.
- Bar (`div[data-testid="list-bar"]`, `barAboveNav`): `<BudgetSentence totalTestId="list-total" costLink=…>`; `{n} items without a price` in `text-label text-ink-soft`. The `list-total` element's text is the total alone (`$168`).
- States: loading `SkeletonLines` rows; error `ErrorBanner message="Couldn’t load your list." actionLabel="Try again"`; save failure `ErrorBanner message="Couldn’t save. Try again."`; nothing at all: `EmptyState sentence="Your list is clear."` with `ButtonLink` `Plan this week` to `/week`; nothing at this store: `Nothing to buy at {store} this week.`
- `ListSheet`: name in `font-display text-title`; the quantity and store in `text-small text-ink-soft`; actions as 48 px rows split by hairlines with a chevron (same names); the price form uses `TextField` (`Price`) and `Button variant="main"` `Save price`.

- [ ] **Step 1: Update e2e.** `list.spec.ts`: `Offline. Showing your last list.`; the empty text `Your list is clear.`; the budget test expects, in `list-bar` and the week's `Budget` region, `into the wiggle room` at $201, `past the wiggle room` at $226, and `left` after dropping back; rename the test `budget: the sentence changes at $201 and $226`. `fred-meyer-prices.spec.ts`: the product photo sits in an element with class `bk-packshot`; sale text is `on sale`. Add:
```ts
test('a ticked item moves to Got it', ...);                    // row ends inside the group headed /^Got it · 1$/
test('prices stay on one line beside a four-line product name at 360 px', ...);
test('See what costs most lists the dearest first; Back to aisles restores groups', ...);
test('back online says so for a moment', ...);                  // "Back online. Saved." appears, then count 0 within 4 s
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `LEGACY_FILES`; `/list` into `HEADER_DONE`, out of `CONTRAST_PENDING`.
- [ ] **Step 4: Run** `npx playwright test e2e/list.spec.ts e2e/fred-meyer-prices.spec.ts e2e/layout.spec.ts e2e/a11y.spec.ts e2e/sheet.spec.ts`. Expected: PASS, including the offline tests.
- [ ] **Step 5: Commit** `feat(list): rows that read at a glance, packshot tiles, offline strip, budget sentence bar`.

---

### Task 16: Shopping list in motion: the strike, the move, the rolling total

**Files:**
- Create: `components/RollingNumber.tsx`
- Modify: `components/ListRow.tsx`, `components/ListScreen.tsx`, `components/BudgetSentence.tsx`, `app/globals.css`
- Test: `e2e/motion.spec.ts`

**Interfaces:**
- `<RollingNumber value: string direction: 'up' | 'down' testId?: string />`: a visually hidden `<span aria-live="polite" data-testid={testId}>` holding `value`, updated once; beside it an `aria-hidden` row of characters from `rollDigits(prev, value)`. A character with `from` is a one-line-tall clipped column in which the old digit leaves and the new one arrives by `translateY` (upward for `'up'`), `--bk-dur-settle`, `ease-settle`, `transition-delay: {delayMs}ms`. Tabular figures. Reduced motion: the row crossfades over 120 ms.
- `BudgetSentence` renders the total through `RollingNumber` (direction from `rollDirection`), and gives the note a React `key` of its text with `.bk-fade-in` delayed 120 ms.

**Timeline for a tick (design-values, Signature 2):**
- 0 ms: tap; the check presses; `tick()`.
- 0–120 ms: the check mark draws (Task 4's `Check`).
- 60–300 ms: a 1.5 px `ink-soft` line wipes left to right across the name, as wide as the text: the name sits in a `relative inline-block max-w-full` span; over it an `aria-hidden` copy of the same text, transparent, with `line-through` (`text-decoration-thickness: 1.5px`, color `ink-soft`), revealed by `clip-path: inset(0 100% 0 0)` to `inset(0)` as a **transition** (`--bk-dur-base`, `ease-out`, 60 ms delay when ticking, none when unticking). The name's color eases to `ink-soft`. Class `.bk-strike`, toggled by `data-on`.
- 300–670 ms: the row joins `Got it`. `ListScreen` keeps `settled: Set<string>` that follows `checked` 300 ms later (0 under reduced motion); groups are built from `settled`; `useFlipList(listRef, signature)` slides the row down and its neighbors up with `ease-snap`.
- A second tap inside the 300 ms cancels the pending move; the transitions run back from where they are. `data-checked` always reflects the latest tap at once.

- [ ] **Step 1: Write the failing tests** in `e2e/motion.spec.ts`:
```ts
test('ticking draws the strike, then the row moves to Got it', ...);     // .bk-strike[data-on] within 100 ms; the row is still in its aisle at 150 ms; inside "Got it" by 1 s
test('tick then untick inside 300 ms leaves the row in its aisle, unticked', ...);  // checkbox unchecked, data-checked absent, row's group is the aisle, after 1 s
test('three fast taps end ticked and in Got it', ...);
test('the total rolls only the digits that changed', ...);                // set a price so $168 → $172: two columns animate (count elements with a running transition); list-total text is exactly "$172"
test('a total that gains a digit keeps the bar on one line', ...);        // $98 → $104
test('reduced motion: no transforms on the list; the total crossfades', ...);
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx playwright test e2e/motion.spec.ts e2e/list.spec.ts` on all projects. Expected: PASS (the realtime and offline list tests are the ones to watch).
- [ ] **Step 5: Commit** `feat(list): the strike draws as the item eases down; the total rolls to its new number`.

---

### Task 17: Household, with the Look setting and the store picker

**Files:**
- Modify: `app/(app)/household/HouseholdScreen.tsx`, `PersonEditor.tsx`, `components/PersonRow.tsx`, `components/StorePicker.tsx`, `components/LookPicker.tsx`, `components/household/{StoresSection,StaplesSection,AlwaysHaveSection,SignOutButton}.tsx`, `e2e/list.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/layout.spec.ts`, `e2e/look.spec.ts`

**Decisions:**
- `ScreenHeader title="Household"`. Sections sit on the ground, 32 apart, each with a `text-heading` title 8 above its content and rows split by `line` hairlines. No cards. Every section keeps its `aria-label`.
- Who’s eating: heading `Who’s eating · 3.8 servings` (curly; update the e2e heading selector). `PersonRow`: a 32 px `rounded-full` initial on `sunk`, the name in `text-body`, details in `text-small text-ink-soft`, a chevron; `+ Add person` is a `ghostButton`. `PersonEditor` stays inline, one open at a time, with `TextField`s and `Button`s.
- Weekly budget: two `TextField`s side by side (`Weekly budget`, `Wiggle room`), `.bk-price` in the inputs.
- Stores and sharing: 52 px rows, name and detail left, chevron right. `StorePicker`: `TextField` `ZIP code`, ghost `Search` and `Cancel`, results as hairline rows (name `text-body`, address `text-small text-ink-soft`), status text as today (curly). Invite: ghost `Invite`, the link in a read-only `TextField` (`Invite link`), `Copied…` as `text-small`.
- Where things come from: **one row per kind of food** (`Dairy and eggs` left, the chosen store and a chevron right; the row is a button named `{kind}, {store}`). It opens `Sheet label={kind}` holding `role="radiogroup" aria-label={kind}` with three radio rows (`Fred Meyer`, `Amazon`, `Costco`); choosing saves and closes. e2e: click `getByRole('button', { name: /Dairy and eggs/ })`, then the radio in the dialog, then expect the row to read `Costco`.
- Staples: hairline rows with `Switch`; `+ Add staple` ghost; the form uses `TextField`s; `Save staple` is `Button variant="ghost"`.
- Always have: rows with an `IconButton` `X` (`Remove {name}`); suggestions as `ghostButton`s that wrap; the add field keeps its label.
- Look: `LookPicker` as three radio rows, each with one line under it: `Light` (`Butter`), `Dark` (`Cast Iron`), `Match my phone` (`Follows your phone’s setting`).
- Account: ghost `Sign out`, the note under it in `text-small text-ink-soft`.
- This screen has no filled accent button (nothing here is the one main action).

- [ ] **Step 1: Update e2e** (curly heading, the food-kind sheet, anything else selected by a string this task makes curly).
- [ ] **Step 2: Run** `npx playwright test e2e/list.spec.ts e2e/onboarding.spec.ts e2e/look.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `LEGACY_FILES`; `/household` into `HEADER_DONE`, out of `CONTRAST_PENDING`.
- [ ] **Step 4: Run** those specs plus `e2e/layout.spec.ts e2e/a11y.spec.ts e2e/fred-meyer-prices.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(household): sections on the ground, store choice in a sheet, the Look setting`.

---

### Task 18: Onboarding, login and invite

**Files:**
- Modify: `app/onboarding/OnboardingForm.tsx`, `app/onboarding/page.tsx`, `app/login/LoginForm.tsx`, `app/login/page.tsx`, `app/invite/[token]/page.tsx`, `e2e/helpers/household.ts`, `e2e/onboarding.spec.ts`, `e2e/smoke.spec.ts`, `e2e/layout.spec.ts`

**Decisions:**
- All three: `bk-gutter`, top inset `--bk-safe-top`, title in `font-display text-display`, body on the ground.
- Login: `Basket` as the title, one sentence under it (`Plan the week’s dinners and the shopping, together.`), `TextField` for the email, `Email me a sign-in link` as `mainAction` (`Sending…` while busy), the Google button as `ghostButton`; `Check your email` in `font-display text-title`; errors as `ErrorBanner`.
- Invite failure: title `Invite`, the message in an `ErrorBanner`, and a `ButtonLink variant="ghost"` `Go to Basket` to `/week`.
- Onboarding: `TextField` `Household name`. **People are a list, edited one at a time:** saved people show as `PersonRow`-style rows (tap to reopen); exactly one `<fieldset>` editor is open, its legend `Person {n}` (so `getByRole('group', { name: 'Person 2' })` still finds the open one) with `Name`, `Age`, `Diet` and the appetite field; `+ Add person` (ghost) closes the open editor into a row when it has a name, and opens the next. `e2e/helpers/household.ts` `onboard()` already fills people in order; change it only if it reads a closed group. Budget: the two `TextField`s as in Household. `Start planning` is the `mainAction` in a `barBottom` (`Saving…` while busy). Errors as `ErrorBanner`.
- Add `/onboarding` and `/login` to `SCREENS` in `e2e/layout.spec.ts` (signed-out context for `/login`).

- [ ] **Step 1: Update e2e**, and add `test('onboarding shows one person editor at a time', …)` (after adding the second person, `getByRole('group', { name: /^Person/ })` count is 1 and the first person's name is visible as a row).
- [ ] **Step 2: Run** `npx playwright test e2e/onboarding.spec.ts e2e/smoke.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the files from `LEGACY_FILES`.
- [ ] **Step 4: Run the whole e2e suite** (every spec signs up through onboarding). Expected: PASS.
- [ ] **Step 5: Commit** `feat(onboarding): people as a list, login and invite in the new style`.

---

### Task 19: Edges: manifest, icons, splash, status bar

**Files:**
- Create: `scripts/icons/splash.mjs`, `public/splash/*.png`, `app/icon.svg`
- Modify: the manifest the launch plan shipped (`app/manifest.ts` or `public/manifest.webmanifest`, whichever exists), `public/icons/*` (overwrite, keeping the file names already there), `app/layout.tsx`, `e2e/pwa.spec.ts`

**Decisions:**
- Icons: the owner chose the "Dipped" icon (butter over radicchio, the Gloock B flipping color where it crosses the line). Its files are in `/home/claude/basket-redesign/icons/final/`. If `public/icons/` does not already hold them (compare bytes), copy `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` over the files there; copy `final/icon.svg` to `app/icon.svg`.
- Manifest: `theme_color` and `background_color` both `#F5E6A6`. (A manifest has one color, so the Android launch screen is Butter in both looks; the page's own `theme-color` then follows the look.)
- iPhone launch images: `splash.mjs` renders with Playwright, from the letter path in `icon.svg`, the ground color with the plain B (one color, no split ground) centered at 192 px tall, for light (`#F5E6A6`, letter `#4C1D3A`) and dark (`#191614`, letter `#E9B030`) at 1206 × 2622, 1320 × 2868, 1179 × 2556, 1290 × 2796, 1170 × 2532. Link them through `metadata.appleWebApp = { capable: true, title: 'Basket', statusBarStyle: 'default', startupImage: [...] }`, each with its `device-width`, `device-height`, `-webkit-device-pixel-ratio: 3` and `prefers-color-scheme` media query.
- `viewportFit: 'cover'` stays.

- [ ] **Step 1: Update `e2e/pwa.spec.ts`**: `theme_color` and `background_color` are `#F5E6A6`; add `test('the page head carries a theme-color for each look and ten launch images', …)`; add a check, decoding with `sharp`, that in the served `icon-512.png` the pixel at (16, 16) is `#F5E6A6` and the pixel at (16, 496) is `#4C1D3A`.
- [ ] **Step 2: Run** `npx playwright test e2e/pwa.spec.ts --project=pixel-7`. Expected: FAIL.
- [ ] **Step 3: Implement**, run `node scripts/icons/splash.mjs`, and open two of the PNGs to check them by eye.
- [ ] **Step 4: Run** `npx playwright test e2e/pwa.spec.ts e2e/look.spec.ts e2e/layout.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(edges): Butter manifest colors, the new icon, launch images per look`.

---

### Task 20: Clean-up and the full proof for the owner

**Files:**
- Modify: `app/globals.css` (delete the legacy alias block), `app/(app)/layout.tsx` (stop using `LegacyInset`), `e2e/layout.spec.ts` (delete `CONTRAST_PENDING`), `tests/unit/design-guard.test.ts`
- Delete: `components/MealThumb.tsx`, `components/LegacyInset.tsx`, any export of `lib/ui.ts` nothing imports

- [ ] **Step 1: Tighten the tests.** In the guard test add `it('nothing is left on the legacy list', () => expect(LEGACY_FILES).toEqual([]))` and a check that `app/globals.css` has no `LEGACY ALIASES` block. `grep -rn "MealThumb\|text-green\|text-muted\|bg-green" app components lib` must print nothing.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL until the leftovers are gone.
- [ ] **Step 3: Remove the leftovers** listed under Files.
- [ ] **Step 4: Run everything:** `npm run lint && npm run typecheck && npm test && npx playwright test`. Expected: PASS on `iphone-17`, `pixel-7`, `android-small`.
- [ ] **Step 5: Run `npm run proof`** for every screen and clip. `measure.mjs` must exit 0 (spacing, sizes, contrast).
- [ ] **Step 6: Review every 200% crop** in `proof-out/zoom/`, both looks, both phones. Fix what is off; re-run.
- [ ] **Step 7: Remove one decorative thing per screen** that does not carry meaning, and note each in the commit message.
- [ ] **Step 8: Check the audit, item by item**, against `proof-out/index.html` and write `proof-out/audit-check.md`: for each of the ten rows in `docs/design/audit.md`, the screens checked and the screenshot that shows it fixed. Also record the audit's two "also seen" notes: tab order now matches the mockups; the last row of Add a meal and Household scrolls clear of the bottom bar (covered by `e2e/layout.spec.ts`).
- [ ] **Step 9: Commit** `chore(design): remove the old style aliases; full before/after proof`, then hand `proof-out/index.html` to the controller.

---

## Self-review notes (done)

- **Spec coverage.** Brief: type (1), spacing (1, 11), color (1, 2), depth (1, 8), photos (6, 7), icons and corners (1, 4), every state (4, 9, 14, 15), edges (5, 19), motion language (3), press (1, 4), continuity (8, 10, 13, 16), three signature moments (10, 16), week reveal (10), reduced motion and haptics (3 and each motion task), proof steps 3–5 (11, 20). Audit items: 1 (9, 12, 14), 2 (9, 15), 3 (guard in 1, every screen task), 4 (1 and every screen task), 5 (1 and guard), 6 (2, 19), 7 (6, 7, 15), 8 (12, 17, 18), 9 (4, 5 and guard), 10 (3, 4 and every screen task).
- **Known limits, stated rather than hidden.** Spoonacular's largest photo is 636 × 393, so its photos cannot be sharper than that; other sites give more only when their recipe data lists a larger image. iOS Safari has no web haptics. The Android launch screen is Butter in both looks. Safe-area insets are exercised in tests by overriding the `--bk-safe-*` variables; a look on one real iPhone and one real Android phone is still worth doing before the owner sees it.
