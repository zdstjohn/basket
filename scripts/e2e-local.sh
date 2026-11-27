#!/usr/bin/env bash
# Builds and runs e2e against the LOCAL Supabase only. Usage: scripts/e2e-local.sh [playwright args]
set -euo pipefail
cd "$(dirname "$0")/.."
status="$(npx supabase status -o env)"
NEXT_PUBLIC_SUPABASE_URL="$(echo "$status" | grep '^API_URL=' | cut -d'"' -f2)"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(echo "$status" | grep -E '^(PUBLISHABLE_KEY|ANON_KEY)=' | head -n1 | cut -d'"' -f2)"
export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
export CI=true E2E=1 E2E_PASSWORD=local-e2e-password-1 AI_FAKE=1 RECIPE_SEARCH_FAKE=1 KROGER_FAKE=1 SPOONACULAR_API_KEY=ci-fake-key
case "$NEXT_PUBLIC_SUPABASE_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "not a local Supabase URL" >&2; exit 1;; esac
npm run build
if ! grep -rl "127.0.0.1:54321" .next >/dev/null; then echo "build does not point at local Supabase" >&2; exit 1; fi
if grep -rl "xzafofgzlgmdvafrkqkx" .next >/dev/null; then echo "build contains the production project" >&2; exit 1; fi
npx playwright test "$@"
