# Phase (b) — leftover nights and busy nights

*Design for the owner's OK. No code yet. Mockups: `b-mockups.png` (one board) and 10 artboards in `canvas/project/` (numbers below match). Current look, **light only**: Basket has no dark mode until the visual redesign, which restyles these with everything else.*

## The test
A tired parent at 5 pm, one hand free.
- "We're having Wednesday's jambalaya again on Friday" → open Wednesday, **Cook double**, **Cook double**. Two taps. Friday is filled, and it costs nothing.
- "Tuesdays are soccer" → mark it once. Every Tuesday after that, dinner ideas start with the quick ones.
- Nothing asks, reminds or counts. A slow dinner on a busy night is allowed and gets no comment.

## 1. Leftover nights

**Cook double (01).** On a planned dinner, the old "Leftovers: +0 servings" row with its − and + buttons is replaced by one row: "**Leftovers night**" / "Cook once, eat it twice." and the button **Cook double**.

**Pick the night (02).** A sheet titled "Cook double": "Chicken sausage jambalaya on Wednesday. Buy and cook twice as much, then eat it again." Under "Eat the leftovers on" is one choice per later night:
- Only nights after the cooking night, in the same week, at most four days later. Each says how far away it is: "The next night", "2 days later", "3 days later", "4 days later".
- A busy night says so ("3 days later · busy night") and is picked first when it's free, because leftovers are the quickest dinner there is. Otherwise the first free night is picked.
- A night that already has a dinner can't be picked and says what's there: "Falafel burgers is planned" (06).
- Last choice: "**No set night**" / "For lunches, or whenever". This doubles the dinner without putting leftovers on the week.
- A green note says what happens: "Friday adds nothing to the list and nothing to the budget." With a vegetarian swap: "Mom's kidney beans double too." With no set night it reads "The list gets twice the ingredients."
- "Leftovers are best within 3 to 4 days."
- **Cook double**.

**On the week (03).** The cooking night's line ends "· cooking double". The leftovers night shows the same photo, the name "**Leftovers**" and "Chicken sausage jambalaya, from Wednesday". The budget goes up once, for the doubled dinner. The leftovers night adds nothing.

**The leftovers night (04).** Tapping it opens "Leftovers" / "Friday dinner": the meal, "Cooked Wednesday, 2 days before", and "Nothing to buy for Friday. It's all on Wednesday's list, Mom's kidney beans too." Two buttons:
- **Move to another night** opens the same picker, titled "Move the leftovers", with **Move** (06).
- **Take off Friday**, under the line "Taking it off puts Wednesday back to the usual amount."

**The cooking night afterwards (05).** Where the Cook double row was, a green box: "**Cooking double**" / "Leftovers on Friday" with **Change**. Change opens the picker with Friday chosen and one more button, **Back to the usual amount**. Taking the cooking night off the week takes the leftovers off with it, and says so above the button: "Friday's leftovers come off too."

**Rules.**
| Case | What happens |
|---|---|
| The cooking night is removed | Its leftovers night is removed too. The sheet says so before the tap. |
| A different dinner is put on the cooking night | The leftovers night is removed (it would be leftovers of the wrong meal). |
| A different dinner is put on the leftovers night | That night becomes a normal dinner. The cooking night stays doubled, with "No leftovers night. Extra for lunches." |
| The leftovers night is taken off | The cooking night goes back to the usual amount. |
| The cooking night is the week's last night | The picker offers only "No set night" and says: "Saturday is the last night of this week, so there's no later night for leftovers. You can still cook double for lunches." |
| Repeat last week | The doubled dinner and its leftovers night are both copied, still linked. |
| Favorites "+" | Skips a leftovers night, like any filled night. |
| "Fits this week" | Ignores leftovers nights. |
| "How was dinner?" (phase a) | Never asked about a leftovers night. "Last had" dates don't count it. |
| A recipe with an allergy warning (phase a) | The leftovers night keeps the same warning, on the row and in its sheet. |
| Extra servings set with the old + button | They stay. The box reads "Cooking 2 extra servings" / "For leftovers, no set night" with Change (05). New extras are always a double. |
| Someone joins or leaves the household after doubling | The doubled amount stays as it was set, as extra servings do today. Change → Cook double again resets it. |

**Other states (05, 06).**
- Both phones: the two rows arrive on the other phone within a second or two. If the other phone fills the chosen night first: "Saturday was just taken. Pick another night." Nothing is doubled twice.
- Failed save: "We couldn't change that. Try again." (the sheet's existing wording). If the dinner doubled but the leftovers night didn't save, the box reads "No leftovers night" and Change sets one.
- Offline: the buttons are off, with "You're offline. Connect to change this week."
- Loading: none of its own. Everything the sheets need is already on the week.
- Very long name: the leftovers row wraps to three lines.

## 2. Busy nights

**Marking them (07, 08).** Under the week's dinners, one line: "Busy nights: Tue and Thu" with **Change** (with none: "No busy nights this week" / **Mark busy nights**). It opens a sheet, "Busy nights": "Busy nights get quick dinners: 30 minutes or less, slow cooker, or make-ahead." Each night has three choices, and a tap saves at once:
- **Not busy**
- **This week** (this week only)
- **Every week** (every Tuesday, until changed)

A line sums it up: "Every Tuesday, and this Thursday." **Done** closes.

**On the week (07).** A busy night has the word "Busy" under its day. An empty busy night reads "+ Add a quick dinner".

**Adding dinner on a busy night (09).** The add screen opens with a box at the top: "**Thursday is a busy night**" / "Showing quick dinners only." and a tick box, ticked: “Quick dinners only”. It is the same control Staples uses.
- Search results show only recipes that take 30 minutes or less, cook in a slow cooker, or can be made ahead. A slow-cooker or make-ahead recipe says so in green under its time, so a 6-hour chili isn't a surprise.
- Under the results: "5 more take longer, or don't say how long." with **Show all 9**.
- The Favorites tab is filtered the same way: "5 of your 14 favorites are quick." with **Show all 14** (10).
- Unticking it turns the filter off for this dinner only: "Showing every dinner." Next time it starts on again.
- Pasting a recipe or typing one in is never filtered.

**What counts as quick (plain logic, no AI).** One rule, used here and by Plan my week (phase c):
1. the saved or stated time is 30 minutes or less, or
2. it's a slow-cooker recipe (read from the title and steps, as phase a does), or
3. it's marked "Can be made ahead" (phase a's editor), or the recipe's title says make-ahead, overnight or freezer.

A recipe that doesn't say how long it takes is not quick. It's hidden with the rest and counted in "don't say how long".

**Other states (10).**
- Nothing quick in the results: "None of these 8 are quick, or they don't say how long they take." / **Show all 8**.
- No favorites are quick: "None of your favorites are marked quick yet." / **Show all 14**.
- A slow dinner planned on a busy night: allowed. Its line gains the time ("Everyone vegetarian · 1 hr 10 min") so it's visible, and nothing else is said.
- Every night busy: "Busy nights: every night".
- The sheet didn't save: the choice snaps back, with "That didn't save. Try again."
- Offline: the choices are off, with "You're offline. Connect to change this week."
- Loading: the line appears with the week. On the add screen the box appears once this week has been read; if that fails there is no box and nothing is filtered.
- Both phones: the last tap on a night wins; the other phone's week updates by itself.
- A leftovers night on a busy night is always fine and is never filtered.

## Data (migration 0010, adds only)
- `households.busy_days text[]` (new, empty by default): the nights that are busy every week. Members may update it.
- `weeks.busy_days text[]` (new, empty by default): the nights that are busy this week only. `weeks` joins the live-update list so the other phone sees the change.
- `week_meals.leftover_of uuid` (new, empty by default): on a leftovers night, the cooking night it comes from. One leftovers night per cooking night. Deleting the cooking night deletes it.
- Two small database rules keep this true whichever phone, or an old copy of the app, makes the change: a leftovers night must be in the same week and of the same meal as its cooking night; and changing the meal on a cooking night removes its leftovers night.
- No new table. Both existing tables already have row-level security; pgTAP tests prove another household can't read or change the new columns, or hang a leftovers night on someone else's dinner.
- A leftovers night is saved with zero servings as well, so a phone that hasn't updated yet still buys nothing for it.
- Nothing about people is stored or sent anywhere. No AI, no paid calls.

## Built from what exists
`Sheet`, `MealThumb`, `pillButton`/`primaryButton` from `lib/ui.ts`, the segmented control from the search tab, the radio rows and green "done" box from phase (a). New shared pieces, each small so the redesign restyles them once: `CookDoubleRow` (the ask and the done box), `LeftoverNightSheet` (the picker, for both "Cook double" and "Move"), `LeftoverRow`, `LeftoverSheet`, `BusyLine`, `BusyNightsSheet`, `BusyBanner` (with the same on/off control Staples uses). Pure logic in `lib/domain`: `leftovers.ts`, `busy.ts`.

**One change to an existing control:** the − / + leftovers stepper on the meal sheet goes away (question 2).

## Checks done on the mockups
Rendered in WebKit (402×874 @3x) and Chromium (412×915 @2.625x) side by side, then both again at 360 px wide; every artboard viewed. Measured: lowest text contrast 4.99:1; every button, link, radio, tick box and input at least 44 px in both directions; no text under 11 px; nothing runs off the side or is clipped at 402, 412 or 360 px; no sheet content clipped.

## Judgment calls made for you (and the cost if wrong)
| Call | If it's wrong |
|---|---|
| Leftovers are always a full second dinner (double), never "+2 servings". | A family wanting a little extra buys a whole second dinner or nothing. The old extras still work; the stepper can come back beside Cook double (question 2). |
| Leftovers only on a later night of the same week, at most four days on (owner's Q8 plus the 3–4 day rule). | Cooking Saturday for Monday isn't possible when the week starts Sunday. "No set night" covers it roughly. |
| A night that's already planned can't be picked for leftovers. | One more step: take that dinner off first. Chosen so nothing is replaced by accident. |
| Taking the leftovers night off un-doubles the cooking night (question 3). | If you'd already shopped, the list shows less than you bought. Harmless. |
| One leftovers night per cooking night. | No triple batches. Rare. |
| A dinner can't be moved, only taken off and added again; only leftovers have "Move". | "Moves with it" from the brief becomes "comes off with it, and says so". A general Move button is a bigger change to the week screen that the redesign should own. |
| The doubled amount is fixed when set. | A guest added later isn't doubled. Same as today's extra servings. |
| Busy is a list of nights with three choices each; there is no "usually busy, but not this week". | On a free Tuesday the quick filter starts on; one tap turns it off. |
| A recipe with no time is treated as not quick. | Some fast recipes are hidden behind "Show all". Chosen over showing slow ones on a busy night. |
| The quick filter also covers the Favorites tab (question 4). | An extra tap to reach a slow favorite on a busy night. |
| The quick filter works on what the search already returned; it doesn't ask the recipe sites for quick recipes. | Sometimes few quick results. No extra paid searches. Asking Spoonacular for a maximum time is a small later change. |
| "Make ahead" on a search result is read from the title only. | Some make-ahead recipes aren't recognised until saved and ticked. |
| The tick isn't remembered between dinners. | One tap each time you want everything on a busy night. |
