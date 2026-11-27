# Owner decisions, 2026-11-26 6:07 PM PT
- Q1 Allergen recipe: A, can be added after a clear warning ("Pick a different dinner" is the main button, "Add anyway" is below; the dinner stays marked). Owner chose.
- Q2 "How was dinner?": A, a card on This week the day after, for up to 3 days. Owner chose.
- Q3 Dislike swaps: A, a built-in list plus "type your own", no AI. Owner chose.
- Q7 Reminders: A, Supabase scheduler plus a narrow security-definer function behind a cron secret. Owner chose.
- Q4, Q5, Q6, Q8: the controller ruled the recommended option A (not asked; reversible; owner time saved). Q4: a disliked meal stays in Favorites at the bottom and is never suggested. Q5: order a,b,c,e,d,f,g,h. Q6: Spoonacular most-liked with plain rules, no AI. Q8: leftovers stay in the same week only.
- Visual approval of the phase (a) mockups (canvas 50edaf90): APPROVED by the owner 18:10.
- Favorites rows carry allergy and won't-eat flag lines: YES, owner confirmed 18:30.

## Phases b-h (owner, 20:02)
- All 60 screens for phases b, c, e, d, f, g, h are APPROVED as drawn (canvas 50edaf90, pages b-h).
- All 28 design questions: use the designers' recommended answer (each phase's questions.md, the option marked "recommended").
- h: both, the usuals first (h1), then day-by-day (h2).
- d: a real sale is at least 10% under the median of what the product actually cost in earlier weeks (sale price if it had one, else regular), not the regular tag.
- Controller rulings from the designer reports: c's weekly price collection moves to d (c Q1 = A). The b branch is family-b, cut from fm-cart. Cron names are shared by d and g (cron_ok, cron_secret, app_url, CRON_SECRET, /api/cron/*); whichever ships first sets them up. c's artboard 04 copy uses "It goes on the list too." (no pronoun stored).
