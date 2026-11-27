Add ten family meal-planning features to Basket, my family's live meal-planning and grocery app. Keep every existing feature, all saved data and every test working. Ship in small phases I can use on my phone as each one lands.

WHERE THINGS STAND (check, don't assume)
- Live at https://basket-ashy.vercel.app. Code: github.com/zdstjohn/basket (Next.js 16, TypeScript, Tailwind, Supabase, Vercel; Vitest, Playwright and pgTAP tests; CI on GitHub Actions).
- Read first: docs/superpowers/specs/ (the design, the Fred Meyer cart spec, the premium-pass brief, the post-launch backlog) and docs/design/ (design values and tokens). Then read the code and try the live app.
- Already built: a weekly dinner plan, recipe search across big recipe sites and Spoonacular with ratings ("Most loved"), Find my dish from a photo, favorites, automatic vegetarian swaps, age-scaled portions, a shopping list with real Fred Meyer prices, "Check off all", an offline list, and install on iPhone and Android.
- Being built or queued ahead of you: Fred Meyer products and cart (a real product for every item, whole-package prices, add to cart after a review screen) and a "Fits this week" sort (ingredient overlap with the week's other meals). Change code only after the Fred Meyer cart is live. If "Fits this week" isn't live by then, build it first.
- A visual redesign (Butter in light mode, Cast Iron in dark) comes AFTER these features. Build new screens in the current look, using the existing shared components so they're easy to restyle later. Don't restyle existing screens. Then update the redesign plan (docs/superpowers/plans/2026-11-26-premium-pass.md) so it covers every screen you add.
- Gaps you'll hit: a saved meal keeps its ingredients, vegetarian swap, photo and source link, but not the recipe's steps, cooking time or rating. Each person has only an age, a diet and an appetite. Only the dinner slot is used. There are no notifications yet.

WHO IT'S FOR
Two parents and three kids (8, 6 and 4) near Tacoma. Mom is vegetarian and the main user. One phone is an iPhone, the other an Android. Groceries run about $200 a week, flexible. We shop at Fred Meyer most, and Amazon/Whole Foods and Costco sometimes. Later we'll share the app with friends' families, so everything must work per household.

THE TEST FOR EVERY FEATURE
A tired parent at 5 pm, with one hand free, gets what they need in a few seconds. Planning the week takes a couple of minutes, not twenty. Use kitchen words only. Nothing nags, guilts or keeps score.

THE FEATURES

1. Plan my week for me
- One tap proposes dinners for every open night. It never replaces a dinner that's already planned.
- It draws on our favorites and family verdicts first, then most-loved recipes we haven't tried. Suggest about one new recipe a week unless I ask for more.
- It respects the weekly budget and wiggle room, Mom's vegetarian swaps, each person's dislikes and allergies, busy nights, leftover nights, and what's on sale. It reuses ingredients across the week so perishables get used up.
- Variety: no main protein or cuisine two nights running, and no meal from the last two weeks unless we marked it a regular.
- The proposal is a draft. Each night shows a few words on why it was picked, and the week shows its estimated total. I can swap any night ("Try another"), then tap "Use this week". Nothing is saved before that.
- Score with plain logic I can follow, and use AI sparingly. When the AI cap is reached it still works from favorites.

2. Busy-night tags
- I can mark a night as busy for one week or every week (for example, every Tuesday).
- Busy nights only get meals of 30 minutes or less, slow-cooker meals or make-ahead meals. Search on a busy night starts with that filter on, and I can turn it off.
- This needs each saved meal to keep its total time and cooking method.

3. Prep reminders
- Reminders come from tonight's and tomorrow's dinner: thaw, marinate, soak, start the slow cooker by a set time.
- Work out a meal's prep steps once, when it is saved, from its recipe steps. Let me edit or turn off each one.
- By default send one evening summary, plus timed reminders only when timing matters. Respect quiet hours. Each person opts in on their own phone, and turning it off is easy.
- Send phone notifications to the installed app on iPhone and Android. Show the same reminders inside the app for anyone who hasn't allowed notifications.

4. Family verdicts
- After a dinner's day has passed, ask once, lightly, how it went. One tap covers "everyone liked it". Otherwise each person gets thumbs up, thumbs down or didn't try, and parents answer for the kids. It can be skipped and is never asked twice.
- Favorites and search results show the verdict in words, like "4 of 5 liked it · last had Nov 12".
- Liked meals come up more often. A meal most of us disliked twice stops being suggested unless I search for it. Verdicts are easy to change later.

5. Dislikes per person
- Each person gets a "won't eat" list and a separate "allergy" list.
- A recipe containing one of those is flagged with who and what. For a dislike, offer to swap it or leave it out for that person, the way the vegetarian swap works. For an allergy, never suggest the recipe in Plan my week, and warn clearly everywhere else.
- Never say a recipe is safe for an allergy. Say to check labels.
- Match ingredient families: mushroom covers cremini and portobello, and tree nuts cover almonds and walnuts.

6. Cook from the sales
- Show what's on sale this week at our Fred Meyer among foods families cook with (proteins, produce, dairy, pantry). Show recipes that use them, with an honest "saves about $X" worked out from real regular and sale prices for whole packages.
- As far as we know, Kroger's public API has no weekly-ad feed. Check that, then design around its call limits: refresh a fixed basket of common foods once a week per store, cache it, and share it across households that use the same store.
- Only call it a sale when it's real: at least 10% under the usual price, using the price history the cart work logs. The design doc has the exact rule.
- Feed sales into Plan my week and into search.

7. Leftover nights
- "Cook double" on a dinner buys enough once and adds a linked "Leftovers" night on a day I pick.
- The leftover night adds nothing to the list and costs nothing in the budget. Mom's swap portion doubles too.
- If the first dinner moves or is removed, the leftover night moves with it or tells me. Suggest eating leftovers within 3–4 days.

8. Use it up
- I say what's about to go bad, by typing it or picking from recent list items. The app finds recipes that use the most of it, reusing the "Fits this week" scoring.
- For that week only, those items count as "I have it" on the list, so we don't buy them again.
- This is not a pantry inventory.

9. Cook mode
- From tonight's dinner, show one step per screen in large type. Each step shows its ingredients with amounts already scaled to our family, and calls out Mom's swap where it applies.
- The screen stays on. Timers found in the step text ("simmer 20 minutes") start with one tap, keep running across steps, and ring when done.
- It works offline once opened, with big buttons for messy hands.
- Steps come from the recipe page's own structured data or from Spoonacular. Keep them private to the household, with the source credited and linked. If a recipe has no steps, open the source page and keep the ingredients and timers.
- Save steps when a meal is added, and fill them in for meals we've already saved.

10. Breakfasts, lunches and lunchboxes
- Each household can turn on breakfast and lunch slots.
- "Repeating basics" are defined once: weekday breakfasts, and a school lunchbox per kid built from a short pick list of mains, sides and snacks. They flow into each week's list in the right amounts and into the budget.
- School days can be adjusted each week for days off and holidays.

RULES
- Never order, spend, or put anything in a cart without my review and my tap.
- Use official APIs only, and respect each service's limits and terms. No scraping beyond the existing recipe-page import and its safety checks.
- Each household sees only its own data. Every new table gets access rules, with tests proving another household can't read or change it. Database changes only add things, and nothing existing breaks.
- Keep the kids' information minimal and inside the household.
- AI goes through the existing AI layer and its $3-a-month household cap. Prefer plain logic. Do AI work once, when a meal is saved, and store the result. Every AI-backed feature must still work in a simpler way when the cap is reached.
- Money is in whole cents and whole packages, so totals match the receipt.
- Design: follow docs/design. That means the type scale, the spacing scale, one accent, and every state designed (empty, loading, error, offline, very long names). No dashboards, stat tiles, streaks, badges or progress rings. Touch targets are at least 44 px. It must work on iPhone 17 and common Android phones, in light and dark.
- Test everything: unit tests for the scoring, access tests for the database, and phone-size end-to-end tests using the existing fakes. CI stays green.

NOT IN SCOPE
Calorie or macro tracking, a full pantry inventory, barcode scanning, coupons without an official API, automatic ordering, Amazon or Costco cart work, and anything social.

HOW TO WORK
1. Read the code and docs first. For each feature, tell me what already exists that it can build on and what's missing. Flag anything in this prompt that conflicts with what's there.
2. Ask me questions one at a time, and only questions whose answer changes what gets built. Give your recommended answer with each.
3. Propose the order. My suggestion:
   a. Family verdicts and Dislikes, plus saving steps, time and rating on meals
   b. Busy nights and Leftover nights
   c. Plan my week
   d. Cook from the sales
   e. Use it up
   f. Cook mode
   g. Prep reminders
   h. Breakfasts, lunches and lunchboxes
   Change the order if the code says otherwise, and tell me why.
4. For each phase, write a short design and make polished phone-size mockups, light and dark, of anything I'll look at. Wait for my OK before building.
5. Build each phase in small reviewed steps. Use Sonnet or Haiku for helper agents, and Fable as reviewer and advisor on the hard parts. Review the whole phase before release.
6. Release each phase to the live app when its tests pass. Tell me in plain words what's new and what to tap to try it.
7. Tell me as early as possible exactly what I need to set up (accounts, keys, phone settings), with links and steps.
8. Keep a list of every judgment call you make for me, with what it costs if it's wrong.
9. Send time-stamped updates about once an hour. Check that something is actually running before saying so. Suggest faster paths when they don't hurt quality.
