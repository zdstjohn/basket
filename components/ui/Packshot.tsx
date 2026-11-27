"use client";

import { useState } from "react";

/**
 * A store product shot on its own tile (.bk-packshot). The box is hidden, not removed, when the image
 * fails, so the row simply has no picture. Hidden is display: none, which keeps the image attached.
 */
export function Packshot({ src, alt, size = 44 }: { src: string | null; alt: string; size?: 44 | 64 }) {
  const [failed, setFailed] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(false);
  }
  if (!src) return null;
  return (
    <span hidden={failed} className={`bk-packshot block shrink-0 ${size === 64 ? "size-16" : "size-11"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small Kroger photo; it is hidden if it won't load */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-full"
      />
    </span>
  );
}
