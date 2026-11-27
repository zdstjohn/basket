"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Calendar, ListChecks, Users } from "lucide-react";
import { Icon } from "@/components/ui/Icon";

const ITEMS = [
  { href: "/week", label: "This week", icon: Calendar },
  { href: "/favorites", label: "Favorites", icon: Bookmark },
  { href: "/list", label: "List", icon: ListChecks },
  { href: "/household", label: "Household", icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();
  // Add a meal is a full screen of its own: just the close button and the Add button.
  if (pathname.startsWith("/week/add")) return null;
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 mt-auto flex bg-surface px-2 pt-1 pb-[var(--bk-safe-bottom)] shadow-[inset_0_1px_0_var(--bk-line)]"
    >
      {ITEMS.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-label no-underline bk-press ${
              active ? "font-bold text-accent" : "font-semibold text-ink-soft"
            }`}
          >
            <Icon icon={icon} size={22} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
