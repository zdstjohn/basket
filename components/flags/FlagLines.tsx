import { TriangleAlert } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { allergyCopy, findFlags, flagCopy, ingredientNames, type Flag } from "@/lib/domain/flags";
import type { Meal, Person } from "@/lib/domain/types";
import type { RecipeOption } from "@/lib/recipes/search/provider";

export type CardLine = "shares" | "made" | "allergy" | "dislike";

// A search card shows at most this many lines under its rating-and-time line.
const MOST_LINES = 3;

/** Which extra lines a card shows, in order. With four, the shares line goes first, then the made line; the allergy line stays. */
export function cardLines(have: Record<CardLine, boolean>): CardLine[] {
  const lines = (["shares", "made", "allergy", "dislike"] as const).filter((l) => have[l]);
  while (lines.length > MOST_LINES) {
    const drop = lines.find((l) => l === "shares") ?? lines.find((l) => l === "made");
    if (!drop) break;
    lines.splice(lines.indexOf(drop), 1);
  }
  return lines;
}

interface Line {
  kind: "allergy" | "dislike";
  head: string | null;
  body: string;
}

/** The lines a card shows for these flags: every allergy merged into one, then the first dislike. */
function linesFor(flags: Flag[], people: Person[]): Line[] {
  const out: Line[] = [];
  const allergies = flags.filter((f) => f.kind === "allergy");
  if (allergies.length === 1) {
    const c = flagCopy(allergies[0], people);
    out.push({ kind: "allergy", head: c.cardHead, body: c.cardBody });
  } else if (allergies.length > 1) {
    const c = allergyCopy(allergies, people);
    if (c) out.push({ kind: "allergy", head: c.head, body: c.body });
  }
  const dislike = flags.find((f) => f.kind === "dislike");
  if (dislike) out.push({ kind: "dislike", head: null, body: flagCopy(dislike, people).cardBody });
  return out;
}

/** The flags for a recipe option or a saved meal; nothing until people are known. */
export function flagsOf(src: RecipeOption | Meal, people: Person[]): Flag[] {
  return people.length === 0 ? [] : findFlags(ingredientNames(src), people);
}

/** For a card's name: ", Tree nut allergy: Daughter (4). Lists almonds. Check labels." or "". */
export function cardFlagText(src: RecipeOption | Meal, people: Person[]): string {
  return linesFor(flagsOf(src, people), people)
    .map((l) => `, ${l.head ? `${l.head}. ` : ""}${l.body}`)
    .join("");
}

/** The allergy line and the first won't-eat line under a card's other lines. Made of spans, so it can sit inside a button. */
export function FlagLines({ flags, people, onPhoto = false }: { flags: Flag[]; people: Person[]; onPhoto?: boolean }) {
  const lines = linesFor(flags, people);
  if (lines.length === 0) return null;
  return (
    <span className={`mt-2 flex flex-col gap-1 ${onPhoto ? "" : "border-t border-line pt-2"}`}>
      {lines.map((l) =>
        l.kind === "allergy" ? (
          <span
            key="allergy"
            data-testid="result-flag"
            data-kind="allergy"
            className={`flex items-start gap-2 break-words text-label font-semibold ${onPhoto ? "text-on-photo" : "text-error"}`}
          >
            <Icon icon={TriangleAlert} size={18} />
            <span className="min-w-0">
              <span className="block">{l.head}</span>
              {l.body}
            </span>
          </span>
        ) : (
          <span
            key="dislike"
            data-testid="result-flag"
            data-kind="dislike"
            className={`block break-words text-label ${onPhoto ? "text-on-photo" : "text-ink-soft"}`}
          >
            {l.body}
          </span>
        ),
      )}
    </span>
  );
}
