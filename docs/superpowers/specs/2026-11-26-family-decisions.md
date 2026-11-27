# Owner decisions, 2026-11-26 6:07 PM PT
- Q1 Allergen recipe: A, can be added after a clear warning ("Pick a different dinner" is the main button, "Add anyway" is below; the dinner stays marked). Owner chose.
- Q2 "How was dinner?": A, a card on This week the day after, for up to 3 days. Owner chose.
- Q3 Dislike swaps: A, a built-in list plus "type your own", no AI. Owner chose.
- Q7 Reminders: A, Supabase scheduler plus a narrow security-definer function behind a cron secret. Owner chose.
- Q4, Q5, Q6, Q8: the controller ruled the recommended option A (not asked; reversible; owner time saved). Q4: a disliked meal stays in Favorites at the bottom and is never suggested. Q5: order a,b,c,e,d,f,g,h. Q6: Spoonacular most-liked with plain rules, no AI. Q8: leftovers stay in the same week only.
- Visual approval of the phase (a) mockups (canvas 50edaf90): APPROVED by the owner 18:10.
- Favorites rows carry allergy and won't-eat flag lines: YES, owner confirmed 18:30.

## Controller rulings after the plan revision (19:10)
- Favorites one-tap "+" on a recipe that matches an allergy opens the same allergy warning (main button "Pick a different dinner", then "Add anyway"). This applies the owner's Q1 answer ("after a clear warning") everywhere a recipe is added. A won't-eat match keeps the one-tap add with its flag line.
- M13: when one dinner has several allergens, name each allergy with its people: "Tree nuts: Daughter (4) · Sesame: Grandma Bernadette-Marguerite". This is a safety clarity change to the approved artboard 12; the owner is told.
- Swap copy "Adds zucchini to the list" (no amounts), and the six first-swap guesses pinned in Task 2, are accepted.
- Spoonacular terms on storing steps: the controller checks before a2 (Task 10 Step 6); the fallback is to keep the link and credit only.
