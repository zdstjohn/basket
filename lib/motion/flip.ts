import { useCallback, useLayoutEffect, useRef } from "react";
import { DUR, prefersReducedMotion } from "./motion";

export function invert(
  first: { left: number; top: number },
  last: { left: number; top: number },
): { dx: number; dy: number } {
  return { dx: first.left - last.left, dy: first.top - last.top };
}

type Pos = { left: number; top: number };

/** Positions of every [data-flip-key] at any depth, relative to the root so scrolling cancels out. */
export function measureKeys(root: HTMLElement): Map<string, { el: HTMLElement; pos: Pos }> {
  const base = root.getBoundingClientRect();
  const out = new Map<string, { el: HTMLElement; pos: Pos }>();
  root.querySelectorAll<HTMLElement>("[data-flip-key]").forEach((el) => {
    const key = el.getAttribute("data-flip-key");
    if (!key) return;
    const r = el.getBoundingClientRect();
    out.set(key, { el, pos: { left: r.left - base.left, top: r.top - base.top } });
  });
  return out;
}

function spring(): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue("--bk-spring-snap").trim() || "ease-out";
  } catch {
    return "ease-out";
  }
}

type Slides = WeakMap<HTMLElement, Animation>;

function play(slides: Slides, el: HTMLElement, frames: Keyframe[], duration: number, easing: string) {
  if (typeof el.animate !== "function") return;
  let a: Animation;
  try {
    a = el.animate(frames, { duration, easing });
  } catch {
    a = el.animate(frames, { duration, easing: "ease-out" });
  }
  if (a) slides.set(el, a);
}

function store(prev: { current: Map<string, Pos> | null }, now: Map<string, { el: HTMLElement; pos: Pos }>) {
  const next = new Map<string, Pos>();
  now.forEach(({ pos }, key) => next.set(key, pos));
  prev.current = next;
}

/**
 * When `signature` changes, every [data-flip-key] that moved slides from its old place (a fade under reduced motion).
 * A layout change outside `signature` (rows growing as prices and packshots arrive) never slides: stored positions
 * are re-measured after every such commit and whenever the root resizes, so only a signature change starts a slide.
 */
export function useFlipList(ref: React.RefObject<HTMLElement | null>, signature: string): void {
  const prev = useRef<Map<string, Pos> | null>(null);
  // Only the slides this hook started are cancelled; CSS animations (reveal, settle) are left alone.
  const slides = useRef<Slides>(new WeakMap());
  const lastSig = useRef<string | null>(null);
  // While a slide runs, element rects include its in-flight transform, so no re-measure happens until it ends.
  const slideEnd = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remeasure = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    if (Date.now() < slideEnd.current) return;
    store(prev, measureKeys(root));
  }, [ref]);

  // Runs after every commit.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (lastSig.current === signature) {
      remeasure();
      return;
    }
    lastSig.current = signature;
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    // A slide still running would put its in-flight transform into the measurement.
    root.querySelectorAll<HTMLElement>("[data-flip-key]").forEach((el) => {
      slides.current.get(el)?.cancel();
      slides.current.delete(el);
    });
    slideEnd.current = 0;
    const now = measureKeys(root);
    const before = prev.current;
    let started = false;
    if (before) {
      const reduced = prefersReducedMotion();
      const easing = spring();
      now.forEach(({ el, pos }, key) => {
        const old = before.get(key);
        if (!old) return;
        const { dx, dy } = invert(old, pos);
        if (dx === 0 && dy === 0) return;
        started = true;
        if (reduced) play(slides.current, el, [{ opacity: 0 }, { opacity: 1 }], DUR.fast, "linear");
        else play(slides.current, el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], DUR.snap, easing);
      });
    }
    // Positions are the settled layout positions, never mid-slide ones.
    store(prev, now);
    if (started) {
      const ms = prefersReducedMotion() ? DUR.fast : DUR.snap;
      slideEnd.current = Date.now() + ms;
      // Layout may have changed while the slide ran; catch up once it ends.
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        remeasure();
      }, ms + 20);
    }
  });

  // The root may appear after the first mount (a grid that renders once its data is in), so look after every commit
  // and observe whichever element is there now.
  const observed = useRef<{ el: HTMLElement; ro: ResizeObserver } | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (observed.current && observed.current.el !== root) {
      observed.current.ro.disconnect();
      observed.current = null;
    }
    if (!root || observed.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(root);
    observed.current = { el: root, ro };
  });
  useLayoutEffect(
    () => () => {
      observed.current?.ro.disconnect();
      observed.current = null;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = null;
    },
    [],
  );
}
