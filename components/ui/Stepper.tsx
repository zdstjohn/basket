"use client";

import { Minus, Plus } from "lucide-react";
import { IconButton } from "./Button";

/** A number with fewer and more buttons. Never leaves min..max. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  fewerLabel,
  moreLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  fewerLabel: string;
  moreLabel: string;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <div className="inline-flex items-center gap-2">
      <IconButton icon={Minus} size={18} label={fewerLabel} softDisabled={value <= min} onClick={() => set(value - 1)} />
      <span aria-live="polite" className="bk-price min-w-8 text-center text-body text-ink">
        {value}
      </span>
      <IconButton icon={Plus} size={18} label={moreLabel} softDisabled={value >= max} onClick={() => set(value + 1)} />
    </div>
  );
}
