# Basket audit: the ten things that most make it look unfinished

Source: today's test-run screenshots in `current/iphone-17` and `current/pixel-7` (week, add-meal, search, favorites, household, household-stores, list, list-offline, fred-meyer-prices, onboarding) and a read of `app/globals.css`, `app/layout.tsx` and `components/**`.

**Dark screenshots were not taken.** The app has no dark mode (no `dark:` classes, one fixed `themeColor`), so they would be identical to the light ones. The two sizes show the same problems; nothing below is specific to one phone.

Ranked, worst first.

| # | Screens | What's wrong | Fix direction |
|---|---|---|---|
| 1 | week, favorites, search, add-meal | Food is nearly absent. The week shows no photo at all when empty and a 48 px thumb when planned; search and favorites use 64 px squares; the one large photo sits boxed inside a card. | Photos lead: `--bk-crop-hero` for tonight, `--bk-crop-tile` on the pinboard, search and favorites; text sits under the photo, not beside it. |
| 2 | week, list | The budget is a dashboard: a card, a big number, a progress bar and an "On budget" pill. It is the first thing on the main screen. | A sentence in kitchen words in `text-small`, with the amount in bold tabular figures. No bar, pill or card. |
| 3 | all | Every group is a white card with a 1 px grey border, so screens read as stacked boxes. Corners come in seven values (5, 8, 10, 12, 14, 16 px and full pills) with no rule. | Content sits on the ground; `surface` only for photo tiles and the nav. Four radii tied to element size (`--radius-xs` to `-lg`); no pills. |
| 4 | all | Type has no scale: 15 different sizes in the code (9 to 36 px), most text at 12, 13 or 15 px. No tabular figures, so prices don't align; straight apostrophes; quantities as decimals ("11.2 oz", "3.8 servings"). | Six sizes only (`--text-display` to `--text-label`), 12 px floor. `.bk-price` for price columns, `.bk-qty` for fractions, curly quotes in copy. |
| 5 | all | One green does everything (main button, links, active tab, pills, checkbox, input focus), and the neutrals are a plain grey-green. About 20 hex colors are hard-coded in components outside the eight CSS variables. | One accent per mode, kept to the main action, the active tab and the "Tonight" label. Neutrals tinted toward butter or cast iron. All color through tokens. |
| 6 | all | No dark mode, and the edges are unfinished: one `themeColor`, no web manifest, no app icon beyond `favicon.ico`, no splash. | `data-look` light / dark / auto; `theme-color` per mode; icon and splash from the same palette (see design-values.md, Edges). |
| 7 | fred-meyer-prices, add-meal, favorites | Photos have no shared treatment. The store-product tile is an empty white bordered box; a missing photo becomes green "Add a photo" text at 9 px; nothing shows while a photo loads. | `.bk-photo` filter on every recipe photo, `.bk-packshot` tile with multiply, blurred color preview, and the designed fallback tile. |
| 8 | add-meal, search, household-stores, onboarding | Controls are stacked like a settings form: two segmented controls on top of each other in add-meal, eight identical three-way switches in a column under "Where things come from", five identical "Person" form cards in onboarding. | One level of tabs per screen; the store choice becomes a single row per food kind that opens a sheet; people become a list, edited one at a time. |
| 9 | all | Icons are hand-drawn inline in four stroke weights (1.5, 2, 2.2, 2.4), and the favorite star is a filled amber shape unlike the rest. | Lucide only, 1.75 stroke, 20 and 22 px, always `currentColor`. |
| 10 | all | States and motion are missing. There is no pressed state anywhere and no transitions (the only motion is a loading pulse). Offline is one grey line of text. Favorites with one meal and the list with four items leave most of the screen blank. Long product names wrap to four lines beside the price. | Every tappable gets `.bk-press`; the three durations and two springs; designed empty, offline, error, long-name and over-budget states (design-values.md, States). |

## Also seen, not in the ten
- The tab order is Week, List, Favorites, Household; the mockups use This week, Favorites, List, Household, as briefed. Decide one.
- In the full-page captures of add-meal and household, the fixed bottom bars are drawn over content mid-page ("Add to Thursday" covers "Edit ingredients"). This may only be how a full-page capture draws fixed bars; check on a phone that the last rows can scroll clear of the bar.
- The lower half of week, favorites and both list screens is empty in the test data, so real spacing between sections could not be judged there.
