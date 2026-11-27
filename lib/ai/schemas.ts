import { z } from 'zod';
import type { PersonChange } from '@/lib/domain/types';

/** http(s) only: these become links other household members click. */
export const HttpUrlSchema = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      const p = new URL(u).protocol;
      return p === 'http:' || p === 'https:';
    } catch {
      return false;
    }
  }, 'must be an http(s) URL');

export const RoleSchema = z.enum([
  'meat', 'fish', 'veg_protein', 'produce', 'dairy', 'bakery', 'frozen', 'pantry', 'other',
]);

export const IngredientLineSchema = z.object({
  canonical: z.string().min(1).max(80),
  amount: z.number().positive(),
  unit: z.string().min(1).max(30),
  role: RoleSchema,
  note: z.string().max(120).optional(),
});

export const VegSwapSchema = z.object({
  canonical: z.string().min(1).max(80),
  amountPerServing: z.number().positive(),
  unit: z.string().min(1).max(30),
  role: RoleSchema,
});

/** One person's change to one food in a dinner. A swap carries the replacement food. */
export const PersonChangeSchema: z.ZodType<PersonChange> = z
  .object({
    personId: z.string().min(1).max(80),
    food: z.string().min(1).max(40),
    action: z.enum(['leave_out', 'swap']),
    swap: VegSwapSchema.optional(),
  })
  .refine((c) => c.action !== 'swap' || c.swap !== undefined, { message: 'a swap needs a swap food', path: ['swap'] });

export const RecipeDraftSchema = z.object({
  name: z.string().min(1).max(120),
  baseServings: z.number().min(1).max(24),
  ingredients: z.array(IngredientLineSchema).min(1).max(60),
  vegSwap: VegSwapSchema.nullable(),
  sourceUrl: HttpUrlSchema.nullable(),
  photo: z
    .object({ url: HttpUrlSchema, credit: z.string().max(120), creditUrl: HttpUrlSchema })
    .nullable(),
  // Who leaves out or swaps what. Set by the person in the draft, never by a model or a recipe page.
  personChanges: z.array(PersonChangeSchema).max(60).default([]),
});
export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

/** What the model returns for an ingredient list (and, when asked, a vegetarian swap). */
export const LinesResultSchema = z.object({
  ingredients: z.array(IngredientLineSchema).min(1).max(60),
  vegSwap: VegSwapSchema.nullable(),
});

export const VegSwapResultSchema = z.object({ vegSwap: VegSwapSchema.nullable() });

export const EstimateResultSchema = z.object({
  prices: z.array(z.object({ canonical: z.string(), centsPerBase: z.number().nonnegative() })),
});

/** A recipe option as the browser sends it back when a card is picked. Never trusted. */
export const RecipeOptionSchema = z.object({
  source: z.enum(['sites', 'spoonacular']),
  url: HttpUrlSchema,
  site: z.string().max(120),
  title: z.string().min(1).max(200),
  image: HttpUrlSchema,
  rating: z.number().nullable(),
  ratingCount: z.number().nullable(),
  likes: z.number().nullable().default(null), // older open tabs do not send it
  totalMinutes: z.number().nullable(),
  servings: z.number().nullable(),
  ingredients: z.array(z.string().max(300)).max(80),
  structured: z.array(IngredientLineSchema).max(60).nullable(),
});

export const SearchBodySchema = z.object({
  query: z.string().trim().min(1).max(120),
  source: z.enum(['sites', 'spoonacular']),
});

export const DraftBodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('option'), option: RecipeOptionSchema }),
  z.object({ mode: z.literal('text'), value: z.string().trim().min(1).max(20000) }),
]);

export const EstimatesBodySchema = z.object({
  items: z
    .array(
      z.object({
        canonical: z.string().min(1).max(80),
        qty: z.object({
          amount: z.number(),
          kind: z.enum(['mass', 'volume', 'count']),
          base: z.enum(['g', 'ml', 'each']),
          countUnit: z.string().optional(),
        }),
      }),
    )
    .max(120),
  store: z.enum(['fred_meyer', 'amazon', 'costco']),
});

/** Send products to the Fred Meyer cart. `quantity` is the wanted total for that product; prices come from the server's cache. */
export const CartBodySchema = z.object({
  weekId: z.string().uuid(),
  modality: z.enum(['PICKUP', 'DELIVERY']),
  lines: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        upc: z.string().regex(/^\d{13}$/),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(150)
    .refine((l) => new Set(l.map((x) => x.upc)).size === l.length, 'each product once'),
  resend: z.boolean(),
});

/** What the model sees in a photo of a dish. */
export const DishGuessSchema = z.object({
  isFood: z.boolean(),
  dish: z.string().max(80),
  searchQuery: z.string().max(80),
  keyIngredients: z.array(z.string().max(40)).max(8),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type DishGuess = z.infer<typeof DishGuessSchema>;

/** A photo (base64 JPEG, PNG or WebP; size and type are checked by the route) and where to look. */
export const IdentifyBodySchema = z.object({
  image: z.string().min(1),
  source: z.enum(['sites', 'spoonacular']),
});
