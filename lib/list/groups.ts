import type { ListItem } from '@/lib/domain/list';
import type { Role } from '@/lib/domain/types';

export type GroupId = 'meat' | 'veg_protein' | 'produce' | 'dairy' | 'bakery' | 'frozen' | 'pantry' | 'other';

export interface Group {
  id: GroupId;
  title: string;
  roles: Role[];
}

/** The headings, in the order you walk the store. */
export const GROUPS: Group[] = [
  { id: 'meat', title: 'Meat and seafood', roles: ['meat', 'fish'] },
  { id: 'veg_protein', title: 'Beans and tofu', roles: ['veg_protein'] },
  { id: 'produce', title: 'Produce', roles: ['produce'] },
  { id: 'dairy', title: 'Dairy and eggs', roles: ['dairy'] },
  { id: 'bakery', title: 'Bakery', roles: ['bakery'] },
  { id: 'frozen', title: 'Frozen', roles: ['frozen'] },
  { id: 'pantry', title: 'Pantry', roles: ['pantry'] },
  { id: 'other', title: 'Other', roles: ['other'] },
];

export function groupFor(role: Role): Group {
  return GROUPS.find((g) => g.roles.includes(role)) ?? GROUPS[GROUPS.length - 1];
}

/** Items under their headings in shopping order; headings with nothing under them are left out. */
export function groupItems(items: ListItem[]): { id: GroupId; title: string; items: ListItem[] }[] {
  return GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    items: items.filter((i) => groupFor(i.role).id === g.id),
  })).filter((g) => g.items.length > 0);
}

/** What the staple editor calls each kind of food. */
export const ROLE_LABELS: Record<Role, string> = {
  meat: 'Meat',
  fish: 'Fish',
  veg_protein: 'Beans and tofu',
  produce: 'Produce',
  dairy: 'Dairy',
  bakery: 'Bakery',
  frozen: 'Frozen',
  pantry: 'Pantry',
  other: 'Other',
};

export const ROLES = Object.keys(ROLE_LABELS) as Role[];
