"use client";

import { useState } from "react";
import type { RecipeDraft } from "@/lib/ai/schemas";
import { ErrorBanner } from "@/components/ui/states";
import { TextAreaField } from "@/components/ui/Field";
import { ghostButton } from "@/lib/ui";
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
      className="bk-gutter mt-3 flex flex-col items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void read();
      }}
    >
      <TextAreaField
        id="paste"
        label="Recipe text or link"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="Paste the ingredients, or a link to the recipe"
        className="w-full [&_textarea]:min-h-32"
      />
      <button type="submit" disabled={loading || !value.trim()} className={ghostButton}>
        {loading ? "Reading…" : "Read recipe"}
      </button>
      {error && (
        <div className="w-full">
          <ErrorBanner message={error} />
        </div>
      )}
    </form>
  );
}
