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
  const parts = first.split(new RegExp(`(${words.join("|")})`));
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part))}
      {rest}
    </>
  );
}

/** The red allergy warning: who has the allergy, what the recipe lists, and a reminder to check every label. */
export function AllergyBox({ flags, people }: { flags: Flag[]; people: Person[] }) {
  const allergies = flags.filter((f) => f.kind === "allergy");
  const copy = allergyCopy(allergies, people);
  if (!copy) return null;
  return (
    <section
      role="alert"
      aria-label="Allergy"
      data-testid="allergy-box"
      className="mx-5 mt-3 flex gap-2.5 rounded-[14px] border-[1.5px] border-[#A6261B] bg-[#FDE8E6] px-3.5 py-3"
    >
      <span className="mt-px flex text-[#A6261B]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
          <path d="M12 3.5l9.5 16.5h-19z" />
          <path d="M12 10v4.5M12 17.6h.01" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] font-semibold text-[#A6261B]">{copy.head}</p>
        <p className="mt-[3px] break-words text-sm text-ink">
          <Body text={copy.body} found={allergies.flatMap((f) => f.found)} />
        </p>
      </div>
    </section>
  );
}
