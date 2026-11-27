"use client";

import type { ReactNode } from "react";
import { Check as CheckGlyph } from "lucide-react";
import { Icon } from "./Icon";

/** A checkbox: a real input in a 44 x 44 label. The stroke is drawn in over --bk-dur-fast (a transition, so it reverses). */
export function Check({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <label className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center rounded-xs border-[1.5px] text-ground transition-colors duration-[var(--bk-dur-fast)] ease-out peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent [&_path]:[stroke-dasharray:24] [&_path]:transition-[stroke-dashoffset] [&_path]:duration-[var(--bk-dur-fast)] [&_path]:ease-out ${
          checked ? "border-ink bg-ink [&_path]:[stroke-dashoffset:0]" : "border-line-strong [&_path]:[stroke-dashoffset:24]"
        }`}
      >
        <Icon icon={CheckGlyph} size={18} />
      </span>
      {children}
    </label>
  );
}
