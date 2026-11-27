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
  role?: "status" | "alert";
  children: ReactNode;
}) {
  return (
    <div role={role} data-tone={tone} className="flex items-center gap-2 rounded-md bg-sunk p-3 text-small text-ink">
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

export function OfflineStrip({ state }: { state: keyof typeof STRIP }) {
  const s = STRIP[state];
  return <Banner icon={s.icon}>{s.text}</Banner>;
}
