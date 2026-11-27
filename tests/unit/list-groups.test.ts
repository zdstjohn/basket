import { describe, expect, it } from "vitest";
import { GROUPS, groupFor, groupItems } from "@/lib/list/groups";
import type { ListItem } from "@/lib/domain/list";

const item = (canonical: string, role: ListItem['role']): ListItem => ({
  key: canonical, canonical, qty: { amount: 1, kind: 'count', base: 'each' }, parts: [{ amount: 1, kind: 'count', base: 'each' }], role,
  store: 'fred_meyer', estimateCents: 100, haveIt: false, alwaysHave: false, outsideBudget: false, sources: [],
});

describe('groups', () => {
  it('names the headings in shopping order', () => {
    expect(GROUPS.map((g) => g.title)).toEqual([
      'Meat and seafood', 'Beans and tofu', 'Produce', 'Dairy and eggs', 'Bakery', 'Frozen', 'Pantry', 'Other',
    ]);
  });
  it('puts meat and fish together', () => {
    expect(groupFor('meat').title).toBe('Meat and seafood');
    expect(groupFor('fish').title).toBe('Meat and seafood');
    expect(groupFor('veg_protein').title).toBe('Beans and tofu');
    expect(groupFor('dairy').title).toBe('Dairy and eggs');
  });
  it('groups items under their headings, in order, and skips empty groups', () => {
    const out = groupItems([item('salmon', 'fish'), item('onion', 'produce'), item('chicken', 'meat'), item('beans', 'veg_protein')]);
    expect(out.map((g) => g.title)).toEqual(['Meat and seafood', 'Beans and tofu', 'Produce']);
    expect(out[0].items.map((i) => i.canonical)).toEqual(['salmon', 'chicken']);
  });
  it('shows every item with no truncation', () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`veg ${i}`, 'produce'));
    expect(groupItems(many)[0].items).toHaveLength(40);
  });
});
