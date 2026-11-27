# Phase (a) — how dinner went, who won't eat what, and what a saved meal keeps

*Design for the owner's OK. No code yet. Mockups: `phase-a-mockups.png` (one board) and 13 artboards in `canvas/project/` (numbers below match). Current look, **light only**: Basket has no dark mode until the visual redesign, which restyles these with everything else.*

## The test
A tired parent at 5 pm, one hand free. Each of these takes one tap or none:
- "How was dinner?" → **Everyone liked it**. Done.
- Searching for dinner → the card already says who won't eat it, or that it lists an allergen.
- Opening tonight's dinner → time, how it's cooked, and the rating are there without leaving the app.

## 1. Family verdicts

**When it asks.** The day after a dinner, a card appears on This week above Dinners (01). One dinner at a time, the most recent. It stays up to three days, then goes for good. Answering or tapping Skip removes it on both phones. It is never shown again for that dinner. With nothing to ask, there is no card and the week looks as it does today.

**Card copy.** "How was Wednesday's dinner?" · the meal name · **Everyone liked it** · **Not everyone** · Skip.

**Not everyone (02).** A sheet titled with the meal: "Who liked it? Answer for the kids too." Each person has **Liked it / Didn't like / Didn't try**, all starting on Liked it, so you only change who didn't. A line shows the result as you go ("4 of 5 liked it"). **Save**.

**After answering (04).** The card becomes one line for a few seconds: "**Saved.** Everyone liked Tuscan white bean soup." with **Change**.

**Changing it later.** The meal sheet gets a line: "Last time: 4 of 5 liked it" with **Change**, which opens the same sheet.

**In words, everywhere.**
| Case | Line |
|---|---|
| All who tried it liked it | Everyone liked it · last had Nov 22 |
| Some didn't | 4 of 5 liked it · last had Nov 25 |
| Someone didn't try | 3 of 4 liked it · 1 didn't try · last had Nov 3 |
| Made, never answered | Made 2 times · last had Nov 3 |
| Never made | Not made yet |
| On a search card you've made before | You've made this. Everyone liked it · last had Nov 22 |

"Of 5" counts people who tried it. Only the latest answer is shown; older ones are kept for the rule below.

**What verdicts change.** Favorites sorts liked meals first (03). A meal that most people who tried it disliked on its two most recent dinners drops to the bottom of Favorites and is never suggested by Plan my week; searching still finds it; one good dinner brings it back. No heading, badge or count marks it.

**Other states (04).** Very long name wraps to three lines. Failed save: "That didn't save. Try again." Offline: buttons off, "You're offline. This will keep until you're back."

## 2. Won't eat and allergies, per person

**Household (05).** Each person's row says what they won't eat ("Won't eat olives, cilantro"). An allergy gets its own line with a warning mark and the word: "Allergy: tree nuts". "No restrictions" shows only when a person has neither. Helper: "Tap a person to change what they won't eat or are allergic to."

**Editor (06).** Under the existing Name, Age, Diet, Appetite:
- **Won't eat** — "We'll point these out and offer to swap or leave them out." Chips with ×, an "Add a food" box and **Add**.
- **Allergies** — chips with ×, "Add an allergy" and **Add**. With none yet (07): "None. Tap one, or type your own." and the nine common ones as taps: peanuts, tree nuts, milk, eggs, wheat, soy, fish, shellfish, sesame.
- As a food is typed, its family is spelled out: "Mushrooms covers cremini, portobello, shiitake and the rest." "Tree nuts covers almonds, walnuts, pecans, cashews and the rest."
- Always shown under Allergies: "Basket only reads ingredient names, so it can miss things. Always check labels."
- Failed save: "That didn't save. Try again." (existing wording).

**Two people with the same name** (our two "Daughter" rows) are told apart by age wherever a name is used alone: "Daughter (4)".

**A dislike is an offer (08, 09, 10, 12).**
- Search card: "Has cremini mushrooms. Daughter (4) won't eat them."
- Draft and meal sheet: a grey box. "**Daughter (4) won't eat mushrooms**" / "This has 8 oz cremini mushrooms. Change it just for Daughter (4)?" → **Leave them out** · **Swap them** · Keep it as is.
- Leave out: the list buys less by that person's share, exactly as the vegetarian swap already does. The box turns green: "Daughter (4): no mushrooms" / "Mushrooms cut to 4 people" · Change.
- Swap (10): "Instead of mushrooms" / "For Daughter (4), in White bean and mushroom soup." Three ideas from a built-in list, each saying what it does to the list ("Adds 1 small zucchini to the list", "Already on the list"), plus "Or something else". "Mushrooms drop to four people's worth. We'll remember this for next time you make it." → **Swap for Daughter (4)** · Back.
- The choice is saved with the meal, so a favorite remembers it.

**An allergy is a warning (08, 11, 12).**
- Search card: "**Tree nut allergy: Daughter (4)**" / "Lists almonds. Check labels."
- Draft (11): the ingredient is marked in the list ("Sliced almonds · tree nut"), and a red-bordered box says "**Tree nut allergy: Daughter (4)**" / "This recipe lists **almonds**. Other ingredients can have nuts in them too, so check every label." The main button becomes **Pick a different dinner**; below it, **Add to Thursday anyway**.
- If added anyway, the day row and the meal sheet keep the warning (12). It can't be dismissed.
- No leave-out or swap is offered for an allergy: that would read as "now it's fine".
- Plan my week (phase c) never suggests a recipe that matches an allergy.
- Basket never says "safe", "nut-free" or "no allergens found". A recipe with no match simply has no flag.

**How matching works (plain logic, no AI).** A table of food families in the code: each family has its members and the prepared foods that usually contain it (pesto and marzipan under tree nuts; Worcestershire sauce under fish). A recipe matches when a family word appears in an ingredient's name, singular or plural. Typed foods outside the table match as typed.

## 3. What a saved meal keeps

When a meal is added, Basket now keeps its **steps**, **total time**, **how it's cooked**, and **rating**, from the recipe page's own structured data or from Spoonacular. Steps are stored on your household's copy only and shown with the source's name and link.

- Meal sheet and draft get one line (09, 11): "40 min · Stovetop · ★ 4.7 from 812 ratings" with **Edit**.
- **Edit (13)** — "Time and how it's cooked": "Start to table" minutes; Stovetop · Oven · Slow cooker · Pressure cooker · Grill · No cooking; "Can be made ahead". Below: "**Also saved with this meal**" / "7 steps and ★ 4.7 from 812 ratings, from Budget Bytes. Only your household sees the steps." **Save**.
- How it's cooked is read from the title and steps by plain word matching ("slow cooker", "bake at", "grill"); you can correct it.
- Meals you saved before: filled in quietly the next time Favorites or the week opens, a few at a time, by re-reading the recipe page. While that runs the line reads "Getting this recipe's time and steps…". If the page has none: "No time saved yet" with **Add**, and Open the full recipe stays.
- Pasted recipes: the one AI call that already reads the paste also returns the steps and time. At the AI cap, "Type it myself" opens a blank meal (fixes a known gap).
- Steps are saved now and first *shown* in Cook mode (phase f). Until then "Open the full recipe" is unchanged.

## Data (migration 0008, adds only)
- `people.allergies text[]` (new). `people.dislikes` already exists and becomes "won't eat".
- `meals`: `steps jsonb`, `total_minutes int`, `method text`, `make_ahead boolean`, `rating numeric`, `rating_count int`, `likes int`, `person_changes jsonb` (who, which food, leave out or swap-with).
- `meal_verdicts`: household, meal, the date eaten, answered or skipped, each person's vote. One row per dinner; members of the household read and write; pgTAP tests prove another household can't.
- Kids: nothing beyond the name and age already stored, plus these two lists. Nothing leaves the household.

## Built from what exists
`Sheet`, `MealThumb`, `pillButton`/`primaryButton`/`textInput` from `lib/ui.ts`, the segmented control from the search tab, the green swap box from the draft, chips from "Always have". New shared pieces, each small so the redesign restyles them once: `VerdictCard`, `VerdictSheet`, `FoodChips`, `MealFlags` (dislike box, allergy box, card lines), `MealFacts`. Pure logic in `lib/domain`: `families.ts`, `flags.ts`, `verdicts.ts`, `method.ts`, and `scaleMeal` learns `person_changes`.

**One change to an existing row:** on Favorites the "Vegetarian" tag moves under the name so the verdict fits on one line (03).

## Checks done on the mockups
Rendered in WebKit (402×874 @3x) and Chromium (412×915 @2.625x) side by side; every artboard viewed, densest ones at over 200%. Measured: lowest text contrast 4.62:1 (the existing "On budget" pill); every button, link, chip and input at least 44 px in both directions; no text under 11 px; nothing runs off the 402 px width; no sheet content clipped.

## Judgment calls made for you (and the cost if wrong)
| Call | If it's wrong |
|---|---|
| The card shows for three days, then never. | A missed dinner has no verdict until you set one from the meal sheet. Cheap to lengthen. |
| "Of N" counts only people who tried it. | The line reads differently than you expect; one function to change. |
| "Disliked twice" = most who tried it, on the two most recent dinners. | A meal sinks too soon or too late; one function. |
| Allergy match never offers swap or leave-out. | An extra tap ("Add anyway", then edit ingredients) when you cook around it. Chosen for safety. |
| Prepared foods that usually contain an allergen are flagged ("often has"). | Some false alarms on pesto, granola and the like. Chosen over missed warnings. |
| Names that repeat get the age in brackets. | Slightly clumsy copy; renaming a person removes it. |
| Steps saved privately with credit and link, reversing "steps stay on the source site". | If you'd rather not keep copies, Cook mode falls back to the source page plus ingredients and timers. |
| Favorites tag moves under the name. | A small look change before the redesign; easy to undo. |
| Dislike swaps from a built-in list, not AI (question 3). | Ideas feel generic; AI suggestions can be added behind the same sheet. |
