# Proof tooling

Before/after screenshots, motion clips and measurements, in WebKit (iPhone 17) and Chromium (Pixel 7) at the same time.

```
npm run proof                                  # everything
npm run proof -- proof/shoot.spec.ts -g login  # one slice
```

`npm run proof` goes through `scripts/e2e-local.sh`: it builds and serves against the local Supabase only. Output goes to `proof-out/` (gitignored). Open `proof-out/index.html`.

| Spec | Writes | What it does |
|---|---|---|
| `shoot.spec.ts` | `proof-out/after/{state}-{device}-{light\|dark}[-full].png` | Every state in `states.ts` (plus each screen in `e2e/screens/later.ts`), both looks, with the phone's insets (iPhone 17 62/34, Pixel 7 28/24). |
| `record.spec.ts` | `proof-out/motion/{clip}-{device}[-reduced][-slow].mp4` | Six clips, each also under reduced motion. `page.ts` converts the `.webm` with `ffmpeg-static` and makes a quarter-speed copy. |
| `measure.spec.ts` | `proof-out/measure/*.json`, `proof-out/zoom/*.png` | Spacing scale, gutter edges, type scale, text contrast, 200% crops, and rolling digits at 200% text size. |
| `page.ts` | `proof-out/index.html` | Global teardown: one section per screen, before (light only, from `docs/design/before/`) beside after in light and dark, iPhone above Pixel, then the clips. It runs even when every test was skipped. |

Specs reuse `e2e/helpers` (sign-in, household, flows, look, insets) and `e2e/screens`; there is no second copy of them.

## What gets skipped

- A state whose registry screen is still `contrastPending` (or not registered yet) is skipped with a `[proof] skipped ...` line. This is how the "after" shots stay honest: a screen appears once its own task has redesigned it.
- A state that cannot be reached (its trigger does not exist yet, or a step failed) is skipped with the reason: `week-long-names`, `week-error`, `list-stale` and `review-sent` have no trigger yet; add one in `states.ts` when the screen's task lands.
- A clip is skipped the same way. Clips need: a meal tile that is a button named after the dish and opens a dialog (`photo-sheet`), the list item sheet (`sheet-drag`), `list-row` checkboxes (`list-strike`).
- On a `contrastPending` screen, `measure.spec.ts` writes its findings to `proof-out/measure/` and as a test annotation but passes; on any other screen findings fail the test.

## Measurements (`measure.spec.ts`)

1. Margin, padding and gap of every visible element are in {0, 2, 4, 8, 12, 16, 24, 32, 48, 64} or a tile exception (10, 6). Exempt: padding built from `--bk-safe-*`, `auto` margins, `.bk-packshot > img`, negative margins of 4.
2. The left edge of every direct child of a `.bk-gutter` block equals the gutter.
3. Font sizes are 12, 14, 16, 18, 24, 34 (54 on `.bk-fallback-letter`).
4. Text contrast through `textPairs` and `contrastRatio` (4.5:1).
5. 200% crops: a second context at twice the device scale factor, the screen cut into four, in `proof-out/zoom/`.

Also: rolling digits clip to one line at 200% text size (root font size 200%, in both looks; needs the rolling window to carry `data-roll` or `.bk-roll`, otherwise it prints a note and passes).

## Checks from `motion-proof-checks.md`

Automated here:
- Reduced motion, no transform changes: every `-reduced` clip samples every frame (`watchTransforms` in `measure.ts`) and fails on any changed `transform`, `translate`, `scale` or `rotate`, or an animation that animates one. `.bk-press` is ignored. The sheet drag clip is not checked (a finger moves it on purpose).
- Roll clips to one line at 200% text size: see above.

Manual (watch the clips, or on a real phone):
- Photo morph: double-tap and tap-during-transition leave no element with a `view-transition-name`; taps pass through.
- Flip: three rapid check-offs land every row in its place; a layout change outside `signature` does not slide the list.
- Sheet: drag, pause, release does not dismiss on stale speed; iPhone-only checks (no inner rubber-band, scrolled list never dismisses on a fast fling, scrim drag does not scroll the page, a field near the bottom clears the keyboard, the VoiceOver escape gesture closes a sheet with no Close button, enter and exit from a home-screen install).
- Settle/reveal: unlayered classes beat Tailwind; a tile's own position and `bk-press` still work; never two of `bk-reveal`/`bk-settle`/`bk-fade-in` on one element; no `bk-reveal` on the hero image.
- Strike: overlay `aria-hidden`, parent positioned. Skeleton: one wrapper pulses, not twenty tiles.
- Haptic: `tick()` only from a tap; no console intervention warning on Pixel.
- VoiceOver and TalkBack speak a toast, the offline strip and "Loading..."; a toast never covers the main action in `barAboveNav`; in Cast Iron an off Switch still reads as a switch.

## The "before" shots

`docs/design/before/{iphone-17,pixel-7}/` are screenshots of the old app taken against the e2e fixtures only (the fake household of Dad, Mom, Son and two Daughters, fake recipe sources, generated fallback dish images). Never add a screenshot with a real dish photo, name or household data: this repository is public.
