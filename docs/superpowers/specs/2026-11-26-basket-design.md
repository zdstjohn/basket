# Basket — family meal planning and grocery ordering app

*Design, 2026-11-26. Working name "Basket" (rename any time).*

## 1. Intent

Zdstjohn and his wife want the weekly grocery job to shrink to: pick the week's meals, glance at the total, tap to fill the carts, review and pay. The app sizes food to the household, keeps the week near a $200 budget, chases real sale prices, and splits the list across Fred Meyer, Amazon and (sometimes) Costco. If it's good, they'll share it with family and friends, each running their own household.

### Success looks like
- A week is planned in under 10 minutes on a phone, most weeks in under 5 (repeat a week, tap favorites).
- One tap fills the Fred Meyer cart; one tap opens a filled Amazon cart.
- The week lands at or near $200, with the money saved shown.
- Quantities are right in the store: no running out mid-week, no rotting extras.

### Goals
- Household setup: people, ages, diets, dislikes, budget.
- Weekly planner fed by typed meal names, pasted recipes/URLs, or favorites.
- Favorites with recipe, ingredients and the household's usual products.
- One merged, age-scaled shopping list with pantry "have it" skips.
- Sale-price preference by unit price, price history, coupon matching.
- Store split with per-item/category defaults; cart filling where officially possible.
- Shared use within a household (synced between phones); separate households for friends.

### Non-goals (v1)
- Automatic checkout or payment (no store API allows it; also never wanted without approval).
- Meal suggestions/recommendation engine (AI only turns the user's meals into ingredients).
- Nutrition or calorie tracking (portion scaling only).
- Quantity-level pantry inventory (simple "have it" and "always have" toggles).
- Native Android/iOS apps (installable web app covers both).

### Anti-goals (would make it a failure even if it "works")
- Spending money, or placing anything in a cart, without the user starting it.
- Scraping or botting Amazon/Kroger/Costco, or storing store passwords/card numbers.
- A weekly flow that takes more taps than doing it by hand.
- Surprise AI bills from shared households.
- Any household seeing another household's data.

## 2. Constraints (verified 2026-11-26; re-check at each phase start)

- **Kroger public API** (covers Fred Meyer, QFC, Ralphs, etc.): store lookup, product search/details with `price.regular` and `price.promo` when `filter.locationId` is passed, and `PUT /v1/cart/add` via OAuth authorization-code flow. No checkout. Public API cannot read the cart back. No coupon endpoint found in the public API (partner APIs exist; verify before phase 4). Products: 10,000 calls/day per developer app, shared by all households.
- **Amazon**: third-party agents are blocked from shopping in customer accounts. The documented add-to-cart form URL (`https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=…&Quantity.1=…`) adds items and hands the user to Amazon to check out. No affiliate tag (it's the household's own buying). No official price API for this use, so Amazon prices are user-entered or last-paid. Whole Foods/Fresh ASINs through this link: untested; test in phase 3, fall back to a linked list.
- **Costco**: no consumer API. Instacart Developer Platform can create a shopping-list link (user picks store and checks out on Instacart); requires an approved developer application. No prices from it.
- **To verify at phase 2 start**: whether a Kroger developer app needs approval for production use, and whether its terms allow one app serving several households.
- **Secrets**: Kroger client secret and AI access server-side only; per-household Kroger refresh tokens encrypted at rest, never sent to the browser.
- **Existing setup to match**: Waypoint runs on Vercel (team "waypoint") + Supabase (org with project "waypoint", us-west-1); code on GitHub as zdstjohn.

## 3. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **Installable web app (PWA) on Vercel + Supabase** | Works on Android and iPhone, instant updates, matches Waypoint. Slightly less "native" feel. | **Picked by user.** |
| Native Android app (Expo) + Supabase | More native feel; needs separate iPhone build for friends, store publishing, slower updates. | Rejected. |
| Claude artifact page | Fastest to make, but can't hold Kroger OAuth secrets/tokens safely. | Rejected. |

## 4. Household and people

- A **household** owns everything: people, budget, plans, favorites, product choices, store links, price history.
- **Members** sign in (Google sign-in, email magic link as backup) and belong to one household. Owner can invite by link (7-day expiry). Wife joins via invite. Both see and edit the same data, synced live.
- Other families create their own household. Row-level security on `household_id` everywhere.
- **People** (not the same as members; kids don't log in): name, age, diet (none / vegetarian / vegan / pescatarian), dislikes (ingredients), appetite (0.5×–1.5×, default 1×).
- This household: adult M 38, adult F 39 (vegetarian), boy 8, girl 6, girl 4.

### Portion scaling (builder may refine the table)
Default portion factor by age, times appetite:

| Age | Factor |
|---|---|
| 2–3 | 0.4 |
| 4–5 | 0.5 |
| 6–7 | 0.6 |
| 8–10 | 0.7 |
| 11–13 | 0.85 |
| 14+ | 1.0 |

This household ≈ 1 + 1 + 0.7 + 0.6 + 0.5 = **3.8 servings** per meal. Each planned meal can override servings (e.g. "+2 for leftovers" or a guest night).

### Vegetarian handling
On a meal containing meat/fish, vegetarian people get a **swapped portion**: the meat quantity excludes their factor, and a meat-free protein (suggested by AI, e.g. black beans for tacos) is added at their factor. The swap is editable per meal and saved with favorites. A meal can instead be marked "everyone vegetarian." Dislikes are flagged on the meal card, not auto-removed.

## 5. Meals, favorites, weeks

- **Week**: 7 days, dinner slot by default; breakfast/lunch slots can be turned on in settings. Week start day and shopping day are settings (default Sunday).
- **Add a meal** three ways (amended 2026-11-26 by the user):
  1. **Search**: type a dish ("chicken enchiladas") → the app searches a fixed list of big recipe sites (Allrecipes, Food Network, Serious Eats, Simply Recipes, Budget Bytes, Half Baked Harvest and others) through the Brave Search API (pending user confirmation) and shows up to 8 options, each with the site's photo, title, site name, rating and time. Tapping one imports its ingredients (AI turns them into lines and adds the vegetarian swap). Cooking steps stay on the source site, linked from the meal.
  2. Paste recipe text or a recipe link → server reads schema.org `Recipe` JSON-LD; AI parses text.
  3. Pick a favorite.
- **Every recipe has a photo**: the source site's photo (credited and linked), or for pasted/own recipes the photo from the top search result for that dish, or the household's own photo (camera or gallery, stored privately per household). A photo that fails to load shows an "Add a photo" tile.
- **Ingredient line**: canonical item ("boneless chicken thighs"), quantity, unit, role (protein / produce / dairy / pantry / other), optional note.
- **Favorites**: save any meal with recipe, ingredients, vegetarian swap and the household's chosen products. Browse, search, edit, one-tap add to a day.
- **Staples**: a recurring weekly list (milk, bread, fruit, cereal, snacks) with quantities, added to every week unless removed.
- **Repeat a week**: copy any past week into the current one.

## 6. Shopping list

- Merges all meal ingredients + staples, converts units, scales by servings, combines duplicates.
- Pantry: per-week "have it" toggles, plus an "always have" list (salt, oil, spices) skipped by default.
- Each list item maps to a **household product choice** per store (Kroger productId/UPC and size; Amazon ASIN, size, last price; Costco item name, size, last price). First time an item appears, the app shows up to 3 Kroger matches (best unit price, store brand, on sale) and the user picks; remembered after that.
- **Package math**: round up to whole packages of the chosen size; show "you'll have extra" when it's well over.
- Grouped by store, then by store aisle/category; works offline once loaded (checklist for in-store shopping).

## 7. Budget

- Weekly target ($200 here) and cushion ($25 default).
- Meter: green ≤ target; amber target→target+cushion with swap suggestions; red above, and the app asks to confirm before filling carts.
- Counts everything the app shops for; items can be marked "outside budget."
- Costco bulk runs can be spread over the weeks they cover.
- Over-budget suggestions, in order: same-item cheaper product (store brand/size), item on sale at another store, swap a meal for a cheaper favorite.

## 8. Savings

- **Sale preference**: compare by unit price ($/oz, $/lb, $/each) using Kroger `regular` vs `promo`. A promo on a smaller pack only wins if it's cheaper per unit.
- **Price history**: log every price seen (store, product, regular, promo, per-unit, date). Logging starts in phase 2 so history exists by phase 4. "Real deal" = current per-unit price ≤ 90% of the 60-day median regular per-unit price (builder may tune).
- **Same-item swaps** (other brand or size of the same item): automatic if the household setting is on, otherwise suggested. Anything that changes a meal always asks.
- **Coupons** (phase 4): first verify whether Kroger offers any official coupon access. If yes, match coupons to the list and show them; clip through the official route if one exists. If no, show "check coupons" links that open the Fred Meyer coupon search for that item, and let the user mark it clipped.
- **Saved this week**: sum of (regular − paid) on sale items + applied coupons, shown on the review screen and in week history.

## 9. Stores and carts

- Default store per category and per item; household picks its Kroger-family store by ZIP.
- **Fred Meyer**: "Fill Fred Meyer cart" sends the list's UPCs and quantities to `cart/add` with the household's pickup or delivery setting. Because the cart can't be read back, the app records what it sent and warns before sending again. User checks out in the Fred Meyer app.
- **Amazon**: "Open Amazon cart" builds one add-to-cart URL with all Amazon items; opens in the Amazon app/site. Products are added by pasting Amazon links (the app reads the ASIN). Whole Foods items tested in phase 3; fallback is a linked list.
- **Costco**: checklist with sizes and last prices; "Send to Instacart" link if the Instacart application is approved.
- **Changes after a cart is filled**: the list shows "changed since you filled the cart." Additions can be sent on their own; removals can't be made through the public API, so the app lists them for the user to remove in the store app.
- Nothing is ever ordered by the app; carts only fill when a member taps the button after the review screen.

## 10. Tech

- Next.js (App Router, TypeScript) on Vercel, team "waypoint", new project.
- Supabase: new project in the existing org, us-west-1. Postgres, Auth (Google + email), Realtime for live sync between household phones, RLS on every table.
- PWA: manifest + service worker; installable on Android; offline read of the current list.
- AI through Vercel AI Gateway with the AI SDK (no separate AI account; billed via Vercel). Cheapest Claude model that parses reliably for ingredient extraction; a stronger one only for drafting recipes from a name. Per-household monthly AI spend cap (default $3, editable by the app owner).
- Kroger: server routes for OAuth start/callback, token refresh, product search, cart add. Tokens encrypted at rest with a key held in Vercel env.
- Tests: unit tests for scaling, unit conversion, package math, budget, unit price, deal detection; Kroger calls mocked in integration tests; Playwright end-to-end for the weekly flow in two browsers. GitHub Actions on every push; each production deploy tagged as a release.
- Repo: new private GitHub repo under zdstjohn.

### Core tables (sketch)
`households`, `members`, `invites`, `people`, `settings` (budget, cushion, week start, slots, swap mode, fulfillment), `meals` (is_favorite, recipe, base_servings, veg_swap), `meal_ingredients`, `weeks`, `week_meals` (day, slot, servings_override), `staples`, `pantry_always`, `week_pantry` (have-it), `products` (store, external id, name, size, unit), `item_product_choice`, `price_observations`, `cart_sends`, `store_links` (encrypted tokens), `ai_usage`.

## 11. Phases (each usable on its own)

1. **Plan and list**: auth, households and invites, people and settings, planner (type/paste/URL/favorites), AI parsing, scaling, vegetarian swaps, staples, pantry, merged list, budget meter using AI price estimates clearly labeled "estimate" (replaced by live prices in phase 2; editable), repeat week, PWA install.
2. **Fred Meyer**: Kroger link, store pick, product matching, live regular/promo prices, unit-price sale logic, same-item swaps, cart fill, price logging starts.
3. **Amazon and Costco**: paste-link products, Amazon cart link (+ Whole Foods test), Costco list, Instacart link if approved, bulk spreading.
4. **Coupons and history**: coupon verification and matching, deal flags from price history, saved-this-week totals and history view.

### Device targets
Every phase is laid out and tested for the iPhone 17 family and common Android phones (about 360 to 440 px wide), with safe areas and gesture bars handled.

### Queued after launch
**Visual and experience redesign** ("cookbook crossed with a well-kept kitchen"): full brief in `2026-11-26-visual-redesign-brief.md`. Starts only after the first version is live; features and saved data stay unchanged.

## 12. Accounts the user needs to create (walkthroughs provided when each is needed)

1. **Google Cloud OAuth client** for Google sign-in (phase 1; email sign-in works without it).
2. **Kroger Developer** account and app with scopes `product.compact`, `cart.basic:write`, `profile.compact`, redirect URI on the app's domain (phase 2).
3. **Instacart Developer Platform** application (optional, phase 3; approval required).
Vercel, Supabase and GitHub already exist.

## 13. Calls made by Claude (not decided by the user — check these)

- Working name "Basket."
- Dinner-only default with optional breakfast/lunch slots; staples list for everyday items.
- Portion factor table above; 3.8 servings for this household.
- Vegetarian swap is the default (user said go before answering; editable per meal).
- Budget cushion $25; confirm before filling carts when over target + cushion.
- Google + email sign-in; 7-day invite links.
- AI via Vercel AI Gateway; $3/household/month default cap.
- "Real deal" threshold 90% of 60-day median.
- Price logging starts in phase 2 so phase 4 has history.
- Kroger tokens per household (either member can link the account).

## 14. Left to the builder

- Exact UI library and styling (must match the approved mockups).
- Unit conversion tables and ingredient canonicalization approach.
- Model choice within the cost cap; prompt design for parsing and swaps.
- Caching strategy for Kroger product lookups within the daily limit.
- Offline/service-worker details.
