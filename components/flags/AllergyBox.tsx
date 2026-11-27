import { TriangleAlert } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { allergyCopy, type Flag } from "@/lib/domain/flags";
import type { Person } from "@/lib/domain/types";

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The body with the foods it names in bold: "This recipe lists almonds. Other ingredients can have nuts in them too, so check every label." */
function Body({ text, found }: { text: string; found: string[] }) {
  const cut = text.indexOf(". Other ");
  const first = cut === -1 ? text : text.slice(0, cut);
  const rest = cut === -1 ? "" : text.slice(cut);
  const words = [...new Set(found)].sort((a, b) => b.length - a.length).map(escape);
  if (words.length === 0) return <>{text}</>;
  const parts = first.split(new RegExp(`\\b(${words.join("|")})\\b`));
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part))}
      {rest}
    </>
  );
}

/** The red allergy warning: who has the allergy, what the recipe lists, and a reminder to check every label. */
export function AllergyBox({ flags, people, className = "mx-4 mt-3" }: { flags: Flag[]; people: Person[]; className?: string }) {
  const allergies = flags.filter((f) => f.kind === "allergy");
  const copy = allergyCopy(allergies, people);
  if (!copy) return null;
  return (
    <section
      role="alert"
      aria-label="Allergy"
      data-testid="allergy-box"
      className={`${className} flex items-start gap-2 rounded-md border border-error bg-error-tint p-3`}
    >
      <span className="flex text-error">
        <Icon icon={TriangleAlert} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-small font-bold text-error">{copy.head}</p>
        <p className="mt-1 break-words text-small text-ink">
          <Body text={copy.body} found={allergies.flatMap((f) => f.found)} />
        </p>
      </div>
    </section>
  );
}
