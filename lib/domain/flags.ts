import { familiesFor, matchFood } from './families';
import type { Meal, Person, PersonChange } from './types';
import { singular } from './words';

export interface Flag {
  kind: 'allergy' | 'dislike';
  food: string; // as the person listed it: 'tree nuts', 'mushrooms'
  found: string[]; // distinct matched ingredient words, in recipe order: ['almonds']
  often: boolean; // true only when every hit was an "often has"
  people: Person[]; // everyone who listed this food, in household order
}

export interface FlagCopy {
  cardHead: string | null;
  cardBody: string;
  head: string;
  body: string;
  pronoun: 'it' | 'them';
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "A", "A and B", "A, B and C". */
function joinAnd(list: string[]): string {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** "Daughter (4)" when another person shares the name (case-insensitive), else "Son". */
export function personLabel(p: Person, people: Person[]): string {
  const same = people.some((o) => o.id !== p.id && o.name.trim().toLowerCase() === p.name.trim().toLowerCase());
  return same ? `${p.name} (${p.age})` : p.name;
}

/** "Dad and Son"; "A, B and C". */
export function namesLabel(who: Person[], people: Person[]): string {
  return joinAnd(who.map((p) => personLabel(p, people)));
}

interface Hit { index: number; found: string; often: boolean }

function hitsFor(food: string, ingredients: string[], wide: boolean): Hit[] {
  const out: Hit[] = [];
  ingredients.forEach((line, index) => {
    const h = matchFood(food, line, { wide });
    if (h) out.push({ index, found: h.found, often: h.often });
  });
  return out;
}

interface Built { flag: Flag; first: number; hits: Hit[]; indexes: Set<number> }

const sameIds = (a: Person[], b: Person[]): boolean =>
  a.length === b.length && a.every((p) => b.some((o) => o.id === p.id));

/** Flags for the same people whose foods share a family ("tree nuts" and "almonds") become one, keeping the first food. */
function mergeSame(list: Built[], wide: boolean): Built[] {
  const out: Built[] = [];
  for (const b of list) {
    const ids = familiesFor(b.flag.food, { wide }).families.map((f) => f.id);
    const twin = out.find((o) => sameIds(o.flag.people, b.flag.people)
      && familiesFor(o.flag.food, { wide }).families.some((f) => ids.includes(f.id)));
    if (!twin) { out.push(b); continue; }
    const hits = [...twin.hits, ...b.hits].sort((x, y) => x.index - y.index);
    // Keep the food that covers more families ("eggs and dairy" over "milk"); on a tie, the first.
    const covers = (food: string): number => familiesFor(food, { wide }).families.length;
    const food = covers(b.flag.food) > covers(twin.flag.food) ? b.flag.food : twin.flag.food;
    twin.hits = hits;
    twin.first = hits[0].index;
    twin.indexes = new Set(hits.map((h) => h.index));
    twin.flag = {
      ...twin.flag,
      food,
      found: [...new Set(hits.map((h) => h.found))],
      often: hits.every((h) => h.often),
    };
  }
  return out;
}

/** True when a change names one of this person's allergies, in either direction ("almonds" for "tree nuts"). */
export function isAllergyChange(change: PersonChange, person: Person): boolean {
  return (person.allergies ?? []).some((a) => matchFood(a, change.food, { wide: true }) !== null
    || matchFood(change.food, a, { wide: true }) !== null);
}

/** Allergies first, then dislikes; within each, recipe order of the first hit. One flag per (kind, food). */
export function findFlags(ingredients: string[], people: Person[]): Flag[] {
  const build = (kind: Flag['kind']): Built[] => {
    const groups = new Map<string, { food: string; people: Person[] }>();
    for (const p of people) {
      for (const typed of (kind === 'allergy' ? p.allergies : p.dislikes) ?? []) {
        const key = norm(typed);
        if (!key) continue;
        const g = groups.get(key) ?? { food: key, people: [] };
        if (!g.people.includes(p)) g.people.push(p);
        groups.set(key, g);
      }
    }
    const out: Built[] = [];
    for (const g of groups.values()) {
      const hits = hitsFor(g.food, ingredients, kind === 'allergy');
      if (hits.length === 0) continue;
      out.push({
        flag: {
          kind,
          food: g.food,
          found: [...new Set(hits.map((h) => h.found))],
          often: hits.every((h) => h.often),
          people: g.people,
        },
        first: hits[0].index,
        hits,
        indexes: new Set(hits.map((h) => h.index)),
      });
    }
    return mergeSame(out, kind === 'allergy').sort((a, b) => a.first - b.first);
  };

  const allergies = build('allergy');
  // Everything one person is allergic to, by ingredient: their dislike of the same ingredient is not shown.
  const allergic = new Map<string, Set<number>>();
  for (const p of people) {
    const set = new Set<number>();
    for (const a of allergies) if (a.flag.people.includes(p)) a.indexes.forEach((i) => set.add(i));
    allergic.set(p.id, set);
  }
  const dislikes = build('dislike').flatMap((d) => {
    const left = d.flag.people.filter((p) => ![...d.indexes].some((i) => allergic.get(p.id)?.has(i)));
    return left.length === 0 ? [] : [{ ...d, flag: { ...d.flag, people: left } }];
  });
  return [...allergies, ...dislikes].map((x) => x.flag);
}

type Named = { ingredients: string[]; structured?: { canonical: string }[] | null };

/** What to check people's foods against: a meal's canonical names, its vegetarian swap and the foods people swapped in, or a recipe option's names. */
export function ingredientNames(src: Named | Meal): string[] {
  if ('vegSwap' in src) {
    const meal = src as Meal;
    const swappedIn = (meal.personChanges ?? []).flatMap((c) => (c.action === 'swap' && c.swap ? [c.swap.canonical] : []));
    return [...meal.ingredients.map((i) => i.canonical), ...(meal.vegSwap ? [meal.vegSwap.canonical] : []), ...swappedIn];
  }
  const o = src as Named;
  return o.structured && o.structured.length > 0 ? o.structured.map((s) => s.canonical) : o.ingredients;
}

/** "8 oz": the recipe's own amount of the first matching ingredient ("2" for unit 'each'); '' when none. */
export function flagAmount(meal: Meal, f: Flag): string {
  for (const line of meal.ingredients) {
    if (!matchFood(f.food, line.canonical, { wide: f.kind === 'allergy' })) continue;
    const n = String(Math.round(line.amount * 100) / 100);
    return line.unit === 'each' ? n : `${n} ${line.unit}`;
  }
  return '';
}

interface AllergyWords {
  key: string; // groups flags that name the same allergy
  label: string; // 'tree nut', 'sesame', or the typed word
  plural: string; // 'tree nuts'
  x: string; // what other ingredients "can have in them": 'nuts', 'milk'
}

// A food that spans several families ("eggs and dairy"), or reached them through an alias with extras of its
// own ("gluten"), keeps the words the person typed.
function allergyWords(food: string): AllergyWords {
  const { families, viaAlias } = familiesFor(food, { wide: true });
  if (families.length !== 1 || viaAlias) return { key: food, label: food, plural: food, x: food };
  const fam = families[0];
  const x = fam.id === 'tree_nut' ? 'nuts' : fam.id === 'peanut' ? 'peanuts' : fam.label;
  return { key: fam.id, label: fam.label, plural: fam.plural, x };
}

const isPlural = (text: string): boolean => {
  const last = text.split(' ').pop() ?? '';
  return last !== '' && singular(last) !== last;
};
const verb = (texts: string[]): 'has' | 'have' => (texts.length > 1 || isPlural(texts[0] ?? '') ? 'have' : 'has');

const pronounFor = (f: Flag): 'it' | 'them' => (isPlural(f.found[0] ?? '') ? 'them' : 'it');

const peopleList = (who: Person[], people: Person[]): string => who.map((p) => personLabel(p, people)).join(', ');

interface Group { w: AllergyWords; who: Person[]; entries: { text: string; often: boolean }[] }

function groupAllergies(flags: Flag[]): Group[] {
  const groups = new Map<string, Group>();
  for (const f of flags) {
    if (f.kind !== 'allergy') continue;
    const w = allergyWords(f.food);
    const g = groups.get(w.key) ?? { w, who: [], entries: [] };
    for (const p of f.people) if (!g.who.some((o) => o.id === p.id)) g.who.push(p);
    for (const text of f.found) {
      const seen = g.entries.find((e) => e.text === text);
      if (seen) seen.often = seen.often && f.often;
      else g.entries.push({ text, often: f.often });
    }
    groups.set(w.key, g);
  }
  return [...groups.values()];
}

export function allergyCopy(flags: Flag[], people: Person[]): { head: string; body: string } | null {
  const groups = groupAllergies(flags);
  for (const g of groups) g.who.sort((a, b) => people.findIndex((o) => o.id === a.id) - people.findIndex((o) => o.id === b.id));
  if (groups.length === 0) return null;
  const check = 'so check every label.';
  if (groups.length === 1) {
    const [g] = groups;
    const head = `${capital(g.w.label)} allergy: ${peopleList(g.who, people)}`;
    const texts = g.entries.map((e) => e.text);
    const often = g.entries.filter((e) => e.often).length;
    let lists: string;
    if (often === g.entries.length) {
      lists = `${joinAnd(texts)}, which often ${verb(texts)} ${g.w.x}`;
    } else if (often === 0) {
      lists = joinAnd(texts);
    } else {
      lists = joinAnd(g.entries.map((e) => (e.often ? `${e.text} (often ${verb([e.text])} ${g.w.x})` : e.text)));
    }
    return { head, body: `This recipe lists ${lists}. Other ingredients can have ${g.w.x} in them too, ${check}` };
  }
  const head = groups.map((g) => `${capital(g.w.label)} allergy: ${peopleList(g.who, people)}`).join(' · ');
  const lists = groups.flatMap((g) => g.entries.map((e) => (e.often ? `${e.text} (often ${verb([e.text])} ${g.w.x})` : e.text)));
  return { head, body: `This recipe lists ${joinAnd(lists)}. Other ingredients can have them too, ${check}` };
}

export function flagCopy(f: Flag, people: Person[], amount?: string): FlagCopy {
  const pronoun = pronounFor(f);
  if (f.kind === 'allergy') {
    const w = allergyWords(f.food);
    const box = allergyCopy([f], people) as { head: string; body: string };
    const cardBody = f.often
      ? `${capital(joinAnd(f.found))} often ${verb(f.found)} ${w.plural}. Check labels.`
      : `Lists ${joinAnd(f.found)}. Check labels.`;
    return { cardHead: box.head, cardBody, head: box.head, body: box.body, pronoun };
  }
  const who = namesLabel(f.people, people);
  const first = f.found[0] ?? f.food;
  const has = amount ? `${amount} ${first}` : first;
  const forWho = f.people.length === 1 ? who : 'them';
  return {
    cardHead: null,
    cardBody: `Has ${joinAnd(f.found)}. ${who} won’t eat ${pronoun}.`,
    head: `${who} won’t eat ${f.food}`,
    body: `This has ${has}. Change it just for ${forWho}?`,
    pronoun,
  };
}
