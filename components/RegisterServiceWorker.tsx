"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) for every signed-in screen, so the app can be installed
 * and the shopping list opens with no signal. Production builds only: in dev a worker would serve stale files.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
