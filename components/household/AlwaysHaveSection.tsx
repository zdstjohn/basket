"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { addAlwaysHave, listAlwaysHave, removeAlwaysHave } from "@/lib/db/queries/list";
import type { Household } from "@/lib/db/rows";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/Field";
import { ErrorBanner, Loading, SkeletonLines } from "@/components/ui/states";
import { ghostButton } from "@/lib/ui";

const SUGGESTED = ["salt", "pepper", "cooking oil"];
const DISMISSED_KEY = "always-have-suggested";
const displayName = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Things you never need to buy. They show up on the list under "Skipped, you have them". */
export function AlwaysHaveSection({ household }: { household: Household }) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [names, setNames] = useState<string[] | null>(null);
  const [text, setText] = useState("");
  const [hideSuggestions, setHideSuggestions] = useState(true);
  const [error, setError] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    listAlwaysHave(sb, household.id)
      .then(setNames)
      .catch(() => setLoadFailed(true));
  }, [sb, household.id]);

  useEffect(() => {
    // Read after mount: localStorage does not exist on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHideSuggestions(dismissed());
    load();
  }, [load]);

  async function add(name: string) {
    const canonical = name.trim().toLowerCase();
    if (!canonical || names?.includes(canonical)) return;
    setError(false);
    try {
      await addAlwaysHave(sb, household.id, canonical);
      setNames((n) => [...(n ?? []), canonical]);
      setText("");
    } catch {
      setError(true);
    }
  }

  async function remove(name: string) {
    setError(false);
    try {
      await removeAlwaysHave(sb, household.id, name);
      setNames((n) => (n ?? []).filter((x) => x !== name));
    } catch {
      setError(true);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Not remembering is fine.
    }
    setHideSuggestions(true);
  }

  const suggestions = hideSuggestions || !names ? [] : SUGGESTED.filter((s) => !names.includes(s));

  return (
    <section aria-label="Always have" className="flex flex-col gap-2">
      <h2 className="text-heading text-ink">Always have</h2>
      <p className="text-small text-ink-soft">Never on your shopping list, even when a meal needs them.</p>
      {names === null && !loadFailed && (
        <>
          <SkeletonLines lines={2} size="body" />
          <Loading label="Loading what you always have" />
        </>
      )}
      {loadFailed && <ErrorBanner message="We couldn’t load this list." actionLabel="Try again" onAction={load} />}
      {names && names.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {names.map((n) => (
            <li key={n}>
              <Chip removeLabel={`Remove ${displayName(n)}`} onRemove={() => void remove(n)}>
                {displayName(n)}
              </Chip>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-small text-ink-soft">Most kitchens have these:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" aria-label={`Add ${s}`} onClick={() => void add(s)} className={ghostButton}>
                + {displayName(s)}
              </button>
            ))}
            <button type="button" onClick={dismiss} className={ghostButton}>
              Not now
            </button>
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add(text);
        }}
        className="flex items-end gap-2"
      >
        <TextField
          className="min-w-0 flex-1"
          label="Add something you always have"
          placeholder="Add something"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="ghost">
          Add
        </Button>
      </form>
      {error && <ErrorBanner message="That didn’t save. Try again." />}
    </section>
  );
}
