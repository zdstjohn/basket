import { test } from "@playwright/test";
import { LOOKS, dress, outDir, pendingReason, settle, signInFor } from "./helpers";
import { skipBeforeSetup, skipReason } from "./pending";
import { STATES } from "./states";

/**
 * The "after" shots: every state, in both looks, on this project's phone, with its insets.
 * Saves proof-out/after/{state}-{device}-{look}.png (the viewport) and ...-full.png (the whole page).
 * A state whose screen is still contrastPending (or not registered) is skipped with a printed note; one that says it is Pending is skipped with its reason; any other error fails the test.
 */
test.describe.configure({ mode: "parallel" });

for (const state of STATES) {
  for (const look of LOOKS) {
    test(`${state.name} (${look})`, async ({ page, context }, testInfo) => {
      const device = testInfo.project.name;
      // Decided before any sign-in or household: a state with no trigger must never fail on setup it does not need.
      const pending = skipBeforeSetup(state.pending, pendingReason(state.screens));
      if (pending) {
        console.log(`[proof] skipped ${state.name} (${look}, ${device}): ${pending}`);
        test.skip(true, pending);
      }

      await dress(page, look, testInfo);
      const email = await signInFor(page, state.who, `proof-${state.name}`, state.people);
      try {
        await state.run({ page, context, email });
      } catch (err) {
        // Only a state that says it is not reachable yet is skipped. Any other error is a finished screen breaking: it fails.
        const reason = skipReason(err);
        if (reason === null) throw err;
        console.log(`[proof] skipped ${state.name} (${look}, ${device}): ${reason}`);
        test.skip(true, reason);
      }

      await settle(page);
      const dir = outDir("after");
      await page.screenshot({ path: `${dir}/${state.name}-${device}-${look}.png` });
      await page.screenshot({ path: `${dir}/${state.name}-${device}-${look}-full.png`, fullPage: true });
    });
  }
}
