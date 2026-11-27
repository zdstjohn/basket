# Basket — Fred Meyer products and cart (spec addendum)

*2026-11-26. Adds to `docs/superpowers/specs/2026-11-26-basket-design.md` (§6, §8, §9, phase 2). Where this page and the design differ, this page wins. Built before the visual redesign, in the current look.*

## 1. Intent

The owner asked for two things after a day of real use: "I want to be able to add to cart for Fred Meyer," and "I also want every single thing to recommend a purchasable item. Estimates aren't helpful." Today the list prices a recipe amount (two tablespoons of olive oil reads $0.34), guesses when a recipe measures by the spoon and the store sells by the ounce, and shows the same food twice. After this work the Fred Meyer list is a list of things on the shelf, its total is what the receipt will say, and one approved tap puts it in the shopper's own Fred Meyer cart.

### Success looks like
- Every Fred Meyer row shows a real product: photo, name, size, how many, whole-package price.
- The Fred Meyer total is within a few dollars of the receipt (only by-the-pound items vary).
- A food appears once per list.
- Connect once, review, tap: the items are in the Fred Meyer cart. Checkout happens in the Fred Meyer app.
- A second tap never silently doubles the cart.

### Goals
1. Product recommendation with package math for every Fred Meyer item, and a Swap among the top matches that is remembered per household.
2. One row per food (measured and "to taste" amounts together).
3. Amazon and Costco rows get a search link instead of a guessed price.
4. Each person connects their own Fred Meyer account (OAuth on Kroger's page).
5. A review screen, then cart fill (pickup or delivery), with a record of what was sent and a warning before sending again.
6. Budget meter uses package totals.
7. Price logging starts (design §8), so deal history exists later.

### Non-goals
- Checkout, payment, time slots, substitutions preferences.
- Reading or emptying the Fred Meyer cart (the public API can't).
- Coupons, "real deal" flags, automatic cheaper-swap suggestions, the over-budget suggestion list (phase 4).
- Amazon cart link and Costco/Instacart (phase 3).
- "You'll have extra" notes (nearly every spice jar would carry one; revisit in the redesign).
- Restyling. Current colours, type and components only.

### Anti-goals
- Anything entering a cart without the review screen and a tap.
- A Kroger token readable in the browser, in logs, or by another household member.
- A price shown as "what you'll pay" that isn't a whole package.
- Kroger call volume that grows with every list open.

## 2. Decisions (made with the owner, 16:33–16:37)

| # | Decision |
|---|---|
| D1 | Cart filling is built now, before the redesign. |
| D2 | Every Fred Meyer item shows a real Kroger product: photo, name, size, package count, whole-package price. |
| D3 | **Swap** picks another of the top matches; the household's choice for that food is remembered. |
| D4 | Duplicate rows of one food merge. |
| D5 | "I have it" still skips pantry items. |
| D6 | Amazon and Costco items show a direct search link, not a guessed price. A price you typed still shows. |
| D7 | Each person connects their Fred Meyer account once, on Kroger's own sign-in page. Basket never sees the password. |
| D8 | A review screen shows every product, count and price and lets them change anything. Only after approval does Basket add to the cart (pickup or delivery). |
| D9 | Basket never orders. Because the cart can't be read back, Basket records what it sent and warns before sending again. |

## 3. Calls made by Claude (check these)

- **C1. Product mode needs a chosen store.** With no Fred Meyer chosen in Household (or Kroger keys missing) the list works as today, estimates included, plus a line asking to choose a store. Reason: prices and stock are per store.
- **C2. One row per food, everywhere.** "1 onion" and "7 oz onion" become one row reading "1 + 7 oz". Amounts are never added across kinds on screen; they are only converted when counting packages. This replaces the phase-1 rule that kept them as two rows.
- **C3. Choosing the product.** From the first five results whose name has every word of the food (else the first three results), pick the lowest total for the packages needed; a sale wins a tie; then Kroger's order. The five are the Swap options. Out-of-stock products go last.
- **C4. Converting spoons and cups to ounces.** A small density table (salt, sugars, flour, honey, oils, spices, dried herbs, liquids as water; default 1 g/ml) and typical weights for loose produce (onion, lemon, potato…; default 150 g). "To taste", pinch, dash, clove and similar need one package and add nothing.
- **C5. By-the-pound items** (meat counter, loose produce) are counted in pounds, rounded up, and marked "about". Their cart quantity is that number. *To confirm on the live check: what a quantity of 2 means in the Fred Meyer cart for a by-the-pound item.*
- **C6. When Fred Meyer has no match**, the row says so and offers "Search with other words" (the household's own search words for that food, remembered). No guess is shown. A price typed earlier still counts.
- **C7. Tokens are stored per person, encrypted, in the database** (not in a cookie). See §5.
- **C8. "Already sent" follows the Fred Meyer account**, not the phone: the profile id from `profile.compact` is stored with each send, so a couple sharing one Fred Meyer login is warned across both phones, and two separate accounts are not.
- **C9. Kroger lookups are capped** at 400 a day per household, cached 24 hours per store and food, shared by both phones.
- **C10. Amazon and Costco items with no typed price count $0** toward the meter and are listed as "without a price". The meter can read low when many items sit at those stores.
- **C11. Favorites' "about $X a meal"** stays a per-use estimate. It is a different question (what a dinner costs, not what the trip costs).
- **C12. Release as v0.2.0.**

## 4. Kroger API facts

The official pages at developer.kroger.com could not be fetched from this workspace (their robots file did not answer), so these come from the phase-1 verification in the design (§2), the product responses the app already receives, and a maintained open-source client (github.com/CupOfOwls/kroger-api, read 2026-11-26). Items marked *unverified* are re-checked in the plan's first and last tasks, and the design does not depend on them.

| Fact | Source | Status |
|---|---|---|
| Authorize: `GET https://api.kroger.com/v1/connect/oauth2/authorize` with `scope`, `response_type=code`, `client_id`, `redirect_uri`, `state`; optional `banner` | client source | confirmed (secondary) |
| PKCE: `code_challenge`, `code_challenge_method=S256`, then `code_verifier` at the token call | client source and README | confirmed (secondary) |
| Token: `POST /v1/connect/oauth2/token`, HTTP Basic `client_id:client_secret`, form body; grants `authorization_code` (`code`, `redirect_uri`) and `refresh_token` (`refresh_token`) | app's own token call; client source | confirmed |
| Scopes `cart.basic:write`, `profile.compact` (shopper), `product.compact` (app) | design §12; client examples | confirmed |
| Access token lifetime: read from `expires_in` (about 30 minutes) | client source reads `expires_in` | value *unverified* |
| Refresh tokens: a refresh may return a new refresh token, and reusing an old one can revoke the newer one | client source comments | treat as single-use |
| Refresh token lifetime (recalled as about six months) | none readable | *unverified*; a refused refresh means "connect again" |
| `PUT /v1/cart/add`, body `{ "items": [{ "upc": "0001111040101", "quantity": 1, "modality": "PICKUP" \| "DELIVERY" }] }`, success has no body (2xx) | client source; public Postman mirror | confirmed (secondary) |
| Whether one bad UPC fails the whole request | none | *unverified*; the plan retries item by item |
| Products: top-level `upc` (13 digits, same as `productId`), `items[].size`, `soldBy`, `price.regular/promo`, `fulfillment`, `inventory.stockLevel` | app fixtures have `productId` and `items`; `upc`, `fulfillment`, `inventory` recalled | `upc` falls back to `productId`; the rest optional |
| Profile: `GET /v1/identity/profile` returns `data.id` | secondary | optional in the design |
| Limits per day: Products 10,000; Cart 5,000; Identity 5,000; Locations 1,600 per endpoint | design §2; client README | confirmed (secondary) |
| No cart read or remove in the public API | design §2 | confirmed |

## 5. Approaches considered

### Where product matching happens

| Approach | Trade-off | Decision |
|---|---|---|
| **A. Server caches the store's candidate products per food; the phone does the package math** | One Kroger search per food per day, whatever the amount; changing servings or swapping needs no network; works offline from the last list. Needs a cache table and a pure "recommend" function. | **Chosen.** |
| B. Server picks one product per item and returns a price (extend today's `priceFor`) | Smallest change. But every amount change means another call, Swap needs the other candidates anyway, and the volume-to-weight miss stays unless the server knows the amount. | Rejected. |
| C. Ask the AI to pick or convert | Flexible with odd foods. Costs money per list, can invent products, and the owner has just said guesses aren't helpful. | Rejected. |

### Where the shopper's Kroger token lives

| Approach | Trade-off | Decision |
|---|---|---|
| **A. One row per person in the database, sealed with AES-256-GCM under `KROGER_TOKEN_KEY` (Vercel only); row readable only by that person** | Connect once for phone app, phone browser and laptop. One place to rotate a single-use refresh token safely. The sealed text can be fetched by its owner through the data API, but is useless without the key. | **Chosen.** |
| B. Sealed token in an httpOnly cookie per device | Nothing in the database and nothing a script can read. But the owner already uses both the installed app and a phone browser (the screenshot is from a browser), iPhone keeps those apart, so "connect once" becomes "connect on each"; and a lost response during a refresh loses the token. | Rejected. |
| C. One token per household (design §13) | Simplest. But the owner chose per person, and a shared token would let one partner fill the other's cart. | Rejected (overridden by D7). |

No service-role key is used in any approach.

### Double-send protection

| Approach | Decision |
|---|---|
| **Record a send as "pending" before calling Kroger, then mark it sent or failed; the server refuses a repeat of the same products to the same account unless the person confirms** | **Chosen.** A timeout leaves "pending", which the screen reports as "we couldn't tell; check your cart". |
| Record only after success | Rejected: a timeout or a failed save leaves no trace, and the next tap doubles the cart. |

## 6. Behaviour

**List, Fred Meyer tab (store chosen).** Each row: checkbox, product photo, the food's name, the amount needed ("2.4 tsp + to taste"), the product's name and size, and on the right the whole-package total with "1 package" or "2 × $1.25", "about" for by-the-pound, and "Sale" when on promo. A **Swap** button opens the options: up to five products with photo, name, size, count and total, the cheapest marked, the household's usual marked; "Search with other words"; and "Back to Basket's pick" once a choice exists. Rows with no match say "No Fred Meyer match yet". Above the total: "Review and send to Fred Meyer". If lookups are down or capped, the last products stay and a line says prices may be out of date.

**Amazon and Costco tabs.** Rows show "Search Amazon" / "Search Costco" (opens the store's search for that food in a new tab) unless a price was typed.

**Total and meter.** Fred Meyer items count at package totals; "outside budget" and "I have it" work as now; items without a price are counted and named.

**Connect.** From the review screen or Household: "Connect Fred Meyer" goes to Kroger's sign-in and returns. Household shows "Connected" and "Disconnect".

**Review** (`/list/review`). Pickup or Delivery (remembered). Every product with a − / + count (1–99), Swap, and "I have it". A section for items that can't be sent (no match). The Fred Meyer total, the week against the budget, and a confirmation when over the target plus cushion. If something was sent this week to this Fred Meyer account: what was sent and when; only new items and increases are selected; items already sent can be sent again only after a plain warning; items removed or swapped since are listed "to remove in the Fred Meyer app". The button reads "Add N items to my Fred Meyer cart". Afterwards: "Added. Check out in the Fred Meyer app," with a link to the Fred Meyer cart. Footer: "Basket never places an order."

**Failure messages.** Token refused → "Connect Fred Meyer again." Kroger refuses some items → those are named, the rest are recorded as sent. No answer → "We couldn't tell if Fred Meyer got it. Check your Fred Meyer cart before sending again." Offline → the button is off.

## 7. Data (migration 0006; 0007 after deploy)

- `kroger_matches` (household, store, food, search words, candidates, fetched time). Members read and write; the fetched time defaults to now in the database and the server sets it on every save. The daily cap does not depend on it: lookups are counted in a table that members cannot write.
- `item_product_choice` (household, food, chosen UPC, own search words).
- `kroger_links` (person, sealed tokens, Fred Meyer profile id). Only that person.
- `cart_sends` (household, week, person, profile id, pickup/delivery, status, items, total). Members read; only the sender writes.
- `price_observations` (household, store, UPC, regular, promo, day).
- `week_item_state.pack_count` (this week's count for an item); `households.fulfillment`.
- 0007 rewrites this week's saved have-it/checked keys from "food#kind" to "food". Run by hand, about a week after the release, never through `supabase db push` (the folder holds 0007).

## 8. What the owner sets up

- **Kroger developer portal:** redirect URI `https://basket-ashy.vercel.app/api/kroger/callback` on the production app; the app includes the Cart and Identity (profile) products with scopes `cart.basic:write` and `profile.compact` alongside `product.compact`.
- **Vercel (Production):** `KROGER_TOKEN_KEY` (32 random bytes, base64; marked Sensitive) and `KROGER_REDIRECT_URI` (the address above). Changing the key later only means connecting again.
- Preview deployments can't complete the sign-in. Tests use the fake (`KROGER_FAKE=1`).

## 9. Left to the builder

- Exact layout of the row, Swap sheet and review screen within the current style and the 360–440 px targets.
- Density and produce-weight values beyond the ones the plan's tests pin.
- Wording of minor states not quoted here, in the app's plain kitchen voice.
- Whether `banner` shows Fred Meyer branding on Kroger's page (try it on the live check; leave unset if unsure).

## 10. Risks

- **By-the-pound quantities** (C5) may mean "each" in the cart for some produce. Checked live; the review screen lets the count be changed either way.
- **Wrong first pick** for vague foods ("honey" has many products). Swap and own search words are the remedy; the choice sticks.
- **iPhone installed app and the Kroger sign-in page**: the return trip should land back in the app as Google sign-in does. Checked live on the real iPhone.
- **Open sign-up** (backlog I4) still lets strangers create households, each with its own 400-a-day allowance. Unchanged by this work; switch sign-ups off in Supabase when not inviting.
