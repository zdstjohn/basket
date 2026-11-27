"use client";

import { useRef } from "react";
import { resizeForUpload } from "@/lib/photos/upload";
import type { DishGuess } from "@/lib/ai/schemas";
import type { RecipeSource } from "@/lib/recipes/search/provider";
import { Camera } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { ghostButton } from "@/lib/ui";
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
    throw new Error("We couldn’t use that photo. Try another one.");
  }
  onThumb(blob, URL.createObjectURL(blob));
  try {
    return { blob, result: await identifyDish(b64, source) };
  } catch (e) {
    if (e instanceof ApiFailure && e.kind === "unreadable") {
      throw new Error("We couldn’t tell what that is. Try another photo.");
    }
    throw new Error(messageFor(e));
  }
}

/** The camera button: opens the phone's picker (camera or gallery). */
export function FindMyDishButton({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`${ghostButton} w-full`}>
        <Icon icon={Camera} size={18} />
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
    <div className="bk-gutter mt-3">
      <div className="flex items-start gap-3 rounded-md bg-surface p-3">
        {state.url && (
          // eslint-disable-next-line @next/next/no-img-element -- the person's own photo, a local blob
          <img src={state.url} alt="Your dish photo" className="size-16 shrink-0 rounded-sm object-cover" />
        )}
        <div className="min-w-0 flex-1 self-center text-body" aria-live="polite">
          {state.phase === "looking" && (
            <p role="status" className="text-ink-soft">
              Looking at your dish…
            </p>
          )}
          {state.phase === "found" && (
            <>
              <p className="font-semibold text-ink">
                Looks like:{" "}
                <button
                  type="button"
                  onClick={onChangeName}
                  className="inline-flex min-h-11 items-center text-left font-semibold text-ink underline underline-offset-2"
                >
                  {state.guess.dish}
                </button>
              </p>
              {state.guess.confidence === "low" && (
                <p className="text-small text-ink-soft">Not sure? Edit the name and search again.</p>
              )}
            </>
          )}
          {state.phase === "notfood" && <p className="font-semibold text-ink">That doesn’t look like a dish. Try another photo.</p>}
          {state.phase === "error" && (
            <p role="alert" className="font-semibold text-error">
              {state.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
