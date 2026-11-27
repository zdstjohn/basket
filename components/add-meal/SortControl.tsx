"use client";

import { Segmented } from "@/components/ui/Segmented";

export type SortMode = "loved" | "fits";

const SORTS: { id: SortMode; label: string }[] = [
  { id: "loved", label: "Most loved" },
  { id: "fits", label: "Fits this week" },
];

const STORAGE_KEY = "basket:add-meal-sort";

/** The choice made earlier this visit (kept for the browser session), or Most loved. */
export function loadSort(): SortMode {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === "fits" ? "fits" : "loved";
  } catch {
    return "loved";
  }
}

export function saveSort(mode: SortMode): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not remembering is fine.
  }
}

/** Two choices in a radio group (arrow keys move between them, and only the chosen one is a tab stop). */
export function SortControl({ value, onChange }: { value: SortMode; onChange: (m: SortMode) => void }) {
  return <Segmented label="Order results by" options={SORTS} value={value} onChange={onChange} />;
}
