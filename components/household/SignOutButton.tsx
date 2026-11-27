"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createBrowserClient } from "@/lib/db/client";
import { signOutAndLeave } from "@/lib/signout";

/** Signs out and wipes what this phone saved for offline use, so the next person on it sees nothing of ours. */
export function SignOutButton() {
  const sb = useMemo(() => createBrowserClient(), []);
  const [working, setWorking] = useState(false);
  return (
    <section aria-label="Account" className="flex flex-col gap-2">
      <Button
        variant="ghost"
        busy={working}
        className="w-full"
        onClick={() => {
          setWorking(true);
          void signOutAndLeave(sb);
        }}
      >
        Sign out
      </Button>
      <p className="text-small text-ink-soft">This also clears the saved list on this phone.</p>
    </section>
  );
}
