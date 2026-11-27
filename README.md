# Basket

Mobile-first family meal-planning and grocery web app. Next.js (Vercel) + Supabase.

## Develop

```bash
npm install
npm run dev
```

## Scripts

- `npm run lint` / `npm run typecheck` / `npm test` (Vitest unit tests)
- `npm run build` then `npm run test:e2e` (Playwright: `iphone-17`, `pixel-7`; `android-small` runs layout specs only)
- First time only: `npx playwright install chromium webkit`

## Fred Meyer account (production settings)

Connecting a shopper's Fred Meyer account needs two more variables besides `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`:

- `KROGER_TOKEN_KEY`: base64 of 32 random bytes (`openssl rand -base64 32`). Seals each shopper's tokens (AES-256-GCM). Changing it signs everyone out of Fred Meyer.
- `KROGER_REDIRECT_URI`: the callback address registered with Kroger, `https://basket-ashy.vercel.app/api/kroger/callback` in production. It is never taken from the request.

`KROGER_BANNER` is optional. With either variable missing, connecting and cart filling stay off. The `*_FAKE` switches are ignored on Vercel.

## Design tokens

Colours and fonts live in `app/globals.css` as CSS variables (`--ground`, `--ink`, `--muted`, `--line`, `--green`, `--green-tint`, `--sale`, `--sale-tint`; `--font-head`, `--font-body`) and are mapped into Tailwind (`bg-ground text-ink`).
