"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyLook, LOOK_KEY } from "@/lib/look";

/** Keeps the page's look (and the status-bar color) in step with the device setting. Renders nothing. */
export function ClientBoot() {
  const pathname = usePathname();

  // On mount, and again after every navigation: Next may re-emit the theme-color tags.
  useEffect(() => {
    applyLook();
  }, [pathname]);

  // Another tab changed the setting.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOOK_KEY || e.key === null) applyLook();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
