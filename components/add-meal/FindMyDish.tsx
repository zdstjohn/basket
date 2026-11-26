"use client";

import { useRef } from "react";
import { resizeForUpload } from "@/lib/photos/upload";
import type { DishGuess } from "@/lib/ai/schemas";
import type { RecipeSource } from "@/lib/recipes/search/provider";
import { focusRing } from "@/lib/ui";
import { ApiFailure, identifyDish, messageFor, type IdentifyResult } from "./api";

/** What the "Find my dish" card shows. */
export type DishState =
  | { phase: "looking"; url: string }
  | { phase: "found"; url: string; guess: DishGuess }
  | { phase: "notfood"; url: string }
  | { phase: "error"; url: string | null; message: string };

const PHOTO_EDGE = 1024;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/** Shrinks the photo in the browser, then asks for the dish. `onThumb` gets the small photo as soon as it exists. */
export async function lookUpDish(
  file: File,
  source: RecipeSource,
  onThumb: (blob: Blob, url: string) => void,
): Promise<{ blob: Blob; result: IdentifyResult }> {
  let blob: Blob;
  let b64: string;
  try {
    blob = await resizeForUpload(file, PHOTO_EDGE);
    b64 = await toBase64(blob);
  } catch {
    throw new Error("We couldn't use that photo. Try another one.");
  }
  onThumb(blob, URL.createObjectURL(blob));
  try {
    return { blob, result: await identifyDish(b64, source) };
  } catch (e) {
    if (e instanceof ApiFailure && e.kind === "unreadable") {
      throw new Error("We couldn't tell what that is. Try another photo.");
    }
    throw new Error(messageFor(e));
  }
}

/** The camera button: opens the phone's picker (camera or gallery). */
export function FindMyDishButton({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={`mt-2.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-green bg-white text-[15px] font-semibold text-green disabled:opacity-60 ${focusRing}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        Find my dish
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** The photo with what we made of it. */
export function DishCard({ state, onChangeName }: { state: DishState; onChangeName: () => void }) {
  return (
    <div className="mx-5 mt-3.5 flex items-start gap-3 rounded-2xl border border-line bg-white p-2.5">
      {state.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.url} alt="Your dish photo" className="size-[68px] shrink-0 rounded-[10px] object-cover" />
      )}
      <div className="min-w-0 flex-1 self-center text-[15px]" aria-live="polite">
        {state.phase === "looking" && <p role="status" className="text-muted">Looking at your dish…</p>}
        {state.phase === "found" && (
          <>
            <p className="font-semibold">
              Looks like:{" "}
              <button
                type="button"
                onClick={onChangeName}
                className={`inline-flex min-h-11 items-center text-left font-semibold text-green underline underline-offset-2 ${focusRing}`}
              >
                {state.guess.dish}
              </button>
            </p>
            {state.guess.confidence === "low" && (
              <p className="text-[13px] text-muted">Not sure? Edit the name and search again.</p>
            )}
          </>
        )}
        {state.phase === "notfood" && <p className="font-medium">That doesn&apos;t look like a dish. Try another photo.</p>}
        {state.phase === "error" && <p role="alert" className="font-medium text-[#A6261B]">{state.message}</p>}
      </div>
    </div>
  );
}
