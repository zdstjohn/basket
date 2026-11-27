"use client";

import type { ReactNode } from "react";
import { Check, WifiOff, type LucideIcon } from "lucide-react";
import { Icon } from "./Icon";

/** A status line: stale prices, offline, saved. */
export function Banner({
  tone = "info",
  icon,
  role = "status",
  children,
}: {
  tone?: "info";
  icon?: LucideIcon;
  /** null when a parent already holds the live region (OfflineStrip). */
  role?: "status" | "alert" | null;
  children: ReactNode;
}) {
  return (
    <div role={role ?? undefined} data-tone={tone} className="flex items-center gap-2 rounded-md bg-sunk p-3 text-small text-ink">
      {icon && <Icon icon={icon} size={18} />}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

const STRIP = {
  offline: { icon: WifiOff, text: "Offline. Showing your last list." },
  back: { icon: Check, text: "Back online." },
  saved: { icon: Check, text: "Back online. Saved." },
} as const;

/** The live region stays mounted; only its content comes and goes, so a change is spoken. */
export function OfflineStrip({ state }: { state: keyof typeof STRIP | null }) {
  const s = state ? STRIP[state] : null;
  return (
    <div role="status">
      {s && (
        <Banner role={null} icon={s.icon}>
          {s.text}
        </Banner>
      )}
    </div>
  );
}
