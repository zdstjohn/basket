"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { DUR, prefersReducedMotion } from "@/lib/motion/motion";
import { shouldDismiss, velocity } from "@/lib/motion/sheet-gesture";

const SheetCloseContext = createContext<() => void>(() => {});

/** Children call this to close the sheet with the same exit as a drag, Escape or a backdrop tap. */
export function useSheetClose(): () => void {
  return useContext(SheetCloseContext);
}

const FALLBACK_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function token(name: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return "";
  }
}
/** A duration token such as "400ms" in ms. */
function tokenMs(name: string, fallback: number): number {
  const v = token(name);
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : fallback;
}
function snapEase(): string {
  return token("--bk-spring-snap") || FALLBACK_EASE;
}
function outEase(): string {
  return token("--bk-ease-out") || FALLBACK_EASE;
}

/** The element's current vertical translation, wherever an animation or a drag has put it. */
function translateY(el: HTMLElement): number {
  try {
    const t = getComputedStyle(el).transform;
    if (!t || t === "none") return 0;
    return new DOMMatrixReadOnly(t).m42;
  } catch {
    return 0;
  }
}

function play(el: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof el.animate !== "function") return null;
  return el.animate(keyframes, options);
}
/** Resolves when the animation ends or is cancelled (and never hangs on a stalled one). */
function ended(anims: (Animation | null)[], ms: number): Promise<void> {
  const live = anims.filter((a): a is Animation => a !== null);
  if (live.length === 0) return Promise.resolve();
  const all = Promise.all(live.map((a) => a.finished.then(() => undefined, () => undefined))).then(() => undefined);
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, ms + 150))]);
}

/** True for a touch that belongs to something else: a field, a slider, an editable area, or an inner scroller that is not at its top. */
function startsInOwnGesture(target: Element, stop: Element | null): boolean {
  for (let el: Element | null = target; el && el !== stop; el = el.parentElement) {
    if (el.matches("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return true;
    const h = el as HTMLElement;
    try {
      const oy = getComputedStyle(h).overflowY;
      if ((oy === "auto" || oy === "scroll") && h.scrollHeight > h.clientHeight && h.scrollTop > 0) return true;
    } catch {
      // No computed style: treat it as an ordinary element.
    }
  }
  return false;
}

type Sample = { t: number; y: number };
type Gesture = {
  /** pending: a touch has begun but not yet chosen between scrolling and dragging. */
  mode: "pending" | "drag" | "scroll";
  startY: number;
  startX: number;
  baseY: number;
  y: number;
  samples: Sample[];
};

/**
 * A bottom sheet on the browser's own modal dialog: it traps focus, closes on Escape, follows the finger
 * and leaves with the same exit however it is closed. The dialog covers the screen and is transparent;
 * the scrim and the panel are inside it so both can be animated.
 */
export function Sheet({
  label,
  onClose,
  title,
  enter = "slide",
  children,
}: {
  label: string;
  onClose: () => void;
  title?: string;
  enter?: "slide" | "none";
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const closedRef = useRef(false); // onClose has been called
  const closingRef = useRef(false); // the exit is playing
  const aliveRef = useRef(false);
  const animsRef = useRef<(Animation | null)[]>([]);
  const gestureRef = useRef<Gesture | null>(null);

  const cancelAnimations = useCallback(() => {
    for (const a of animsRef.current) a?.cancel();
    animsRef.current = [];
  }, []);

  /** Reports the close once: closes the dialog (which returns focus), then tells the parent. */
  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    const d = dialogRef.current;
    if (d?.open) d.close();
    onCloseRef.current();
  }, []);

  /** Plays the exit from wherever the sheet is, then closes. Safe to call many times. */
  const close = useCallback(() => {
    const panel = panelRef.current;
    if (closingRef.current || closedRef.current) return;
    closingRef.current = true;
    if (panel) panel.setAttribute("inert", ""); // its buttons cannot be tapped while it leaves
    gestureRef.current = null;
    if (!panel) {
      finish();
      return;
    }
    const scrim = scrimRef.current;
    const y = Math.max(0, translateY(panel));
    const panelOpacity = Number(getComputedStyle(panel).opacity) || 1;
    const scrimOpacity = scrim ? Number(getComputedStyle(scrim).opacity) || 1 : 1;
    cancelAnimations();
    const height = panel.offsetHeight || 0;
    const reduced = prefersReducedMotion();
    let anims: (Animation | null)[];
    let ms: number;
    if (reduced) {
      // Nothing travels: the sheet stays where it is and fades.
      ms = DUR.fast;
      const at = `translateY(${y}px)`;
      anims = [
        play(panel, [{ opacity: panelOpacity, transform: at }, { opacity: 0, transform: at }], { duration: ms, easing: "linear", fill: "forwards" }),
        play(scrim, [{ opacity: scrimOpacity }, { opacity: 0 }], { duration: ms, easing: "linear", fill: "forwards" }),
      ];
    } else {
      ms = tokenMs("--bk-dur-snap", DUR.snap);
      anims = [
        play(panel, [{ transform: `translateY(${y}px)` }, { transform: `translateY(${height}px)` }], {
          duration: ms,
          easing: snapEase(),
          fill: "forwards",
        }),
        play(scrim, [{ opacity: scrimOpacity }, { opacity: 0 }], {
          duration: tokenMs("--bk-dur-base", DUR.base),
          easing: outEase(),
          fill: "forwards",
        }),
      ];
    }
    animsRef.current = anims;
    void ended(anims, ms).then(() => {
      if (aliveRef.current) finish();
    });
  }, [cancelAnimations, finish]);

  // Open as a modal in the first layout pass, and play the enter before the first paint.
  useLayoutEffect(() => {
    const d = dialogRef.current;
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    aliveRef.current = true;
    if (d && !d.open) d.showModal();
    if (enter === "slide" && panel) {
      if (prefersReducedMotion()) {
        animsRef.current = [
          play(panel, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fast, easing: "linear" }),
          play(scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fast, easing: "linear" }),
        ];
      } else {
        animsRef.current = [
          play(panel, [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], {
            duration: tokenMs("--bk-dur-slow", DUR.slow),
            easing: snapEase(),
          }),
          play(scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: tokenMs("--bk-dur-base", DUR.base), easing: outEase() }),
        ];
      }
    }
    return () => {
      aliveRef.current = false;
      cancelAnimations();
    };
  }, [enter, cancelAnimations]);

  // ---- Dragging ----

  /** Picks the sheet up: stops whatever is moving it and starts a gesture from where it is. */
  const grab = useCallback((startY: number, mode: Gesture["mode"]): Gesture | null => {
    const panel = panelRef.current;
    if (!panel || closingRef.current) return null;
    const baseY = Math.max(0, translateY(panel));
    cancelAnimations();
    panel.style.transform = baseY > 0 ? `translateY(${baseY}px)` : "";
    const g: Gesture = { mode, startY, startX: 0, baseY, y: baseY, samples: [{ t: performance.now(), y: baseY }] };
    gestureRef.current = g;
    return g;
  }, [cancelAnimations]);

  /** The sheet's transform is the finger's travel, 1:1, never above its resting place. */
  const moveTo = useCallback((g: Gesture, clientY: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    g.y = Math.max(0, g.baseY + (clientY - g.startY));
    panel.style.transform = `translateY(${g.y}px)`;
    g.samples.push({ t: performance.now(), y: g.y });
    if (g.samples.length > 24) g.samples.shift();
  }, []);

  const springBack = useCallback((from: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = "";
    if (from <= 0 || prefersReducedMotion()) return; // under reduced motion it snaps back, nothing travels
    animsRef.current = [
      play(panel, [{ transform: `translateY(${from}px)` }, { transform: "translateY(0px)" }], {
        duration: tokenMs("--bk-dur-snap", DUR.snap),
        easing: snapEase(),
      }),
    ];
  }, []);

  /** Letting go: add a sample for this moment, so a pause before release counts as stopped. */
  const release = useCallback(() => {
    const g = gestureRef.current;
    const panel = panelRef.current;
    gestureRef.current = null;
    if (!g || !panel || g.mode !== "drag") return;
    g.samples.push({ t: performance.now(), y: g.y });
    const v = velocity(g.samples);
    // Only downward speed and distance count: a flick back up never dismisses.
    if (v >= 0 && shouldDismiss(g.y, panel.offsetHeight, v)) close();
    else springBack(g.y);
  }, [close, springBack]);

  const abandon = useCallback(() => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g && g.mode === "drag") springBack(g.y);
  }, [springBack]);

  // Touch drags on the content: the browser cancels pointer events once it starts scrolling, so these are touch events,
  // and touchmove must be non-passive so a downward pull at the top of the content can be kept from scrolling the page.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const SLOP = 3;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || closingRef.current) {
        abandon();
        return;
      }
      if (zoneRef.current?.contains(e.target as Node)) return; // the drag zone has its own pointer handlers
      const target = e.target as Element | null;
      const mode = target && startsInOwnGesture(target, scrollRef.current) ? "scroll" : "pending";
      gestureRef.current = { mode, startY: e.touches[0].clientY, startX: e.touches[0].clientX, baseY: 0, y: 0, samples: [] };
    };
    const onMove = (e: TouchEvent) => {
      const g = gestureRef.current;
      if (!g || e.touches.length !== 1) return;
      const clientY = e.touches[0].clientY;
      if (g.mode === "pending") {
        const dy = clientY - g.startY;
        const dx = e.touches[0].clientX - g.startX;
        if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
        const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
        // Only a mostly vertical, downward pull at the top of the content picks the sheet up.
        if (atTop && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
          const grabbed = grab(g.startY, "drag");
          if (!grabbed) return;
        } else {
          g.mode = "scroll";
          return;
        }
      }
      const current = gestureRef.current;
      if (!current || current.mode !== "drag") return;
      if (e.cancelable) e.preventDefault();
      moveTo(current, clientY);
    };
    const onEnd = () => {
      const g = gestureRef.current;
      if (g?.mode === "drag") release();
      else gestureRef.current = null;
    };
    const onCancel = () => abandon();
    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onCancel);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onCancel);
    };
  }, [abandon, grab, moveTo, release]);

  return (
    <SheetCloseContext.Provider value={close}>
      <dialog
        ref={dialogRef}
        aria-label={label}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={finish}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-transparent open:flex open:items-end"
      >
        <div
          ref={scrimRef}
          data-testid="sheet-scrim"
          aria-hidden="true"
          onClick={close}
          className="absolute inset-0 bg-[rgb(var(--bk-scrim)/0.5)]"
        />
        <div
          ref={panelRef}
          data-testid="sheet-panel"
          className="relative mx-auto flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-lg bg-raised pb-[var(--bk-safe-bottom)] text-ink shadow-2"
        >
          <div
            ref={zoneRef}
            data-testid="sheet-drag"
            className="flex min-h-11 w-full shrink-0 touch-none items-center justify-center"
            onPointerDown={(e) => {
              if (e.button !== 0 || closingRef.current) return;
              const g = grab(e.clientY, "drag");
              if (g) e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              const g = gestureRef.current;
              if (g && g.mode === "drag") moveTo(g, e.clientY);
            }}
            onPointerUp={release}
            onPointerCancel={abandon}
            onLostPointerCapture={abandon}
          >
            <div aria-hidden="true" className="h-1 w-9 rounded-xs bg-line-strong" />
          </div>
          {title ? (
            <div className="flex shrink-0 items-center justify-between gap-2 pl-4 pr-2">
              <h2 className="font-display text-title text-ink">{title}</h2>
              <IconButton icon={X} label="Close" onClick={close} />
            </div>
          ) : null}
          <div ref={scrollRef} data-testid="sheet-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </div>
      </dialog>
    </SheetCloseContext.Provider>
  );
}
