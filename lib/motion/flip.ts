import { useLayoutEffect, useRef } from "react";
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

/** When `signature` changes, every [data-flip-key] that moved slides from its old place (a fade under reduced motion). */
export function useFlipList(ref: React.RefObject<HTMLElement | null>, signature: string): void {
  const prev = useRef<Map<string, Pos> | null>(null);
  // Only the slides this hook started are cancelled; CSS animations (reveal, settle) are left alone.
  const slides = useRef<Slides>(new WeakMap());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    // A slide still running would put its in-flight transform into the measurement.
    root.querySelectorAll<HTMLElement>("[data-flip-key]").forEach((el) => {
      slides.current.get(el)?.cancel();
      slides.current.delete(el);
    });
    const now = measureKeys(root);
    const before = prev.current;
    if (before) {
      const reduced = prefersReducedMotion();
      const easing = spring();
      now.forEach(({ el, pos }, key) => {
        const old = before.get(key);
        if (!old) return;
        const { dx, dy } = invert(old, pos);
        if (dx === 0 && dy === 0) return;
        if (reduced) play(slides.current, el, [{ opacity: 0 }, { opacity: 1 }], DUR.fast, "linear");
        else play(slides.current, el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], DUR.snap, easing);
      });
    }
    const next = new Map<string, Pos>();
    now.forEach(({ pos }, key) => next.set(key, pos));
    prev.current = next;
  }, [ref, signature]);
}
