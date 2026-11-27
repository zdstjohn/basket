import 'server-only';
import type { IngredientLine, Person } from '@/lib/domain/types';
import { eatsRole } from '@/lib/domain/portions';
import { fetchRecipePage } from '@/lib/recipes/import-url';
import { extractRecipeJsonLd } from '@/lib/recipes/jsonld';
import { searchRecipes } from '@/lib/recipes/search';
import type { RecipeOption, RecipeSource, SearchMeter } from '@/lib/recipes/search/provider';
import { generateStructured, UnreadableError, type UsageReport } from './provider';
import {
  LinesResultSchema, RecipeDraftSchema, VegSwapResultSchema, type RecipeDraft,
} from './schemas';

export { UnreadableError } from './provider';

export interface UsageEvent {
  kind: 'parse';
  model: string;
  inputTokens: number;
  outputTokens: number;
  assumed?: boolean;
}

export interface DraftOptions {
  /** Called once per model call. */
  onUsage?: (e: UsageEvent) => void;
  /** Counts the Brave requests the photo lookup sends; the caller bills them. */
  meter?: SearchMeter;
  /** Source for the photo lookup in draftFromText; defaults to the big sites. */
  source?: RecipeSource;
}

const MAX_TEXT = 20_000;
const MAX_LINES = 60;

const SYSTEM =
  'You turn recipe ingredient text into structured grocery lines for a family meal planner. ' +
  'canonical: the plain grocery name, lowercase, singular-free of brands and prep words ("boneless chicken thighs", "yellow onion"). ' +
  'amount and unit: the quantity as written for the whole recipe; use unit "each" for countable things. ' +
  'role: meat, fish, veg_protein (beans, tofu, lentils), produce, dairy, bakery, frozen, pantry or other. ' +
  'Put prep notes ("diced") in note. Skip water and optional garnishes. Never include cooking steps.';

const doesNotEatMeat = (people: Person[]): boolean =>
  people.some((p) => !eatsRole(p.diet, 'meat') || !eatsRole(p.diet, 'fish'));

const hasMeatOrFish = (lines: IngredientLine[]): boolean =>
  lines.some((l) => l.role === 'meat' || l.role === 'fish');

const clampServings = (n: number | null): number => Math.min(24, Math.max(1, Math.round(n ?? 4)));

function swapRule(wanted: boolean): string {
  return wanted
    ? 'Someone in the household does not eat meat or fish. If any ingredient is meat or fish, set vegSwap to ONE vegetarian protein that replaces it for that person (canonical, amountPerServing for one serving, unit, role "veg_protein"); otherwise null.'
    : 'Set vegSwap to null.';
}

type Report = (e: UsageEvent) => void;

const parseReporter = (report: Report | undefined) => (u: UsageReport) => report?.({ kind: 'parse', ...u });

async function linesFromStrings(
  strings: string[], wantSwap: boolean, report: Report | undefined,
): Promise<{ ingredients: IngredientLine[]; vegSwap: RecipeDraft['vegSwap'] }> {
  if (strings.length === 0) throw new UnreadableError();
  const r = await generateStructured({
    task: 'lines',
    schema: LinesResultSchema,
    system: `${SYSTEM} ${swapRule(wantSwap)}`,
    prompt: strings.slice(0, MAX_LINES).join('\n'),
    onUsage: parseReporter(report),
  });
  return r.object;
}

async function swapForLines(
  lines: IngredientLine[], report: Report | undefined,
): Promise<RecipeDraft['vegSwap']> {
  const r = await generateStructured({
    task: 'vegswap',
    schema: VegSwapResultSchema,
    system: `You suggest a vegetarian swap for a family meal planner. ${swapRule(true)}`,
    prompt: lines.map((l) => `${l.amount} ${l.unit} ${l.canonical} (${l.role})`).join('\n'),
    onUsage: parseReporter(report),
  });
  return r.object.vegSwap;
}

async function build(
  input: { name: string; servings: number | null; strings: string[]; structured: IngredientLine[] | null;
    sourceUrl: string; photo: RecipeDraft['photo'] },
  people: Person[],
  report: Report | undefined,
): Promise<RecipeDraft> {
  const wantSwap = doesNotEatMeat(people);
  let ingredients: IngredientLine[];
  let vegSwap: RecipeDraft['vegSwap'] = null;
  if (input.structured && input.structured.length > 0) {
    ingredients = input.structured.slice(0, MAX_LINES);
    if (wantSwap && hasMeatOrFish(ingredients)) {
      // A failed swap call (usage is already reported) must not lose the draft: the UI has a "no swap yet" state.
      vegSwap = await swapForLines(ingredients, report).catch(() => null);
    }
  } else {
    const r = await linesFromStrings(input.strings, wantSwap, report);
    ingredients = r.ingredients;
    vegSwap = wantSwap && hasMeatOrFish(ingredients) ? r.vegSwap : null;
  }
  const parsed = RecipeDraftSchema.safeParse({
    name: input.name,
    baseServings: clampServings(input.servings),
    ingredients,
    vegSwap,
    sourceUrl: input.sourceUrl,
    photo: input.photo,
  });
  if (!parsed.success) throw new UnreadableError();
  return parsed.data;
}

/** A chosen search result becomes a draft meal: structured lines, a vegetarian swap if needed, its photo. */
export async function draftFromOption(
  option: RecipeOption, people: Person[], opts: DraftOptions = {},
): Promise<RecipeDraft> {
  return build(
    {
      name: option.title,
      servings: option.servings,
      strings: option.ingredients,
      structured: option.structured,
      sourceUrl: option.url,
      photo: { url: option.image, credit: option.site, creditUrl: option.url },
    },
    people,
    opts.onUsage,
  );
}

/** A pasted recipe, or a recipe URL (a value starting with "http"). */
export async function draftFromText(
  text: string, people: Person[], opts: DraftOptions = {},
): Promise<RecipeDraft> {
  const value = text.trim().slice(0, MAX_TEXT);
  let draft: RecipeDraft;

  if (/^https?:\/\//i.test(value)) {
    const html = await fetchRecipePage(value);
    const recipe = extractRecipeJsonLd(html, value);
    if (!recipe || !recipe.name) throw new UnreadableError();
    let host = value;
    try {
      host = new URL(value).hostname.replace(/^www\./, '');
    } catch {
      /* fetchRecipePage already validated it */
    }
    draft = await build(
      {
        name: recipe.name,
        servings: recipe.servings,
        strings: recipe.ingredients,
        structured: null,
        sourceUrl: value,
        photo: recipe.image ? { url: recipe.image, credit: host, creditUrl: value } : null,
      },
      people,
      opts.onUsage,
    );
  } else {
    const wantSwap = doesNotEatMeat(people);
    const r = await generateStructured({
      task: 'text',
      schema: RecipeDraftSchema,
      system:
        `${SYSTEM} The user pastes a whole recipe. Return name, baseServings (how many it serves, 4 if unstated), ` +
        `ingredients, sourceUrl null and photo null. Do not copy the cooking steps. ${swapRule(wantSwap)}`,
      prompt: value,
      onUsage: parseReporter(opts.onUsage),
    });
    draft = {
      ...r.object,
      vegSwap: wantSwap && hasMeatOrFish(r.object.ingredients) ? r.object.vegSwap : null,
      sourceUrl: null,
      photo: null,
      personChanges: [],
    };
  }

  if (!draft.photo) {
    const source = opts.source ?? 'sites';
    try {
      const found = await searchRecipes(draft.name, source, opts.meter);
      const first = found.options[0];
      if (first) draft.photo = { url: first.image, credit: first.site, creditUrl: first.url };
    } catch {
      // A missing photo is fine; the meal can still be saved.
    }
  }
  return draft;
}
