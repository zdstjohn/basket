#!/usr/bin/env bash
# Runs the proof with WebKit (iPhone 17) and Chromium (Pixel 7) at the same time: starts the built app once, then one Playwright
# process per browser against it. Not meant to be run by hand: `npm run proof:parallel` goes through scripts/e2e-local.sh first
# (local-only Supabase guard, build), which then runs this with the same arguments.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p proof-out
rm -rf proof-out/.parts
server_log=proof-out/.server.log
# Never shoot a server this script did not start: it could be another build, or an old one.
if curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  echo "something already answers on http://localhost:3000; stop it first so the proof shoots the build it just made" >&2
  exit 1
fi
npm run start >"$server_log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT

for _ in $(seq 1 120); do
  curl -sf -o /dev/null http://localhost:3000 && break
  kill -0 "$server" 2>/dev/null || { echo "the server stopped; see $server_log" >&2; exit 1; }
  sleep 1
done
curl -sf -o /dev/null http://localhost:3000 || { echo "the server did not come up; see $server_log" >&2; exit 1; }

export PROOF_PARTS=iphone-17,pixel-7
PROOF_PART=iphone-17 PROOF_OUT_DIR=proof-out/.raw-iphone-17 npx playwright test "$@" --project=iphone-17 &
webkit=$!
PROOF_PART=pixel-7 PROOF_OUT_DIR=proof-out/.raw-pixel-7 npx playwright test "$@" --project=pixel-7 &
chromium=$!
status=0
wait "$webkit" || status=1
wait "$chromium" || status=1
exit $status
