import { portionFactor } from "@/lib/domain/portions";
import type { Diet, Person } from "@/lib/domain/types";
import { focusRing } from "@/lib/ui";

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
  const f = portionFactor(person.age, person.appetite);
  return f === 1 ? "1 portion" : String(f);
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

// Adults, vegetarians and kids each get their own badge color, as in the mockup.
function badgeColor(person: Person): string {
  if (person.diet !== "none") return "bg-green";
  return person.age >= 14 ? "bg-[#3D5A4A]" : "bg-[#8A5A2B]";
}

export function PersonRow({
  person,
  expanded,
  onClick,
}: {
  person: Person;
  expanded: boolean;
  onClick: () => void;
}) {
  const detail = detailText(person);
  const allergy = allergyText(person);
  return (
    <button
      type="button"
      data-testid="person-row"
      aria-expanded={expanded}
      onClick={onClick}
      className={`flex min-h-[50px] w-full items-center gap-3 bg-white px-3.5 py-[5px] text-left text-ink ${focusRing}`}
    >
      <span
        className={`flex size-[34px] flex-none items-center justify-center rounded-full text-[13px] font-semibold text-white ${badgeColor(person)}`}
      >
        {person.age}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{person.name}</span>
        {detail && <span className="block text-xs text-muted">{detail}</span>}
        {allergy && (
          <span className="mt-px flex items-center gap-1 text-xs font-semibold text-[#A6261B]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
              <path d="M12 3.5l9.5 16.5h-19z" />
              <path d="M12 10v4.5M12 17.6h.01" />
            </svg>
            {allergy}
          </span>
        )}
      </span>
      <span className="text-[13px] font-medium text-[#4A544F]">{portionText(person)}</span>
    </button>
  );
}
