"use client";

import { useState } from "react";

/** A meal's photo, or an "Add a photo" tile when there is none or it will not load. */
export function MealThumb({
  src,
  className,
  tileText = "text-[9px] leading-[10px]",
}: {
  src: string | null;
  /** Size and rounding, e.g. "size-12 rounded-[10px]". */
  className: string;
  tileText?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center bg-green-tint p-1 text-center font-semibold text-[#134D31] ${tileText} ${className}`}
      >
        Add a photo
      </span>
    );
  }
  return (
    // A plain <img>: recipe photos come from many sites, and we never proxy them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`shrink-0 object-cover ${className}`}
    />
  );
}
