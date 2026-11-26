"use client";

import { useState } from "react";
import type { RecipeDraft } from "@/lib/ai/schemas";
import { focusRing } from "@/lib/ui";
import { draftFromText, messageFor } from "./api";

/** Paste recipe text, or a link to a recipe page. */
export function PasteTab({
  value,
  onChange,
  onDraft,
  onStart,
}: {
  value: string;
  onChange: (v: string) => void;
  onDraft: (d: RecipeDraft) => void;
  onStart: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    const text = value.trim();
    if (!text) return;
    onStart();
    setLoading(true);
    setError(null);
    try {
      onDraft(await draftFromText(text));
    } catch (e) {
      setError(messageFor(e, /^https?:\/\//i.test(text)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="mx-5 mt-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void read();
      }}
    >
      <label htmlFor="paste" className="mb-1.5 block text-[13px] font-semibold text-[#4A544F]">
        Recipe text or link
      </label>
      <textarea
        id="paste"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="Paste the ingredients, or a link to the recipe"
        className={`w-full rounded-xl border-[1.5px] border-green bg-white p-3.5 text-base ${focusRing}`}
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className={`mt-2 inline-flex h-12 items-center rounded-full bg-green px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${focusRing}`}
      >
        {loading ? "Reading…" : "Read recipe"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[15px] font-medium text-[#A6261B]">
          {error}
        </p>
      )}
    </form>
  );
}
