"use client";

import type { ReactNode, Ref } from "react";
import { Bookmark } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "@/components/ui/Photo";

/**
 * A dinner as a pinboard tile: the photo with a day stamp on it, then the name, a note and any flag lines.
 * With `onOpen` the whole tile is one button; without it the tile is plain and `trailing` may hold controls.
 * Flag lines are never clamped.
 */
export function MealTile({
  name,
  photo,
  preview,
  width,
  stamp,
  stampTone = "day",
  note,
  lines,
  favorite,
  onOpen,
  trailing,
  imgRef,
  hint,
}: {
  name: string;
  photo: string | null;
  preview?: string | null;
  width?: number | null;
  stamp?: string;
  stampTone?: "day" | "tonight";
  note?: string;
  lines?: ReactNode;
  favorite?: boolean;
  onOpen?: () => void;
  trailing?: ReactNode;
  imgRef?: Ref<HTMLImageElement>;
  hint?: boolean;
}) {
  const body = (
    <>
      <span className="relative block">
        <Photo
          src={photo}
          name={name}
          crop="tile"
          preview={preview}
          width={width}
          imgRef={imgRef}
          hint={hint}
          className="rounded-t-md"
        />
        {stamp && (
          <span
            className={`absolute left-1.5 top-1.5 rounded-xs bg-surface px-1 py-0.5 text-label bk-caps ${
              stampTone === "tonight" ? "text-accent" : "text-ink"
            }`}
          >
            {stamp}
          </span>
        )}
      </span>
      <span className="block px-2.5 py-2">
        <span className="block line-clamp-2 break-words text-small font-semibold">{name}</span>
        {note && <span className="block line-clamp-1 text-label text-ink-soft">{note}</span>}
        {lines}
        {favorite && (
          <span className="mt-1 block text-ink">
            <Icon icon={Bookmark} size={18} label="Favorite" />
          </span>
        )}
        {trailing}
      </span>
    </>
  );
  const shell = "relative block w-full rounded-md bg-surface text-left text-ink";
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${shell} bk-press`}>
      {body}
    </button>
  ) : (
    <div className={shell}>{body}</div>
  );
}
