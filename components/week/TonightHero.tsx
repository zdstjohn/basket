"use client";

import type { AnimationEvent, CSSProperties, ReactNode, Ref } from "react";
import { Bookmark } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "@/components/ui/Photo";
import { dayName } from "@/lib/week/format";
import type { Day } from "@/lib/domain/weeks";

// The scrim is fully dark by a fixed 52 px, so the label and an allergy line keep contrast on a bright photo.
const SCRIM = "linear-gradient(rgb(var(--bk-scrim) / 0), rgb(var(--bk-scrim) / 0.8) 52px, rgb(var(--bk-scrim) / 0.92))";

/**
 * Tonight's dinner, full bleed and 2:1, with its words over a scrim. Only for a photo already known to be wide enough.
 * The box is 2:1 and grows when the words need more room, so a long allergy line is never cut off or pushed out of it.
 */
export function TonightHero({
  day,
  name,
  photo,
  preview,
  width,
  credit,
  note,
  lines,
  favorite,
  onOpen,
  onDemote,
  imgRef,
  reveal,
}: {
  day: Day;
  name: string;
  photo: string | null;
  preview?: string | null;
  width?: number | null;
  credit?: string | null;
  note?: string;
  lines?: ReactNode;
  favorite?: boolean;
  onOpen: () => void;
  onDemote: () => void;
  imgRef?: Ref<HTMLImageElement>;
  /** The open reveal, on the words only: the photo never fades or moves, so the largest paint is not held back. */
  reveal?: { className: string; style?: CSSProperties; onAnimationEnd?: (e: AnimationEvent<HTMLElement>) => void };
}) {
  return (
    <div data-testid={`day-row-${day}`} data-tonight>
      <button type="button" onClick={onOpen} className="relative block w-full text-left text-on-photo">
        <span className="relative flex aspect-hero flex-col justify-end">
          <Photo
            src={photo}
            name={name}
            crop="hero"
            preview={preview}
            width={width}
            priority
            hint={false}
            onDemote={onDemote}
            onFallback={onDemote}
            imgRef={imgRef}
            className="absolute! inset-0 aspect-auto!"
          />
          <span
            data-on-photo
            style={{ backgroundImage: SCRIM, ...reveal?.style }}
            onAnimationEnd={reveal?.onAnimationEnd}
            className={`relative block px-4 pb-3 pt-12 ${reveal?.className ?? ""}`}
          >
            <span className="block text-label bk-caps text-on-photo-accent">Tonight · {dayName(day)}</span>
            <span className="mt-0.5 line-clamp-2 break-words font-display text-title text-on-photo">{name}</span>
            {lines}
            {(note || credit) && (
              <span className="mt-0.5 flex justify-between gap-2 text-label text-on-photo">
                <span className="min-w-0">{note}</span>
                {credit && <span className="shrink-0">Photo: {credit}</span>}
              </span>
            )}
          </span>
        </span>
        {favorite && (
          <span data-on-photo style={{ backgroundColor: "rgb(var(--bk-scrim) / 0.6)" }} className="absolute right-3 top-3 rounded-sm p-1 text-on-photo">
            <Icon icon={Bookmark} size={18} label="Favorite" />
          </span>
        )}
      </button>
    </div>
  );
}
