"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ghostButton, mainAction } from "@/lib/ui";
import { Icon } from "./Icon";

type Variant = "main" | "ghost";
const VARIANT: Record<Variant, string> = { main: mainAction, ghost: ghostButton };

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant: Variant;
  /** While busy the button is disabled and shows busyLabel, and keeps the width of the longer of the two. */
  busy?: boolean;
  busyLabel?: string;
  className?: string;
};

export function Button({ variant, busy, busyLabel, className, children, disabled, onClick, type = "button", ...rest }: ButtonProps) {
  // Busy uses aria-disabled and a click guard, not `disabled`: a disabled button that has focus drops it.
  const blocked = Boolean(busy);
  return (
    <>
      <button
        type={type}
        disabled={disabled}
        aria-disabled={blocked || undefined}
        aria-busy={blocked || undefined}
        onClick={(e) => {
          if (blocked) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
        className={`${VARIANT[variant]} ${className ?? ""}`}
        {...rest}
      >
        {busy && busyLabel ? (
          <span className="grid" aria-hidden="true">
            <span className="invisible col-start-1 row-start-1 flex items-center justify-center gap-2">{children}</span>
            <span className="col-start-1 row-start-1 flex items-center justify-center gap-2">{busyLabel}</span>
          </span>
        ) : (
          children
        )}
      </button>
      <span role="status" className="sr-only">
        {busy && busyLabel ? busyLabel : ""}
      </span>
    </>
  );
}

type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> & {
  variant: Variant;
  href: string;
  className?: string;
  children?: ReactNode;
};

export function ButtonLink({ variant, href, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link href={href} className={`${VARIANT[variant]} ${className ?? ""}`} {...rest}>
      {children}
    </Link>
  );
}

const ICON_BOX =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink no-underline bk-press bk-press-icon";

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
  disabled?: boolean;
  /** Looks and reads as disabled, but keeps focus and ignores taps (a stepper at its limit). */
  softDisabled?: boolean;
  size?: 18 | 22 | 24;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "onClick" | "disabled" | "aria-label">;

/** A 44 x 44 icon-only control. The label is its accessible name. */
export function IconButton({ icon, label, onClick, href, className, disabled, softDisabled, size = 24, ...rest }: IconButtonProps) {
  const cls = `${ICON_BOX} ${className ?? ""}`;
  if (href !== undefined && !disabled) {
    return (
      <Link href={href} aria-label={label} onClick={onClick} className={cls}>
        <Icon icon={icon} size={size} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={softDisabled || undefined}
      onClick={softDisabled ? undefined : onClick}
      disabled={disabled}
      className={cls}
      {...rest}
    >
      <Icon icon={icon} size={size} />
    </button>
  );
}
