import type { RecipeDraft } from "@/lib/ai/schemas";
import type { RecipeOption, RecipeSource } from "@/lib/recipes/search/provider";

export interface SearchResult {
  options: RecipeOption[];
  source: RecipeSource;
  fellBack: boolean;
  toppedUp: boolean;
}

export type Failure = "cap" | "source_limit" | "unreadable" | "other";

export class ApiFailure extends Error {
  constructor(readonly kind: Failure) {
    super(kind);
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure("other");
  }
  if (res.ok) return (await res.json()) as T;
  if (res.status === 402) throw new ApiFailure("cap");
  if (res.status === 429) throw new ApiFailure("source_limit");
  if (res.status === 422) throw new ApiFailure("unreadable");
  throw new ApiFailure("other");
}

export const searchRecipes = (query: string, source: RecipeSource) =>
  post<SearchResult>("/api/recipes/search", { query, source });

export const draftFromOption = (option: RecipeOption) =>
  post<RecipeDraft>("/api/meals/draft", { mode: "option", option });

export const draftFromText = (value: string) => post<RecipeDraft>("/api/meals/draft", { mode: "text", value });

export const MESSAGES: Record<Failure, string> = {
  cap: "This month's recipe help is used up. You can still type the ingredients in.",
  source_limit: "Spoonacular's daily limit is used up. Big sites still works.",
  unreadable: "We couldn't read that recipe. Try another one, or paste the ingredients.",
  other: "Something went wrong. Try again.",
};

/** The plain message for a failed call (a pasted link that can't be read has its own wording). */
export function messageFor(e: unknown, pastedLink = false): string {
  const kind = e instanceof ApiFailure ? e.kind : "other";
  if (kind === "unreadable" && pastedLink) {
    return "We couldn't read that page. Try pasting the recipe text instead.";
  }
  return MESSAGES[kind];
}
