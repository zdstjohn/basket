import { ChevronRight, TriangleAlert } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { portionFactor } from "@/lib/domain/portions";
import type { Diet, Person } from "@/lib/domain/types";
import { portionText as portionWords } from "@/lib/text/typography";

export const DIETS: { value: Diet; label: string }[] = [
  { value: "none", label: "None" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "pescatarian", label: "Pescatarian" },
];

const DIET_NAME: Record<Diet, string> = {
  none: "No restrictions",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
};

export function portionText(person: Person): string {
  return portionWords(portionFactor(person.age, person.appetite));
}

/** Diet and won't-eat foods; empty when the only thing to say is an allergy (that gets its own line). */
export function detailText(person: Person): string {
  const parts: string[] = [];
  if (person.diet !== "none") parts.push(DIET_NAME[person.diet]);
  if (person.dislikes.length > 0) parts.push(`Won’t eat ${person.dislikes.join(", ")}`);
  if (parts.length > 0) return parts.join(" · ");
  return (person.allergies ?? []).length > 0 ? "" : DIET_NAME.none;
}

export function allergyText(person: Person): string | null {
  const list = person.allergies ?? [];
  if (list.length === 0) return null;
  return `${list.length === 1 ? "Allergy" : "Allergies"}: ${list.join(", ")}`;
}

/** One person: an initial, the name, what they eat, and their allergies in words (never clamped). Tapping opens the editor. */
export function PersonRow({
  person,
  expanded,
  onClick,
  label,
}: {
  person: Person;
  expanded: boolean;
  onClick: () => void;
  /** The name as shown ("Daughter (4)" when another person shares it); the plain name when omitted. */
  label?: string;
}) {
  const detail = detailText(person);
  const allergy = allergyText(person);
  const shown = label ?? person.name;
  return (
    <button
      type="button"
      data-testid="person-row"
      aria-expanded={expanded}
      onClick={onClick}
      className="flex min-h-13 w-full items-center gap-3 py-2 text-left text-ink"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunk text-small font-semibold text-ink"
      >
        {shown.trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body">{shown}</span>
        <span className="block text-small text-ink-soft">{portionText(person)}</span>
        {detail && <span className="block text-small text-ink-soft">{detail}</span>}
        {allergy && (
          <span className="flex items-start gap-1 text-small font-semibold text-error">
            <Icon icon={TriangleAlert} size={18} className="mt-0.5" />
            <span className="min-w-0">{allergy}</span>
          </span>
        )}
      </span>
      <Icon
        icon={ChevronRight}
        size={18}
        className={`text-ink-soft transition-transform duration-[var(--bk-dur-fast)] ease-out ${expanded ? "rotate-90" : ""}`}
      />
    </button>
  );
}
