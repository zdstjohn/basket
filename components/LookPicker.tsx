"use client";

import { useId, useSyncExternalStore } from "react";
import { applyLook, readLook, saveLook, type Look } from "@/lib/look";

const OPTIONS: { value: Look; label: string; detail: string }[] = [
  { value: "light", label: "Light", detail: "Butter" },
  { value: "dark", label: "Dark", detail: "Cast Iron" },
  { value: "auto", label: "Match my phone", detail: "Follows your phone’s setting" },
];

/** Light, Dark or Match my phone. Saved on this device only. */
const CHANGED = "basket:look-changed";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // another tab
  window.addEventListener(CHANGED, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** Light, Dark or Match my phone. Saved on this device only. */
export function LookPicker() {
  const name = useId();
  const look = useSyncExternalStore(subscribe, () => readLook(), () => "auto" as Look);

  function choose(next: Look) {
    saveLook(next);
    applyLook();
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <div role="radiogroup" aria-label="Look" className="divide-y divide-line">
      {OPTIONS.map((o) => (
        <label key={o.value} className="flex min-h-13 cursor-pointer items-center gap-3 py-2">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={look === o.value}
            onChange={() => choose(o.value)}
            aria-labelledby={`${name}-${o.value}-label`}
            aria-describedby={`${name}-${o.value}-detail`}
            className="size-5 shrink-0 accent-ink"
          />
          <span className="min-w-0 flex-1">
            <span id={`${name}-${o.value}-label`} className="block text-body text-ink">
              {o.label}
            </span>
            <span id={`${name}-${o.value}-detail`} className="block text-small text-ink-soft">
              {o.detail}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
