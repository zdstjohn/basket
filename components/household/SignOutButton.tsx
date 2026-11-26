"use client";

import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { signOutAndLeave } from "@/lib/signout";
import { pillButton } from "@/lib/ui";

/** Signs out and wipes what this phone saved for offline use, so the next person on it sees nothing of ours. */
export function SignOutButton() {
  const sb = useMemo(() => createBrowserClient(), []);
  const [working, setWorking] = useState(false);
  return (
    <section aria-label="Account" className="mx-5 mt-6">
      <button
        type="button"
        disabled={working}
        onClick={() => {
          setWorking(true);
          void signOutAndLeave(sb);
        }}
        className={`${pillButton} h-12 w-full text-[15px]`}
      >
        Sign out
      </button>
      <p className="mt-2 text-center text-xs text-muted">This also clears the saved list on this phone.</p>
    </section>
  );
}
