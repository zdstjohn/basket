import type { ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { IconButton } from "./Button";

/**
 * The top of a screen: an optional back or close button, the title, an action on the right, then anything that belongs under the title.
 * It owns the screen's top inset.
 */
export function ScreenHeader({
  title,
  action,
  below,
  back,
  size = "display",
}: {
  title: string;
  action?: ReactNode;
  below?: ReactNode;
  /** A way out: a back chevron by default, or an X with `icon: "close"`. */
  back?: { href: string; label: string; icon?: "back" | "close" };
  size?: "display" | "title";
}) {
  return (
    <header data-bk-header className="bk-gutter pt-[var(--bk-safe-top)] pb-2">
      <div className="flex min-h-11 items-center gap-2">
        {back && <IconButton icon={back.icon === "close" ? X : ChevronLeft} label={back.label} href={back.href} />}
        <h1 className={`min-w-0 flex-1 font-display text-ink ${size === "title" ? "text-title" : "text-display"}`}>{title}</h1>
        {action}
      </div>
      {below}
    </header>
  );
}
