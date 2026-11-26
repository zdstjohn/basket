"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { addAlwaysHave, listAlwaysHave, removeAlwaysHave } from "@/lib/db/queries/list";
import type { Household } from "@/lib/db/rows";
import { focusRing, pillButton, textInput } from "@/lib/ui";

const SUGGESTED = ["salt", "pepper", "cooking oil"];
const DISMISSED_KEY = "always-have-suggested";

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

  useEffect(() => {
    let alive = true;
    listAlwaysHave(sb, household.id)
      .then((n) => alive && setNames(n))
      .catch(() => alive && setError(true));
    // Read after mount: localStorage does not exist on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHideSuggestions(dismissed());
    return () => {
      alive = false;
    };
  }, [sb, household.id]);

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
    <section aria-label="Always have" className="mx-5 mt-4">
      <h2 className="text-[15px] font-semibold">Always have</h2>
      <p className="mb-1.5 text-xs text-muted">Never on your shopping list, even when a meal needs them.</p>
      <div className="rounded-2xl border border-line bg-white p-3.5">
        {names && names.length > 0 && (
          <ul className="mb-2.5 flex flex-wrap gap-2">
            {names.map((n) => (
              <li key={n} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-green-tint pl-3.5 pr-1 text-[13px] font-medium text-[#134D31]">
                {n}
                <button
                  type="button"
                  aria-label={`Remove ${n}`}
                  onClick={() => void remove(n)}
                  className={`flex size-11 items-center justify-center rounded-full ${focusRing}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        {suggestions.length > 0 && (
          <div className="mb-2.5">
            <p className="text-xs text-muted">Most kitchens have these:</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} type="button" aria-label={`Add ${s}`} onClick={() => void add(s)} className={pillButton}>
                  + {s}
                </button>
              ))}
              <button type="button" onClick={dismiss} className={`${pillButton} border-transparent text-muted`}>
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
          className="flex gap-2"
        >
          <input
            aria-label="Add something you always have"
            placeholder="Add something"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={textInput}
          />
          <button type="submit" className={pillButton}>
            Add
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-sale">
            That didn&apos;t save. Try again.
          </p>
        )}
      </div>
    </section>
  );
}
