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

## Design tokens

Colours and fonts live in `app/globals.css` as CSS variables (`--ground`, `--ink`, `--muted`, `--line`, `--green`, `--green-tint`, `--sale`, `--sale-tint`; `--font-head`, `--font-body`) and are mapped into Tailwind (`bg-ground text-ink`).
