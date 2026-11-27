"use client";

import { useId, useSyncExternalStore } from "react";
import { RadioRows } from "@/components/ui/RadioRows";
import { applyLook, readLook, saveLook, type Look } from "@/lib/look";

const OPTIONS: { value: Look; label: string; detail: string }[] = [
  { value: "light", label: "Light", detail: "Butter" },
  { value: "dark", label: "Dark", detail: "Cast Iron" },
  { value: "auto", label: "Match my phone", detail: "Follows your phone’s setting" },
];

const CHANGED = "basket:look-changed";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // another tab
  window.addEventListener(CHANGED, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** Light, Dark or Match my phone. Saved on this device only. With `labelledBy`, a visible heading names the group. */
export function LookPicker({ labelledBy }: { labelledBy?: string }) {
  const name = useId();
  const look = useSyncExternalStore(subscribe, () => readLook(), () => "auto" as Look);

  function choose(next: Look) {
    saveLook(next);
    applyLook();
    window.dispatchEvent(new Event(CHANGED));
  }

  return <RadioRows label="Look" labelledBy={labelledBy} name={name} options={OPTIONS} value={look} onChange={choose} />;
}
