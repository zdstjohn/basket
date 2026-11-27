"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { photoVerdict, type Crop } from "@/lib/photos/verdict";

type PhotoState = "loading" | "ready" | "fallback";

const ASPECT: Record<Crop, string> = { hero: "aspect-hero", tile: "aspect-tile", thumb: "aspect-thumb" };

/** The tiny blurred color preview is a layer on the wrapper (never a second <img>), fed through a CSS variable. */
const PREVIEW_LAYER =
  "before:absolute before:inset-0 before:scale-110 before:bg-cover before:bg-center before:content-[''] before:bg-[image:var(--bk-photo-preview)] before:blur-[var(--bk-photo-blur)]";

/** Only a generated data URI is accepted as a preview; anything else would be a request. */
function previewVar(preview: string | null | undefined): CSSProperties | undefined {
  if (!preview || !/^data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+$/i.test(preview)) return undefined;
  return { "--bk-photo-preview": `url("${preview}")` } as CSSProperties;
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

/**
 * A recipe photo in one of the three crops. The box has its shape from the first paint, so nothing moves
 * when the photo arrives, fails or is too small. Plain <img>, never proxied.
 */
export function Photo({
  src,
  name,
  crop,
  preview,
  width,
  priority,
  hint,
  className,
  onDemote,
  imgRef,
}: {
  src: string | null;
  name: string;
  crop: Crop;
  preview?: string | null;
  width?: number | null;
  priority?: boolean;
  hint?: boolean;
  className?: string;
  onDemote?: () => void;
  imgRef?: Ref<HTMLImageElement>;
}) {
  const [state, setState] = useState<PhotoState>("loading");
  const [prevSrc, setPrevSrc] = useState(src);
  // A new link for a photo already on screen (a re-signed link) keeps it showing; after a failure, try again.
  if (src !== prevSrc) {
    setPrevSrc(src);
    if (!src || state === "fallback") setState("loading");
  }

  const el = useRef<HTMLImageElement | null>(null);
  const demote = useRef(onDemote);
  useEffect(() => {
    demote.current = onDemote;
  });
  const judged = useRef<string | null>(null);

  const attach = useCallback(
    (node: HTMLImageElement | null) => {
      el.current = node;
      setRef(imgRef, node);
    },
    [imgRef],
  );

  const handleLoad = useCallback(() => {
    const img = el.current;
    if (!img || !src) return;
    const key = `${src}|${crop}`;
    if (judged.current === key) return;
    judged.current = key;
    const verdict = photoVerdict(crop, width ?? img.naturalWidth);
    if (verdict === "fallback") {
      setState("fallback");
      return;
    }
    setState("ready");
    if (verdict === "demote") demote.current?.();
  }, [src, crop, width]);

  const handleError = useCallback(() => {
    judged.current = null;
    setState("fallback");
  }, []);

  // A cached photo can finish before React listens, so look once on mount and when the link changes.
  useEffect(() => {
    const img = el.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) handleLoad();
    else handleError();
  }, [src, handleLoad, handleError]);

  // A width we already know settles it before any request: too small is the fallback at once, with no download.
  const knownFallback = width != null && photoVerdict(crop, width) === "fallback";
  const shown: PhotoState = src && !knownFallback ? state : "fallback";
  const style = shown === "fallback" ? undefined : previewVar(preview);
  const letter = (Array.from(name.trim())[0] ?? "?").toUpperCase();

  return (
    <div
      data-photo-state={shown}
      style={style}
      className={`relative overflow-hidden bg-sunk ${ASPECT[crop]} ${style ? PREVIEW_LAYER : ""} ${className ?? ""}`}
    >
      {shown === "fallback" ? (
        crop === "thumb" ? (
          <div className="absolute inset-0 grid place-items-center">
            <span aria-hidden="true" className="font-display text-title text-ink-soft">
              {letter}
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span aria-hidden="true" className="bk-fallback-letter">
              {letter}
            </span>
            {hint !== false && <span className="text-small font-semibold text-ink-soft">Add a photo</span>}
          </div>
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- recipe photos come from many sites and are never proxied
        <img
          ref={attach}
          src={src ?? undefined}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          loading={priority ? undefined : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          onLoad={handleLoad}
          onError={handleError}
          className={`bk-photo absolute inset-0 size-full transition-opacity duration-[var(--bk-dur-base)] ease-out motion-reduce:transition-none ${
            state === "ready" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
