"use client";

import { useState } from "react";
import { focusRing, pillButton, textInput } from "@/lib/ui";

export interface StoreChoice {
  id: string;
  name: string;
  address: string;
  chain: string;
}

type Status = "idle" | "searching" | "done" | "bad_zip" | "not_configured" | "error";

/** Looks up Kroger-family stores by ZIP code; tapping one chooses it. */
export function StorePicker({
  onChoose,
  onCancel,
}: {
  onChoose: (store: StoreChoice) => Promise<void>;
  onCancel: () => void;
}) {
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [stores, setStores] = useState<StoreChoice[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{5}$/.test(zip)) return setStatus("bad_zip");
    setStatus("searching");
    setSaveFailed(false);
    try {
      const res = await fetch(`/api/kroger/locations?zip=${zip}`);
      if (res.status === 503) return setStatus("not_configured");
      if (!res.ok) return setStatus("error");
      setStores((await res.json()) as StoreChoice[]);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  async function choose(s: StoreChoice) {
    setSaveFailed(false);
    try {
      await onChoose(s);
    } catch {
      setSaveFailed(true);
    }
  }

  return (
    <div className="grid gap-2 px-3.5 pb-3">
      <form onSubmit={search} className="flex items-end gap-2">
        <label className="grid flex-1 gap-1 text-xs text-muted">
          ZIP code
          <input
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
            className={textInput}
          />
        </label>
        <button type="submit" disabled={status === "searching"} className={pillButton}>
          Search
        </button>
        <button type="button" onClick={onCancel} className={pillButton}>
          Cancel
        </button>
      </form>
      <p aria-live="polite" role={status === "idle" || status === "searching" || status === "done" ? undefined : "alert"} className="text-[13px] text-muted empty:hidden">
        {status === "searching" && "Looking for stores…"}
        {status === "bad_zip" && "Enter a 5-digit ZIP code."}
        {status === "not_configured" && "Fred Meyer prices aren't set up yet."}
        {status === "error" && "We couldn't look up stores just now. Try again."}
        {status === "done" && stores.length === 0 && "No stores found near that ZIP code."}
        {saveFailed && "That didn't save. Try again."}
      </p>
      {status === "done" && stores.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-line">
          {stores.map((s) => (
            <li key={s.id} className="border-b border-[#F0F2EF] last:border-b-0">
              <button
                type="button"
                onClick={() => void choose(s)}
                className={`flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left ${focusRing}`}
              >
                <span className="text-[15px] font-medium">{s.name}</span>
                <span className="text-xs text-muted">{s.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
