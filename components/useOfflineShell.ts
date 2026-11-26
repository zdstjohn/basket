"use client";

import { useEffect, useState } from "react";

/**
 * Lets the shopping list open with no signal: a small service worker (public/sw.js) keeps the list page
 * and its scripts. Returns true once they are saved. Only in production builds.
 */
export function useOfflineShell(enabled: boolean): boolean {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!enabled || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let alive = true;
    const onMessage = (e: MessageEvent) => {
      if (alive && e.data?.type === "precached") setSaved(true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const assets = performance
          .getEntriesByType("resource")
          .map((r) => new URL(r.name).pathname)
          .filter((p) => p.startsWith("/_next/static/"));
        reg.active?.postMessage({ type: "precache", page: "/list", assets: [...new Set(assets)] });
      })
      .catch(() => {});
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [enabled]);
  return saved;
}
