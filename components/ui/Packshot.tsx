"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * A store product shot on its own tile (.bk-packshot). The box is hidden, not removed, when the image
 * fails, so the row simply has no picture. Hidden is display: none, which keeps the image attached.
 */
export function Packshot({ src, alt, size = 44 }: { src: string | null; alt: string; size?: 44 | 64 }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement | null>(null);
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(false);
  }
  // The error can fire before React listens (before hydration), so look once on mount and when the link changes.
  useEffect(() => {
    const node = img.current;
    if (node && node.complete && node.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (!src) return null;
  return (
    <span
      hidden={failed}
      style={size === 64 ? ({ "--bk-packshot-radius": "var(--radius-md)" } as CSSProperties) : undefined}
      className={`bk-packshot block shrink-0 ${size === 64 ? "size-16" : "size-11"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small Kroger photo; it is hidden if it won't load */}
      <img
        ref={img}
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
