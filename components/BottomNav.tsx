"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { focusRing } from "@/lib/ui";

const icon = (children: ReactNode, join: "round" | "miter" = "round") => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin={join}
    aria-hidden="true"
  >
    {children}
  </svg>
);

const ITEMS = [
  {
    href: "/week",
    label: "Week",
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </>,
    ),
  },
  {
    href: "/list",
    label: "List",
    icon: icon(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />),
  },
  {
    href: "/favorites",
    label: "Favorites",
    icon: icon(
      <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
    ),
  },
  {
    href: "/household",
    label: "Household",
    icon: icon(
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M17 14.5c2.3 0 4 1.5 4.5 4" />
      </>,
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 mt-auto flex justify-around border-t border-line bg-white pt-1.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))]"
    >
      {ITEMS.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 min-w-16 flex-col items-center gap-0.5 rounded-lg text-[11px] no-underline ${focusRing} ${
              active ? "font-semibold text-green" : "font-medium text-muted"
            }`}
          >
            {icon}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
