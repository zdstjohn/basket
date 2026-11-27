"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";

/** A food, an allergen or a pick. With onRemove it carries a 44 px remove button (name it with removeLabel, "Remove {name}"). */
type ChipProps = { children: ReactNode } & ({ onRemove?: undefined; removeLabel?: string } | { onRemove: () => void; removeLabel: string });

export function Chip({ children, onRemove, removeLabel }: ChipProps) {
  return (
    <span className={`inline-flex min-h-11 items-center rounded-md bg-surface text-small text-ink ${onRemove ? "pl-3" : "px-3"}`}>
      {children}
      {onRemove && <IconButton icon={X} size={18} label={removeLabel!} onClick={onRemove} />}
    </span>
  );
}
