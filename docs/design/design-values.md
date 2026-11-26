# Basket design values: how to use them

All values live in `round2/tokens.css`. Paste it into `app/globals.css` after `@import "tailwindcss"` (it replaces the current `:root` and `@theme inline` blocks). Raw values are `--bk-*`; the `@theme inline` block exposes them to Tailwind v4 as utilities (`bg-ground`, `text-ink-soft`, `text-small`, `rounded-md`, `shadow-2`, `aspect-tile`, `ease-settle`). Components should use the utilities and never a hex value.

## Look: light, dark, or match my phone
- Set `<html data-look="light | dark | auto">`. Light is Butter, dark is Cast Iron, `auto` follows the phone.
- The choice is per person. Store it per user (and mirror it in `localStorage` so an inline script in `<head>` can set the attribute before first paint and avoid a flash).
- Nothing else changes between modes: type, spacing, corners, layout and motion are shared.

## Color
| Token | Butter | Cast Iron | Use |
|---|---|---|---|
| `ground` | #F5E6A6 butter | #191614 cast iron | the page |
| `surface` | #FFFBEC flour | #231F1B seasoned pan | photo-tile captions, bottom nav, inputs |
| `raised` | #FFFDF6 cream | #2E2923 warm steel | things that float: sheets, menus, toast |
| `sunk` | #EBD88F crust | #110F0E soot | wells, the area behind a loading photo, the fallback tile |
| `ink` | #2B1422 aubergine | #F3EDE0 basmati | text |
| `ink-soft` | #62414F fig skin | #B9AE9C oat | secondary text, "estimate" |
| `line` | #DCC98A straw | #3A332E clove | hairlines between things on the same level |
| `line-strong` | #8C6E6A | #80766B | borders that carry meaning: ghost buttons, inputs, the dashed open day |
| `accent` | #4C1D3A radicchio | #E9B030 turmeric | see rule below |
| `sale` (+`sale-tint`) | #9A3412 paprika | #FF9070 roast tomato | sale price text; tint behind a "was" note |
| `error` (+`error-tint`) | #A8123A beet | #FF9DAE rhubarb | error text; tint behind an error banner |
| `price` | #275E36 pea shell | #A6C97C cilantro | the words "Fred Meyer price" (a real shelf price) |
| `estimate` | = ink-soft | = ink-soft | the word "estimate" |
| `packshot` | #FFFBEC | #EDE5D3 | the tile behind a store product shot (light in both modes) |

Rules
- **One accent, three places:** the screen's main action (filled), the active tab, and the "Tonight" label. Never for links in running text (those are `ink`, semibold, with a chevron or underline), never for decoration.
- Sale, error and price colors are for text and small icons only, always with the word ("on sale", "Fred Meyer price", "estimate"). Color never carries the meaning alone.
- No plain grey, white or black anywhere. If a new neutral is needed, mix it from `ground` and `ink`.
- Text on a photo uses `on-photo` over the scrim (`rgb(var(--bk-scrim) / .8)` or more behind the text). Measured on the mockup's hero: worst case 6.7:1 (Butter label), 4.7:1 (Cast Iron label), 10:1 or more for the dish name.

### Contrast (WCAG ratio; all text pairs must be ≥ 4.5)
### Butter

| Text | On | Ratio |
|---|---|---|
| ink #2B1422 | ground #F5E6A6 | 13.67 |
| ink #2B1422 | surface #FFFBEC | 16.53 |
| ink #2B1422 | raised #FFFDF6 | 16.83 |
| ink #2B1422 | sunk #EBD88F | 12.03 |
| inkSoft #62414F | ground #F5E6A6 | 7.01 |
| inkSoft #62414F | surface #FFFBEC | 8.48 |
| inkSoft #62414F | raised #FFFDF6 | 8.64 |
| inkSoft #62414F | sunk #EBD88F | 6.18 |
| onAccent #F5E6A6 | accent #4C1D3A | 10.85 |
| onAccent #F5E6A6 | accentPress #3A152C | 12.66 |
| accent #4C1D3A | ground #F5E6A6 | 10.85 |
| accent #4C1D3A | surface #FFFBEC | 13.12 |
| sale #9A3412 | ground #F5E6A6 | 5.83 |
| sale #9A3412 | surface #FFFBEC | 7.05 |
| sale #9A3412 | saleTint #FBE3C8 | 5.89 |
| error #A8123A | ground #F5E6A6 | 5.96 |
| error #A8123A | surface #FFFBEC | 7.20 |
| error #A8123A | errorTint #FBDDDD | 5.86 |
| price #275E36 | ground #F5E6A6 | 6.11 |
| price #275E36 | surface #FFFBEC | 7.39 |
| estimate #62414F | ground #F5E6A6 | 7.01 |
| estimate #62414F | surface #FFFBEC | 8.48 |
lineStrong (non-text): ground 3.68, surface 4.45

### Cast Iron

| Text | On | Ratio |
|---|---|---|
| ink #F3EDE0 | ground #191614 | 15.44 |
| ink #F3EDE0 | surface #231F1B | 14.03 |
| ink #F3EDE0 | raised #2E2923 | 12.35 |
| ink #F3EDE0 | sunk #110F0E | 16.39 |
| inkSoft #B9AE9C | ground #191614 | 8.23 |
| inkSoft #B9AE9C | surface #231F1B | 7.48 |
| inkSoft #B9AE9C | raised #2E2923 | 6.58 |
| inkSoft #B9AE9C | sunk #110F0E | 8.74 |
| onAccent #191614 | accent #E9B030 | 9.19 |
| onAccent #191614 | accentPress #CF9A22 | 7.12 |
| accent #E9B030 | ground #191614 | 9.19 |
| accent #E9B030 | surface #231F1B | 8.35 |
| sale #FF9070 | ground #191614 | 8.12 |
| sale #FF9070 | surface #231F1B | 7.38 |
| sale #FF9070 | saleTint #3B211A | 6.68 |
| error #FF9DAE | ground #191614 | 9.16 |
| error #FF9DAE | surface #231F1B | 8.33 |
| error #FF9DAE | errorTint #3A1C22 | 7.81 |
| price #A6C97C | ground #191614 | 9.66 |
| price #A6C97C | surface #231F1B | 8.78 |
| estimate #B9AE9C | ground #191614 | 8.23 |
| estimate #B9AE9C | surface #231F1B | 7.48 |
lineStrong (non-text): ground 4.05, surface 3.68

Every text pair passes 4.5:1 in both modes, so no pair relies on the large-text allowance. `line-strong` is a border, not text, and meets the 3:1 needed for a control's edge. `line` is decorative and is not relied on to find anything.

## Type
Two families: **Gloock** (`font-display`) and **Figtree** (`font-sans`). Load both with `next/font/google` (Gloock 400; Figtree 400, 600, 700).

| Token | Size / line | Tracking | Weight | Family | Use |
|---|---|---|---|---|---|
| `text-display` | 34 / 38 | −0.012em | 400 | Gloock | one screen title per screen |
| `text-title` | 24 / 28 | −0.006em | 400 | Gloock | tonight's dish, sheet and recipe titles |
| `text-heading` | 18 / 24 | −0.004em | 700 | Figtree | section headings, the list total |
| `text-body` | 16 / 24 | 0 | 400 (700 on buttons) | Figtree | reading text, inputs, buttons |
| `text-small` | 14 / 20 | +0.004em | 400 or 600 | Figtree | tile names (600), notes, the budget sentence |
| `text-label` | 12 / 16 | +0.02em (+0.08em in caps) | 600 or 700 | Figtree | day stamps (caps), photo credits, tab labels |

Rules
- Six sizes, no others. 12 px is the floor. Gloock is never set below 24 px and never bold.
- Caps only for `text-label` day stamps and the "Tonight" label.
- Inputs are `text-body` (16 px) so iOS does not zoom on focus.
- Prices in a column: `.bk-price` (tabular figures), right-aligned. Prose figures stay proportional.
- Quantities: write ½ ¼ ¾ ⅓ ⅔ as real characters where the value is one of those; otherwise wrap only the number in `.bk-qty` (`1 1/2` becomes a built fraction). Do not put `.bk-qty` on a whole line: it also shrinks ordinary digits (found on the specimen and fixed).
- Curly quotes and apostrophes in all copy (Who’s eating, “Mom’s pick”); en dash in ranges (Nov 29 – Dec 5).

## Spacing
- One scale: 2, 4, 8, 12, 16, 24, 32, 48, 64 px (Tailwind `0.5, 1, 2, 3, 4, 6, 8, 12, 16`). No other values.
- Screen gutter 16. Gap between pinboard tiles 8. Inside a tile caption 8 top and bottom, 10 sides is the one exception, so caption text lines up with the day stamp's text.
- Between sections 24 or 32; a section title sits 8 above its content.
- Touch targets 44 minimum (`--bk-tap`), 52 for the main action (`--bk-tap-main`), 8 between neighbors.
- Align to what the eye sees: text edges line up with photo edges at the gutter; a trailing chevron hangs 4 px into the gutter so its stroke, not its box, meets the edge.

## Corners
| Token | Radius | Element's shorter side |
|---|---|---|
| `rounded-xs` | 2 | under 28: checkboxes, day stamps |
| `rounded-sm` | 4 | 28–56: thumbs, inputs, packshot tiles |
| `rounded-md` | 6 | 56–200: buttons, pinboard tiles |
| `rounded-lg` | 10 | over 200: a hero inside a gutter, sheets (top corners only) |

A full-bleed photo has no radius. Nested corners: inner radius = outer radius − the padding between them, never below 0. `rounded-full` only for avatars and the switch thumb.

## Light and depth
- One light, straight above. Shadows fall down only: no glows, no side offsets.
- A shadow is allowed only on something that floats over other content: `shadow-1` a tile lifted by a long press, the toast; `shadow-2` sheets and menus; `shadow-3` a tile being dragged.
- Things on the page (tiles, buttons, the nav, the build-list bar) get no shadow. They separate by `surface` against `ground`, or a `line` hairline.
- Butter shadows are tinted warm brown (the shade butter casts), in two or three layers. Cast Iron shadows are black and stronger, plus a 1 px inner top highlight, because a shadow alone barely reads on a dark page; floating things also step up to `raised`.

## Photos
- **Crops:** hero 2:1 (tonight's dinner, recipe page top), tile 8:5 (pinboard, search, favorites), thumb 1:1 (list rows, pickers, packshots). Nothing else. 8:5 was chosen because the recipe photos arrive at 636 × 393, almost exactly 8:5, so the standard tile loses nothing. This replaces the first pinboard's free shapes: the uneven look now comes from open days and from one- or two-line names, not from mixed crops.
- **Treatment:** `.bk-photo` on every recipe photo. Butter: a touch more saturation and contrast and 6% sepia to pull different sites toward one warm set. Cast Iron: the same, 10% darker, so white plates don't glare.
- **Loading:** store a tiny preview (16 px wide, or one average color) with each meal. Show it scaled up with `--bk-photo-blur` over `sunk`, then crossfade the real photo in over `--bk-dur-base`.
- **Fallback:** if there is no photo, it fails to load, or its source is under `--bk-photo-min-tile` (300 px) wide: a `sunk` tile with the dish's first letter in Gloock at 54 px in `ink-soft` and "Add a photo" in `text-small` 600 below. A source under `--bk-photo-min-hero` (600 px) is never used as the hero; fall back to showing tonight as a normal tile row.
- **Store product shots:** `.bk-packshot`, a `packshot`-colored tile with the image inset 12% and blended with multiply, so a white background takes the tile's color. The tile stays light in Cast Iron (multiply needs a light base); `rounded-sm`.
- Always show the credit where the photo is large: "Photo: Foodista" in `text-label`.
- No illustrated or generated food, ever.

## Icons
- **Lucide** (`lucide-react`), and nothing else. Stroke 1.75, round caps and joins, `currentColor`.
- Sizes: 18 inside buttons and rows, 22 in the tab bar, 24 standalone.
- Tabs: `calendar` (This week), `bookmark` (Favorites), `list-checks` (List), `users` (Household). Others in use: `history` (repeat a past week), `plus`, `chevron-right`, `search`, `x`, `check`, `tag` (sale), `wifi-off`, `triangle-alert`.
- No filled icons. A saved favorite is shown by the `bookmark` in `accent`, not by a fill. No emoji.

## States
| State | Design |
|---|---|
| Pressed | `.bk-press`: scale to 0.97 (0.94 for icon-only buttons) over 120 ms, back on release with `ease-snap`. Filled accent buttons also switch to `accent-press`. It starts on pointer-down, so it never waits for the tap to finish. |
| Focus (keyboard) | 2 px `accent` outline, 2 px offset. |
| Disabled | 45% opacity, no press effect; say why nearby in `text-small`. |
| Loading | Photo: blurred preview (above). Text rows: `sunk` bars at the text's own line height, fading 60% ↔ 100% over 1.2 s; under reduced motion they hold still. Buttons keep their label and width and show "Building…". |
| Empty | One sentence and one action, on the ground, no illustration. Open day: dashed `line-strong` tile, day stamp, "+ Add dinner". Favorites: "Nothing saved yet. Meals you keep will wait here." with "Find a dinner". List: "Your list is clear." with "Plan this week". |
| Error | `error-tint` banner at the top of the affected area, `triangle-alert` icon, what happened and one action ("Couldn’t save. Try again."). Field errors sit under the field in `error`. Never a red full-screen. |
| Offline | A `sunk` strip under the title: `wifi-off` icon, "Offline. Showing your last list." Checkboxes still work; the strip changes to "Back online. Saved." for 2 s and leaves. |
| Very long names | Tile names clamp to 2 lines, list rows and the hero title to 2 lines, with an ellipsis; the full name is on the recipe or item sheet. Prices never wrap or shrink: the name column gives way. |
| Over budget | Still a sentence, no red. Within wiggle room: "$212 of $200. $12 into the wiggle room." in `ink`. Past it: "$236 of $200. $11 past the wiggle room." with the amount in `sale` and a quiet "See what costs most" link. |

## Edges
- **Safe areas.** Use `--bk-safe-top/-bottom/-left/-right`; each is the larger of the device inset and a floor. On iPhone 17 the top inset is about 59–62 px (Dynamic Island) and the bottom 34 px (home indicator); on a Pixel 7 with gesture navigation the top is about 24–32 px and the bottom 16–24 px; with three-button navigation the bottom inset is 0 and the 8 px floor applies. Keep `viewportFit: "cover"`.
- Put the top inset on the screen header and the bottom inset inside the tab bar's padding (so the bar's `surface` color runs to the bottom edge). Today the insets are on `body`, which leaves a strip of ground color under the tab bar.
- The build-list bar sits directly above the tab bar; scrolling content gets bottom padding equal to both.
- **theme-color:** `#F5E6A6` (Butter) and `#191614` (Cast Iron). Emit two `<meta name="theme-color">` tags with `media="(prefers-color-scheme: …)"` for `auto`, and set the tag from script when the person picks Light or Dark. Tab bar color differs from `ground`, so on Android also set the navigation bar color through the manifest `background_color` only; do not try to match the tab bar.
- **App icon:** a butter `#F5E6A6` square with a Gloock capital "B" in radicchio `#4C1D3A`, optically centered, filling about 56% of the height; maskable version keeps the letter inside the middle 60%. No basket drawing, no gradient. A dark variant (cast iron ground, turmeric letter) for the iOS dark icon slot.
- **Splash:** the ground color of the person's mode with the same "B", nothing else; it hands off to the week's staggered reveal. Needs a web manifest (`name`, `short_name` "Basket", `display: standalone`, `background_color` `#F5E6A6`, `theme_color`), which the app does not have yet.
- Not designed in this round: the icon and splash as image files.

## Motion
**Language.** Three durations: `fast` 120 ms (press, color), `base` 240 ms (fades, enters, exits), `slow` 400 ms (sheets, a photo growing into its page). Two springs, written as CSS `linear()` so they run on the compositor without a library:
- `ease-snap`: stiffness 600, damping 48, mass 1; 370 ms; no overshoot. Default for anything that moves: sheets, reordering, press release.
- `ease-settle`: stiffness 230, damping 22, mass 1; 560 ms; one soft overshoot of 3.6%. Only for the three signature moments.
- `ease-out` (`cubic-bezier(.2,.8,.2,1)`) for opacity and color.

Rules
- Animate only `transform` and `opacity` (plus `clip-path` for the strike). Nothing animates layout.
- Nothing blocks a tap: animations are interruptible and the element is live from its first frame.
- Nothing over 400 ms except the three signature moments.
- Week open: tiles fade up 8 px with a 40 ms stagger (hero first, then reading order, at most 8 steps, about 560 ms in all). On open only; never on scroll or on return from a sheet.
- Continuity: photo-to-recipe uses the View Transitions API with a shared `view-transition-name`, `slow` + `ease-snap`. Sheets track the finger 1:1, and release with `ease-snap`; a flick faster than 0.5 px/ms or a drag past 30% dismisses. Reordered tiles slide aside with `ease-snap`.
- Haptics: `navigator.vibrate(8)` where it exists (Android) at the moments marked below; iOS Safari has no web haptics, so nothing there.
- **Reduced motion:** `tokens.css` swaps every spring for a 120 ms linear fade, sets the stagger to 0, the press scale to 1 and `--bk-move` to 0 (multiply every travel distance by it). Position changes become crossfades.

### Signature 1: a meal settles into its day (560 ms)
| Time | What happens |
|---|---|
| 0 ms | Sheet starts closing (`slow`, `ease-snap`). The open-day tile's dashed border fades out over `fast`. |
| 0–560 ms | The new tile enters from 12 px above at scale 1.04 with `shadow-1`, moving to rest with `ease-settle` (it dips about 4% past its place and returns). |
| 0–240 ms | The tile's opacity 0 → 1 (`ease-out`); its photo crossfades from the blurred preview. |
| ~150 ms | Haptic tick as it first reaches its place. Tiles below slide down with `ease-snap`. |
| 300–560 ms | `shadow-1` fades to none: it has landed. |
| Reduced motion | The tile fades in in place over 120 ms; neighbors jump. |

### Signature 2: the strike-through draws as the item eases down (about 670 ms)
| Time | What happens |
|---|---|
| 0 ms | Tap. Checkbox presses (`fast`); haptic tick. |
| 0–120 ms | The check mark draws inside the box (stroke-dashoffset). |
| 60–300 ms | A 1.5 px line in `ink-soft` draws left to right across the name (`clip-path` inset from the right, `base`, `ease-out`), the width of the text, not the row. The name fades to `ink-soft`. |
| 300–670 ms | The row slides down to the "Got it" group with `ease-snap` (370 ms) while the rows it passes slide up one place. |
| Any time | Tapping again reverses from where it is. |
| Reduced motion | Check and line appear with a 120 ms fade; the row crossfades to its new place. |

### Signature 3: the budget total rolls (560 ms)
| Time | What happens |
|---|---|
| 0 ms | The cart changes. Only digits that change move; "$", "of $200" and unchanged digits hold still. Tabular figures keep widths fixed. |
| 0–560 ms | Each changing digit is a column: the old digit rolls out and the new one in (up when the total rises, down when it falls) with `ease-settle`, staggered 30 ms from the right-most digit. |
| 120–360 ms | The "left" sentence crossfades to its new wording (`base`). |
| End | If the total crosses the budget, the over-budget sentence replaces it with the same crossfade. No color flash, no shake. |
| Accessibility | The total is one `aria-live="polite"` text node updated once at the start; the rolling digits are `aria-hidden`. |
| Reduced motion | The number crossfades over 120 ms. |

Recordings of these three do not exist yet: they need the running app (brief step 3).
