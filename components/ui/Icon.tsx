import type { LucideIcon } from "lucide-react";

/** The only way an icon is drawn: Lucide, 1.75 stroke, the surrounding text color. Hidden from readers unless it has a label. */
export function Icon({
  icon: Glyph,
  size = 18,
  label,
  className,
}: {
  icon: LucideIcon;
  size?: 18 | 22 | 24;
  label?: string;
  className?: string;
}) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={`shrink-0 ${className ?? ""}`}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}
