# Build order for the ten family features

*Starts after the Fred Meyer cart is live (v0.2.0) and "Fits this week" is in. Hours are rough build-and-review hours for helper agents with a Fable review, not calendar time. Every phase: migrations only add; each new table gets RLS and pgTAP tests proving another household can't read or write it; unit tests for pure logic; phone-size e2e with the existing fakes; design and mockups approved before code; release when CI is green.*

## Order

**a → b → c → e → d → f → g → h.** One change from the prompt's order: **Use it up (e) moves ahead of Cook from the sales (d).** Reasons: (e) is the smallest phase and reuses the overlap scoring while it is fresh from (c); (d) needs price history that only began with the cart work, so each week it waits makes "real sale" more honest. Price collection for (d) starts silently in (c). If the owner says no (question 5), swap them back; nothing else depends on it.

| Phase | Scope | Data (migration) | AI use and cost | Size |
|---|---|---|---|---|
| **a. Verdicts, won't eat and allergies, meal facts** | After-dinner card and per-person sheet; verdict lines on Favorites and search; per-person "won't eat" and "allergy" editor; flags with leave out / swap (dislike) and warning (allergy) on search cards, draft, meal sheet, day row; every saved meal keeps steps, total time, method, rating; backfill for older meals; backlog I6 "Type it myself". | **0008**: `people.allergies text[]`; `meals` + `steps jsonb`, `total_minutes int`, `method text`, `make_ahead bool`, `rating numeric`, `rating_count int`, `likes int`, `person_changes jsonb`; new `meal_verdicts`; close backlog T4 (default privileges). | None new. Pasted recipes: the one existing parse call also returns steps and minutes (about +0.03¢ each). Everything else is plain logic. | 16–20 h |
| **b. Busy nights and leftover nights** | Mark a night busy (this week / every week); search on a busy night starts filtered (≤ 30 min, slow cooker, make-ahead) with an off switch; "Cook double" adds a linked Leftovers night that adds nothing to the list or budget; move/remove handling; 3–4 day hint. Replaces today's "+N leftovers" stepper. | **0009**: `households.busy_days text[]`; `weeks.busy_days text[]` (this week's override); `week_meals.leftover_of uuid`, nullable `meal_id` rule for leftover rows. | None. | 10–12 h |
| **c. Plan my week** | One tap drafts every open night; reasons in a few words; week total; "Try another"; "Use this week". Pure scorer: favorites and verdicts first, about one new recipe, budget and wiggle room, swaps, dislikes, allergies (hard exclude), busy and leftover nights, ingredient reuse, no protein or cuisine two nights running, nothing from the last two weeks unless a regular. Sales plug in at (d). Starts the weekly store price collection. | **0010**: `meals.is_regular bool`, `meals.cuisine text`, `meals.main_protein text`; `store_basket_prices` (per store, shared, written only by a definer function). Draft lives in the browser; nothing saved until the tap. | None required. Cuisine comes from Spoonacular's field or a word list; an optional AI tag at save (about 0.02¢) only if the word list proves weak. Works fully at the cap. | 20–26 h |
| **e. Use it up** | Type or pick foods about to go bad; recipes that use the most of them (favorites first, then search); those foods count as "I have it" for this week only. | **0011**: `week_use_up` (week, food). | None. | 5–7 h |
| **d. Cook from the sales** | What's on real sale at our store among ~120 common foods; recipes that use them; "saves about $X" from whole-package regular vs sale; feeds Plan my week and a line on search cards. Real sale = ≤ 90% of the 60-day median regular per-unit price; with under four weeks of history, the same day's promo ≤ 90% of regular. | Uses `store_basket_prices` from (c); adds the basket list as code, not a table. | None. Kroger: ~120 lookups per store per week against 10,000 a day. | 14–18 h |
| **f. Cook mode** | One step per screen, large type; that step's ingredients scaled to the family with Mom's swap called out; screen stays on; timers from the step text, kept across steps; offline once opened; no-steps fallback (source page + ingredients + timers). | None (steps saved in a). | Matching ingredients to steps is word matching. No AI. | 12–16 h |
| **g. Prep reminders** | Prep steps worked out at save (thaw, marinate, soak, start the slow cooker by); edit or turn off each; one evening summary plus timed ones only when timing matters; quiet hours; each person opts in on their own phone; the same reminders in the app. | **0012**: `meals.prep jsonb`; `push_subscriptions` (per user and device, owner-only like `kroger_links`); `reminder_prefs` (per user); `reminder_sends` (dedupe). Scheduler per question 7. | Plain patterns first. Optional: fold prep extraction into the existing save-time call for recipes whose steps the patterns can't read (about 0.03¢ per meal, once). | 16–20 h |
| **h. Breakfasts, lunches, lunchboxes** | Turn on breakfast and lunch slots; repeating basics (weekday breakfasts; a lunchbox per kid from short pick lists of mains, sides, snacks) flowing into the list and budget; school days adjustable each week. | **0013**: `basics` (household, slot, days, items), `lunchbox_picks` (person, kind, food), `weeks.school_days text[]`. | None. | 16–22 h |

**Total: about 110–140 hours.** Realistic pace is one phase per working session, with the owner's OK between each.

## Phase (a) in three releases

Small enough to try on the phone one at a time:
1. **a1 — Won't eat and allergies** (editor, flags, leave out / swap). 7–8 h.
2. **a2 — Meal facts** (steps, time, method, rating saved and backfilled; the facts line and its editor; "Type it myself"). 4–5 h.
3. **a3 — Verdicts** (card, sheet, lines, Favorites order). 5–7 h.

## What the owner sets up, and when

| When | What |
|---|---|
| Phase a–f | Nothing new. |
| Phase c/d | Nothing if question 7 is A (the scheduler lives in Supabase; the controller sets a cron secret in Vercel). |
| Phase g | Two keys in Vercel (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`; the controller generates them). On each phone: iPhone must use Basket from the Home Screen icon (iOS 16.4 or later), then tap "Turn on reminders" in Household and allow. Android: tap the same button in Chrome or the installed app. |
| Before sharing with friends | Close open sign-up or add the per-household request limit (backlog I4); it matters more once the app can send notifications. |

## After each phase
Add the new screens to `docs/superpowers/plans/2026-11-26-premium-pass.md` (both looks), so the redesign covers them.
