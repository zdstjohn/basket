import type { DishGuess, RecipeDraft } from "@/lib/ai/schemas";
import type { RecipeOption, RecipeSource } from "@/lib/recipes/search/provider";

export interface SearchResult {
  options: RecipeOption[];
  source: RecipeSource;
  fellBack: boolean;
  toppedUp: boolean;
}

export interface IdentifyResult extends Partial<Omit<SearchResult, "options">> {
  guess: DishGuess;
  options: RecipeOption[];
}

export type Failure = "unauthorized" | "cap" | "source_limit" | "slow" | "busy" | "unreadable" | "other";

/** Which failure an HTTP status means. */
export function failureForStatus(status: number): Failure {
  if (status === 401) return "unauthorized";
  if (status === 402) return "cap";
  if (status === 429) return "source_limit";
  if (status === 422) return "unreadable";
  return "other";
}

/** Where to send someone whose session ended, so they come back to the same page. */
export function loginUrl(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

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
  let kind = failureForStatus(res.status);
  if (kind === "source_limit") {
    // 429 is also the spend guard saying slow down; only Spoonacular's own limit says source_limit.
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (body?.error === "slow_down") kind = "slow";
    else if (body?.error === "busy") kind = "busy";
  }
  if (kind === "unauthorized" && typeof window !== "undefined") {
    window.location.assign(loginUrl(window.location.pathname + window.location.search));
  }
  throw new ApiFailure(kind);
}

export const searchRecipes = (query: string, source: RecipeSource) =>
  post<SearchResult>("/api/recipes/search", { query, source });

/** A photo (base64 JPEG) goes in; a guess at the dish and matching recipe cards come out. */
export const identifyDish = (image: string, source: RecipeSource) =>
  post<IdentifyResult>("/api/recipes/identify", { image, source });

export const draftFromOption = (option: RecipeOption) =>
  post<RecipeDraft>("/api/meals/draft", { mode: "option", option });

export const draftFromText = (value: string) => post<RecipeDraft>("/api/meals/draft", { mode: "text", value });

export const MESSAGES: Record<Failure, string> = {
  unauthorized: "Signing you in again…",
  cap: "This month’s recipe help is used up. You can still type the ingredients in.",
  source_limit: "Spoonacular’s daily limit is used up. Big sites still works.",
  slow: "Too many tries just now. Wait a minute and try again.",
  busy: "Lots of people are searching right now. Try again in an hour.",
  unreadable: "We couldn’t read that recipe. Try another one, or paste the ingredients.",
  other: "Something went wrong. Try again.",
};

/** The plain message for a failed call (a pasted link that can't be read has its own wording). */
export function messageFor(e: unknown, pastedLink = false): string {
  const kind = e instanceof ApiFailure ? e.kind : "other";
  if (kind === "unreadable" && pastedLink) {
    return "We couldn’t read that page. Try pasting the recipe text instead.";
  }
  return MESSAGES[kind];
}
